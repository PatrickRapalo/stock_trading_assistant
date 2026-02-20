/**
 * vae.js — VAE Anomaly Detection Module
 *
 * Loads a TensorFlow.js VAE encoder model from /vae/tfjs_encoder/model.json
 * plus /vae/scaler_params.json and /vae/vae_config.json, then exposes
 * window.VAE with four methods:
 *
 *   VAE.load()                      — loads model and configs, sets VAE.ready
 *   VAE.buildWindows(rawData, 20)   — returns 3-D sliding window array (N,20,7)
 *   VAE.calibrate(allWindows)       — sets 95th-pct threshold, returns stats
 *   VAE.score(window20x7)           — scores the most recent window
 *
 * Feature order (matches Python notebook exactly):
 *   [RSI14, MACD, MACD_Hist, BB_Position, Vol_Ratio, Momentum, SMA_Ratio]
 *
 * Assumptions / edge-case notes:
 *   - RSI14  : Wilder's smoothing (SMA seed then SMMA with α=1/14). Nulls for i<14.
 *   - MACD   : Standard EMA 12/26 (α=2/(n+1)), signal EMA 9. Nulls for i<~34.
 *   - MACD_Hist : macdLine − signalLine.
 *   - BB_Pos : (close−lower)/(upper−lower), period=20 stddev=2. Nulls for i<19.
 *   - Vol_Ratio : volume / SMA20(volume). Nulls for i<19.
 *   - Momentum  : 10-day pct change. Nulls for i<10.
 *   - SMA_Ratio : close/SMA50. Leading nulls (i<49) are filled with 1.0 (neutral)
 *                 rather than propagated, to avoid biasing the first windows.
 *   - All remaining nulls are forward-filled then backward-filled before windowing.
 *   - Model output auto-detected:
 *       [z_mean, z_log_var]  → KL divergence (encoder-only VAE)
 *       shape matches input  → MSE (full autoencoder)
 *       latent vector        → L2 norm
 */
window.VAE = (function () {
    'use strict';

    // ── Module state ───────────────────────────────────────────────────────────
    let _model       = null;
    let _scalerParams = null;   // { min: float[], scale: float[] }  — length 7
    let _vaeConfig   = null;
    let _ready       = false;
    let _threshold   = null;    // Last calibrated 95th-pct reconstruction error

    // ── Indicator helpers ──────────────────────────────────────────────────────

    /**
     * Standard EMA: α = 2/(period+1), seeded with the first observed value
     * (pandas ewm(span=period, adjust=False) behaviour).
     * Null/NaN values in `data` are skipped; the last EMA is propagated.
     */
    function _ema(data, period) {
        const alpha  = 2 / (period + 1);
        const result = new Array(data.length).fill(null);
        let ema = null;

        for (let i = 0; i < data.length; i++) {
            const v = data[i];
            if (v === null || v === undefined || isNaN(v)) {
                result[i] = ema;
                continue;
            }
            ema = (ema === null) ? v : v * alpha + ema * (1 - alpha);
            result[i] = ema;
        }
        return result;
    }

    /**
     * Wilder's RSI (matches pandas_ta rsi(length=14)).
     * α = 1/period — NOT the standard EMA 2/(n+1).
     * First avgGain/avgLoss are seeded with SMA(period); subsequent values use
     * Wilder's smoothed moving average: avg = (prev*(period-1) + current) / period.
     */
    function _rsiWilder(closes, period) {
        const n      = closes.length;
        const result = new Array(n).fill(null);
        if (n < period + 1) return result;

        const gains  = new Array(n - 1);
        const losses = new Array(n - 1);
        for (let i = 1; i < n; i++) {
            const d     = closes[i] - closes[i - 1];
            gains[i - 1]  = d > 0 ? d : 0;
            losses[i - 1] = d < 0 ? -d : 0;
        }

        // Seed with SMA of first `period` values
        let avgGain = 0, avgLoss = 0;
        for (let i = 0; i < period; i++) {
            avgGain += gains[i];
            avgLoss += losses[i];
        }
        avgGain /= period;
        avgLoss /= period;

        const toRsi = (g, l) => l < 1e-10 ? 100 : 100 - 100 / (1 + g / l);
        result[period] = toRsi(avgGain, avgLoss);

        for (let i = period; i < gains.length; i++) {
            avgGain = (avgGain * (period - 1) + gains[i]) / period;
            avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
            result[i + 1] = toRsi(avgGain, avgLoss);
        }
        return result;
    }

    /**
     * MACD 12 / 26 / 9 using standard EMA (2/(n+1)).
     * Signal EMA is computed over only the non-null MACD values then
     * re-aligned back to the original length.
     */
    function _computeMacd(closes) {
        const ema12 = _ema(closes, 12);
        const ema26 = _ema(closes, 26);

        const macdLine = closes.map((_, i) =>
            (ema12[i] !== null && ema26[i] !== null) ? ema12[i] - ema26[i] : null
        );

        // EMA(9) of non-null MACD values only
        const macdNonNull      = macdLine.filter(v => v !== null);
        const signalCompact    = _ema(macdNonNull, 9);
        const firstNonNullIdx  = macdLine.findIndex(v => v !== null);

        const signalLine = new Array(closes.length).fill(null);
        for (let k = 0; k < signalCompact.length; k++) {
            signalLine[firstNonNullIdx + k] = signalCompact[k];
        }

        const histogram = closes.map((_, i) =>
            (macdLine[i] !== null && signalLine[i] !== null)
                ? macdLine[i] - signalLine[i]
                : null
        );

        return { macdLine, signalLine, histogram };
    }

    /** Simple Moving Average (returns null for i < period−1). */
    function _sma(data, period) {
        const result = new Array(data.length).fill(null);
        for (let i = period - 1; i < data.length; i++) {
            let sum = 0;
            for (let j = i - period + 1; j <= i; j++) sum += data[j];
            result[i] = sum / period;
        }
        return result;
    }

    /**
     * Bollinger Bands: period=20, multiplier=2, population std-dev.
     * Returns { upper, lower, middle }.
     */
    function _bollingerBands(closes, period, multiplier) {
        const sma   = _sma(closes, period);
        const upper = new Array(closes.length).fill(null);
        const lower = new Array(closes.length).fill(null);

        for (let i = period - 1; i < closes.length; i++) {
            const slice    = closes.slice(i - period + 1, i + 1);
            const mean     = sma[i];
            const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
            const sd       = Math.sqrt(variance);
            upper[i] = mean + multiplier * sd;
            lower[i] = mean - multiplier * sd;
        }
        return { upper, lower, middle: sma };
    }

    // ── Feature matrix ─────────────────────────────────────────────────────────

    /**
     * Compute the (N, 7) raw feature matrix from OHLCV data.
     * Column order: RSI14, MACD, MACD_Hist, BB_Position, Vol_Ratio, Momentum, SMA_Ratio.
     * Many cells will be null for early rows; use _fillNulls() before windowing.
     */
    function _computeFeatureMatrix(rawData) {
        const closes  = rawData.map(d => d.close);
        const volumes = rawData.map(d => d.volume);
        const n       = closes.length;

        const rsi14          = _rsiWilder(closes, 14);
        const { macdLine, histogram } = _computeMacd(closes);
        const bb             = _bollingerBands(closes, 20, 2);
        const sma50          = _sma(closes, 50);
        const volSma20       = _sma(volumes, 20);

        const rows = [];
        for (let i = 0; i < n; i++) {
            // BB Position: (close − lower) / (upper − lower)
            let bbPos = null;
            if (bb.upper[i] !== null && bb.lower[i] !== null) {
                const rng = bb.upper[i] - bb.lower[i];
                bbPos = rng > 1e-10 ? (closes[i] - bb.lower[i]) / rng : 0.5;
            }

            // Volume ratio: volume / 20-day avg volume
            let volRatio = null;
            if (volSma20[i] !== null && volSma20[i] > 0) {
                volRatio = volumes[i] / volSma20[i];
            }

            // 10-day momentum percentage change
            let momentum = null;
            if (i >= 10 && closes[i - 10] > 0) {
                momentum = (closes[i] - closes[i - 10]) / closes[i - 10] * 100;
            }

            // SMA Ratio: close / SMA50
            // Leading nulls (i < 49) will be filled with 1.0 (neutral) in _fillNulls().
            let smaRatio = null;
            if (sma50[i] !== null && sma50[i] > 0) {
                smaRatio = closes[i] / sma50[i];
            }

            rows.push([
                rsi14[i],        // 0  RSI14
                macdLine[i],     // 1  MACD
                histogram[i],    // 2  MACD_Hist
                bbPos,           // 3  BB_Position
                volRatio,        // 4  Vol_Ratio
                momentum,        // 5  Momentum
                smaRatio         // 6  SMA_Ratio
            ]);
        }
        return rows;
    }

    /**
     * Fill nulls in the (N, 7) feature matrix:
     *   1. SMA_Ratio leading nulls → 1.0  (close == SMA50; neutral assumption)
     *   2. Forward-fill each column
     *   3. Backward-fill any remaining leading nulls (copies first valid value leftward)
     */
    function _fillNulls(features) {
        const n     = features.length;
        const numF  = 7;
        const filled = features.map(row => [...row]);

        // SMA_Ratio (col 6): replace leading nulls with 1.0 before general fill
        const SMA_COL = 6;
        for (let i = 0; i < n; i++) {
            if (filled[i][SMA_COL] !== null) break;
            filled[i][SMA_COL] = 1.0;
        }

        for (let f = 0; f < numF; f++) {
            // Forward fill
            let last = null;
            for (let i = 0; i < n; i++) {
                if (filled[i][f] !== null) {
                    last = filled[i][f];
                } else if (last !== null) {
                    filled[i][f] = last;
                }
            }
            // Backward fill remaining leading nulls
            for (let i = 0; i < n; i++) {
                if (filled[i][f] !== null) {
                    const first = filled[i][f];
                    for (let j = 0; j < i; j++) filled[j][f] = first;
                    break;
                }
            }
        }
        return filled;
    }

    // ── Scaling ────────────────────────────────────────────────────────────────

    /**
     * Apply per-feature MinMax scaling: scaled = (value − min[i]) / scale[i].
     * Result is clipped to [0, 1]. NaN (from zero-scale edge case) maps to 0.
     */
    function _scaleRow(row) {
        const mins   = _scalerParams.min;
        const scales = _scalerParams.scale;
        return row.map((v, i) => {
            if (scales[i] === 0) return 0;
            const s = (v - mins[i]) / scales[i];
            return Math.min(1, Math.max(0, isNaN(s) ? 0 : s));
        });
    }

    // ── Reconstruction error ───────────────────────────────────────────────────

    /**
     * Compute per-sample reconstruction errors for a batch.
     * Uses tensor.data() (async) for data extraction and pure JS for math,
     * creating zero intermediate TF.js tensors — fully immune to backend
     * state issues on the CPU fallback path.
     *
     * Supported output formats (auto-detected):
     *   Format A — [z_mean, z_log_var, ...]: first two tensors (batch, latent_dim)
     *              → per-sample normalised KL divergence
     *   Format B — single tensor same shape as input (batch, 20, 7)
     *              → per-sample MSE
     *   Format C — single tensor (batch, latent_dim) different shape
     *              → per-sample L2 norm
     *
     * @param {tf.Tensor} inputTensor  shape (batch, 20, 7)
     * @param {tf.Tensor|tf.Tensor[]} output  model prediction
     * @param {number} batchSize
     * @returns {Promise<number[]>}
     */
    async function _computeBatchErrors(inputTensor, output, batchSize) {
        if (Array.isArray(output) && output.length >= 2) {
            // ── Format A: [z_mean, z_log_var] → KL divergence (pure JS) ──────
            const latentDim   = output[0].shape[1] || 8;
            const zMeanFlat   = Array.from(await output[0].data());
            const zLogVarFlat = Array.from(await output[1].data());

            const errors = [];
            for (let b = 0; b < batchSize; b++) {
                let kl = 0;
                for (let d = 0; d < latentDim; d++) {
                    const idx = b * latentDim + d;
                    const mu  = zMeanFlat[idx]   || 0;
                    const lv  = Math.max(-10, Math.min(50, zLogVarFlat[idx] || 0));
                    kl += -0.5 * (1 + lv - mu * mu - Math.exp(lv));
                }
                errors.push(Math.max(0, kl / latentDim));
            }
            return errors;

        } else {
            const outTensor = Array.isArray(output) ? output[0] : output;
            const inpShape  = inputTensor.shape;    // [batch, 20, 7]
            const outShape  = outTensor.shape;
            const outFlat   = Array.from(await outTensor.data());
            const errors    = [];

            if (
                outShape.length === 3 &&
                outShape[1] === inpShape[1] &&
                outShape[2] === inpShape[2]
            ) {
                // ── Format B: same shape as input → MSE (pure JS) ─────────────
                const inpFlat = Array.from(await inputTensor.data());
                const step    = inpShape[1] * inpShape[2]; // 20 * 7 = 140
                for (let b = 0; b < batchSize; b++) {
                    let mse = 0;
                    for (let j = 0; j < step; j++) {
                        const d = (inpFlat[b * step + j] || 0) - (outFlat[b * step + j] || 0);
                        mse += d * d;
                    }
                    errors.push(Math.max(0, mse / step));
                }
            } else {
                // ── Format C: latent vector → L2 norm per sample (pure JS) ────
                const latentDim = outShape[1] || 8;
                for (let b = 0; b < batchSize; b++) {
                    let l2 = 0;
                    for (let d = 0; d < latentDim; d++) {
                        const v = outFlat[b * latentDim + d] || 0;
                        l2 += v * v;
                    }
                    errors.push(Math.max(0, Math.sqrt(l2)));
                }
            }
            return errors;
        }
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Load the TF.js encoder model and JSON configs from /vae/.
     * Fails silently if files are absent — check VAE.ready before using.
     */
    async function load() {
        try {
            // Force CPU backend before any tensor work to avoid the backend
            // mismatch that occurs when WebGL is unavailable and TF.js
            // silently switches mid-init, leaving tensors with stale references.
            await tf.setBackend('cpu');
            await tf.ready();

            try {
                _model = await tf.loadGraphModel('./vae/tfjs_encoder/model.json');
            } catch (e) {
                throw new Error('Model failed to load: ' + e.message);
            }

            const [scalerRes, configRes] = await Promise.all([
                fetch('./vae/scaler_params.json'),
                fetch('./vae/vae_config.json')
            ]);
            if (!scalerRes.ok) throw new Error('scaler_params.json not found (' + scalerRes.status + ')');
            if (!configRes.ok) throw new Error('vae_config.json not found (' + configRes.status + ')');

            _scalerParams = await scalerRes.json();
            _vaeConfig    = await configRes.json();
            _ready = true;
            console.log('[VAE] Ready — config:', _vaeConfig);
        } catch (err) {
            console.warn('[VAE] Load failed (model files may not be present yet):', err.message);
            _ready = false;
        }
    }

    /**
     * Build all sliding windows from raw OHLCV data.
     *
     * @param {Array<{date,open,high,low,close,volume}>} rawData  — tab.data
     * @param {number} [windowSize=20]
     * @returns {Array}  shape (N − windowSize + 1, windowSize, 7) — unscaled feature rows
     */
    function buildWindows(rawData, windowSize) {
        windowSize = windowSize || 20;
        const features = _computeFeatureMatrix(rawData);
        const filled   = _fillNulls(features);
        const windows  = [];
        for (let i = windowSize - 1; i < filled.length; i++) {
            windows.push(filled.slice(i - windowSize + 1, i + 1));
        }
        return windows;
    }

    /**
     * Calibrate the anomaly threshold for the current ticker.
     *
     * Runs all windows through the encoder, computes a reconstruction error for each,
     * and stores the 95th-percentile value as _threshold.
     *
     * @param {Array} allWindows  — output of buildWindows()
     * @returns {{ threshold: number, windowCount: number, isReliable: boolean }}
     */
    async function calibrate(allWindows) {
        if (!_ready || !_model) throw new Error('VAE not ready — call VAE.load() first');

        // Re-ensure CPU backend is active (may have changed since load())
        if (tf.getBackend() !== 'cpu') {
            console.warn('[VAE] Backend changed to', tf.getBackend(), '— re-setting to cpu');
            await tf.setBackend('cpu');
            await tf.ready();
        }

        const windowCount = allWindows.length;
        if (windowCount === 0) {
            _threshold = null;
            return { threshold: null, windowCount: 0, isReliable: false };
        }

        const allErrors = [];
        const batchSize = 32;

        for (let start = 0; start < windowCount; start += batchSize) {
            const chunk  = allWindows.slice(start, Math.min(start + batchSize, windowCount));
            const scaled = chunk.map(win => win.map(row => _scaleRow(row)));

            const inputTensor = tf.tensor3d(scaled);  // (chunkLen, 20, 7)
            let output;
            try {
                // Named input map + explicit output nodes required for LSTM graph models
                output = await _model.executeAsync(
                    { 'encoder_input': inputTensor },
                    ['Identity', 'Identity_1', 'Identity_2']
                );
                const batchErrors = await _computeBatchErrors(inputTensor, output, chunk.length);
                allErrors.push(...batchErrors);
            } finally {
                inputTensor.dispose();
                if (output) {
                    Array.isArray(output) ? output.forEach(t => t.dispose()) : output.dispose();
                }
            }

            // Yield to the browser every 8 batches (256 windows) to prevent UI freeze
            if ((start / batchSize) % 8 === 7) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        const sorted  = [...allErrors].sort((a, b) => a - b);
        const p95Idx  = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);
        _threshold    = sorted[p95Idx];

        return {
            threshold:  _threshold,
            windowCount,
            isReliable: windowCount >= 200
        };
    }

    /**
     * Score the most recent 20-day window against the calibrated threshold.
     * Must be called after calibrate().
     *
     * @param {Array} window20x7  — shape (20, 7), unscaled feature rows
     * @returns {{ reconError: number, confidence: number, isAnomaly: boolean, threshold: number }}
     */
    async function score(window20x7) {
        if (!_ready || !_model) throw new Error('VAE not ready');
        if (_threshold === null)  throw new Error('Call VAE.calibrate() before VAE.score()');

        // Re-ensure CPU backend is active
        if (tf.getBackend() !== 'cpu') {
            await tf.setBackend('cpu');
            await tf.ready();
        }

        const scaled      = window20x7.map(row => _scaleRow(row));
        const inputTensor = tf.tensor3d([scaled]);  // (1, 20, 7)
        let output;
        try {
            output = await _model.executeAsync(
                { 'encoder_input': inputTensor },
                ['Identity', 'Identity_1', 'Identity_2']
            );
            const errors    = await _computeBatchErrors(inputTensor, output, 1);
            const reconError = errors[0];
            const confidence = Math.min(1, Math.max(0, 1 - reconError / _threshold));
            const isAnomaly  = reconError > _threshold;
            return { reconError, confidence, isAnomaly, threshold: _threshold };
        } finally {
            inputTensor.dispose();
            if (output) {
                Array.isArray(output) ? output.forEach(t => t.dispose()) : output.dispose();
            }
        }
    }

    // ── Expose module ──────────────────────────────────────────────────────────
    return {
        get ready() { return _ready; },
        load,
        buildWindows,
        calibrate,
        score
    };
})();

// Auto-load on page start — fails silently if /vae/ files are not present yet.
VAE.load();
