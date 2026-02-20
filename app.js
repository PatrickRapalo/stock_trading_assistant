// AI Trading Assistant - Excel-Style Multi-Tab Application
console.log('Trading Assistant initialized');

// ==================== STATE MANAGEMENT ====================
let analysisTabs = {}; // Store all analysis data by tab ID
let activeTabId = null;
let tabCounter = 0;

// ==================== DATA FETCHING ====================
async function fetchStockData(ticker, range, interval) {
    // Different proxy configurations - some work better with/without encoding
    const proxyConfigs = [
        { url: 'https://corsproxy.io/?', encode: true },
        { url: 'https://api.allorigins.win/raw?url=', encode: true },
        { url: 'https://corsproxy.io/?url=', encode: true },
        { url: 'https://api.codetabs.com/v1/proxy?quest=', encode: true }
    ];

    // Try both query1 and query2 Yahoo endpoints
    const yahooHosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

    let lastError = null;
    let attemptCount = 0;

    for (const host of yahooHosts) {
        const yahooUrl = 'https://' + host + '/v8/finance/chart/' + ticker + '?interval=' + interval + '&range=' + range;

        for (let i = 0; i < proxyConfigs.length; i++) {
            attemptCount++;
            try {
                const config = proxyConfigs[i];
                const proxyUrl = config.encode
                    ? config.url + encodeURIComponent(yahooUrl)
                    : config.url + yahooUrl;

                console.log('Attempt ' + attemptCount + ': ' + config.url.substring(8, 30) + '... with ' + host);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);

                const response = await fetch(proxyUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Cache-Control': 'no-cache'
                    },
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }

                const text = await response.text();

                // Check if response looks like an error message instead of JSON
                if (!text || text.length < 50 || (!text.startsWith('{') && !text.startsWith('['))) {
                    throw new Error('Invalid response format');
                }

                const data = JSON.parse(text);

                if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
                    throw new Error('No data in response');
                }

                const result = data.chart.result[0];

                if (!result.timestamp || !result.indicators || !result.indicators.quote) {
                    throw new Error('Missing price data');
                }

                const timestamps = result.timestamp;
                const quotes = result.indicators.quote[0];

                const formattedData = timestamps.map(function(timestamp, index) {
                    return {
                        date: new Date(timestamp * 1000),
                        open: quotes.open[index],
                        high: quotes.high[index],
                        low: quotes.low[index],
                        close: quotes.close[index],
                        volume: quotes.volume[index]
                    };
                }).filter(function(d) {
                    return d.close !== null && d.close !== undefined;
                });

                if (formattedData.length < 10) {
                    throw new Error('Insufficient data points');
                }

                console.log('Success! Got ' + formattedData.length + ' data points');
                return formattedData;

            } catch (error) {
                const errMsg = error.name === 'AbortError' ? 'Timeout' : error.message;
                console.warn('Attempt ' + attemptCount + ' failed: ' + errMsg);
                lastError = error;

                // Brief delay between attempts
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
    }

    throw new Error('Unable to fetch ' + ticker + ' data for ' + range + '/' + interval + '. The free CORS proxies may be overloaded. Try the intraday timeframes which seem to work better.');
}

// ==================== TECHNICAL INDICATORS ====================
function calculateIndicators(data) {
    const closes = data.map(function(d) { return d.close; });
    const volumes = data.map(function(d) { return d.volume; });

    const sma20 = calculateSMA(closes, 20);
    const sma50 = calculateSMA(closes, 50);
    const rsi = calculateRSI(closes, 14);
    const macd = calculateMACD(closes);
    const bb = calculateBollingerBands(closes, 20, 2);

    const avgVolume = volumes.slice(-20).reduce(function(a, b) { return a + b; }, 0) / 20;
    const volumeRatio = volumes[volumes.length - 1] / avgVolume;
    const momentum = ((closes[closes.length - 1] - closes[closes.length - 5]) / closes[closes.length - 5]) * 100;

    return {
        currentPrice: closes[closes.length - 1],
        sma20: sma20[sma20.length - 1],
        sma50: sma50[sma50.length - 1],
        rsi: rsi[rsi.length - 1],
        macd: macd.macd[macd.macd.length - 1],
        macdSignal: macd.signal[macd.signal.length - 1],
        macdHistogram: macd.histogram[macd.histogram.length - 1],
        bbUpper: bb.upper[bb.upper.length - 1],
        bbMiddle: bb.middle[bb.middle.length - 1],
        bbLower: bb.lower[bb.lower.length - 1],
        volumeRatio: volumeRatio,
        momentum: momentum,
        closes: closes,
        sma20Full: sma20,
        sma50Full: sma50
    };
}

function calculateSMA(data, period) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            result.push(null);
        } else {
            const sum = data.slice(i - period + 1, i + 1).reduce(function(a, b) { return a + b; }, 0);
            result.push(sum / period);
        }
    }
    return result;
}

function calculateRSI(data, period) {
    const result = [];
    const gains = [];
    const losses = [];

    for (let i = 1; i < data.length; i++) {
        const change = data[i] - data[i - 1];
        gains.push(change > 0 ? change : 0);
        losses.push(change < 0 ? -change : 0);
    }

    for (let i = 0; i < gains.length; i++) {
        if (i < period - 1) {
            result.push(null);
        } else {
            const avgGain = gains.slice(i - period + 1, i + 1).reduce(function(a, b) { return a + b; }, 0) / period;
            const avgLoss = losses.slice(i - period + 1, i + 1).reduce(function(a, b) { return a + b; }, 0) / period;

            if (avgLoss === 0) {
                result.push(100);
            } else {
                const rs = avgGain / avgLoss;
                result.push(100 - (100 / (1 + rs)));
            }
        }
    }

    result.unshift(null);
    return result;
}

function calculateMACD(data, fastPeriod, slowPeriod, signalPeriod) {
    fastPeriod = fastPeriod || 12;
    slowPeriod = slowPeriod || 26;
    signalPeriod = signalPeriod || 9;

    const emaFast = calculateEMA(data, fastPeriod);
    const emaSlow = calculateEMA(data, slowPeriod);

    const macdLine = emaFast.map(function(fast, i) {
        return fast !== null && emaSlow[i] !== null ? fast - emaSlow[i] : null;
    });

    const signalLine = calculateEMA(macdLine.filter(function(v) { return v !== null; }), signalPeriod);
    const paddedSignal = new Array(macdLine.length - signalLine.length).fill(null).concat(signalLine);

    const histogram = macdLine.map(function(macd, i) {
        return macd !== null && paddedSignal[i] !== null ? macd - paddedSignal[i] : null;
    });

    return { macd: macdLine, signal: paddedSignal, histogram: histogram };
}

function calculateEMA(data, period) {
    const result = [];
    const multiplier = 2 / (period + 1);
    let ema = null;

    for (let i = 0; i < data.length; i++) {
        if (data[i] === null) {
            result.push(null);
            continue;
        }

        if (ema === null) {
            if (i >= period - 1) {
                const sum = data.slice(i - period + 1, i + 1)
                    .filter(function(v) { return v !== null; })
                    .reduce(function(a, b) { return a + b; }, 0);
                ema = sum / period;
            } else {
                result.push(null);
                continue;
            }
        } else {
            ema = (data[i] - ema) * multiplier + ema;
        }
        result.push(ema);
    }

    return result;
}

function calculateBollingerBands(data, period, stdDev) {
    period = period || 20;
    stdDev = stdDev || 2;

    const sma = calculateSMA(data, period);
    const upper = [];
    const lower = [];

    for (let i = 0; i < data.length; i++) {
        if (i < period - 1 || sma[i] === null) {
            upper.push(null);
            lower.push(null);
        } else {
            const slice = data.slice(i - period + 1, i + 1);
            const mean = sma[i];
            const variance = slice.reduce(function(sum, val) {
                return sum + Math.pow(val - mean, 2);
            }, 0) / period;
            const sd = Math.sqrt(variance);

            upper.push(mean + (sd * stdDev));
            lower.push(mean - (sd * stdDev));
        }
    }

    return { upper: upper, middle: sma, lower: lower };
}

// ==================== TRADING RULES & PREDICTION ====================
const tradingRules = {
    enabled: {
        movingAverages: true, rsi: true, macd: true,
        bollingerBands: true, volume: true, momentum: true
    },
    weights: {
        movingAverages: 2.0, rsi: 1.5, macd: 1.5,
        bollingerBands: 1.0, volume: 0.5, momentum: 1.0
    },
    thresholds: {
        rsiOversold: 30, rsiOverbought: 70, rsiNeutral: 50,
        volumeHigh: 1.5, volumeLow: 0.7, momentumStrong: 2,
        bbLowerZone: 0.2, bbUpperZone: 0.8
    },
    custom: {
        minimumVolumeRequired: true, minimumVolumeThreshold: 0.5,
        requireMultipleConfirmations: true, confirmationsNeeded: 3
    }
};

function predictDirection(indicators, vaeResult) {
    let score = 0;
    const reasons = [];
    let confirmations = 0;

    // Moving Averages
    if (tradingRules.enabled.movingAverages) {
        const weight = tradingRules.weights.movingAverages;
        if (indicators.currentPrice > indicators.sma20 && indicators.sma20 > indicators.sma50) {
            score += weight;
            confirmations++;
            reasons.push({
                indicator: 'Moving Averages',
                signal: 'BULLISH',
                weight: weight,
                description: 'Price ($' + indicators.currentPrice.toFixed(2) + ') above SMA20 ($' + indicators.sma20.toFixed(2) + ') and SMA50'
            });
        } else if (indicators.currentPrice < indicators.sma20 && indicators.sma20 < indicators.sma50) {
            score -= weight;
            confirmations++;
            reasons.push({
                indicator: 'Moving Averages',
                signal: 'BEARISH',
                weight: weight,
                description: 'Price below both moving averages, downward trend'
            });
        } else {
            reasons.push({
                indicator: 'Moving Averages',
                signal: 'NEUTRAL',
                weight: 0,
                description: 'Mixed signals, no clear trend direction'
            });
        }
    }

    // RSI
    if (tradingRules.enabled.rsi) {
        const weight = tradingRules.weights.rsi;
        if (indicators.rsi < tradingRules.thresholds.rsiOversold) {
            score += weight;
            confirmations++;
            reasons.push({
                indicator: 'RSI',
                signal: 'BULLISH',
                weight: weight,
                description: 'RSI ' + indicators.rsi.toFixed(1) + ' oversold, potential bounce'
            });
        } else if (indicators.rsi > tradingRules.thresholds.rsiOverbought) {
            score -= weight;
            confirmations++;
            reasons.push({
                indicator: 'RSI',
                signal: 'BEARISH',
                weight: weight,
                description: 'RSI ' + indicators.rsi.toFixed(1) + ' overbought, potential pullback'
            });
        } else if (indicators.rsi > tradingRules.thresholds.rsiNeutral) {
            score += weight / 3;
            reasons.push({
                indicator: 'RSI',
                signal: 'SLIGHTLY BULLISH',
                weight: weight / 3,
                description: 'RSI ' + indicators.rsi.toFixed(1) + ' above neutral'
            });
        } else {
            score -= weight / 3;
            reasons.push({
                indicator: 'RSI',
                signal: 'SLIGHTLY BEARISH',
                weight: weight / 3,
                description: 'RSI ' + indicators.rsi.toFixed(1) + ' below neutral'
            });
        }
    }

    // MACD
    if (tradingRules.enabled.macd) {
        const weight = tradingRules.weights.macd;
        if (indicators.macd > indicators.macdSignal && indicators.macdHistogram > 0) {
            score += weight;
            confirmations++;
            reasons.push({
                indicator: 'MACD',
                signal: 'BULLISH',
                weight: weight,
                description: 'MACD above signal line, positive momentum'
            });
        } else if (indicators.macd < indicators.macdSignal && indicators.macdHistogram < 0) {
            score -= weight;
            confirmations++;
            reasons.push({
                indicator: 'MACD',
                signal: 'BEARISH',
                weight: weight,
                description: 'MACD below signal line, negative momentum'
            });
        } else {
            reasons.push({
                indicator: 'MACD',
                signal: 'NEUTRAL',
                weight: 0,
                description: 'No strong directional signal'
            });
        }
    }

    // Bollinger Bands
    if (tradingRules.enabled.bollingerBands) {
        const weight = tradingRules.weights.bollingerBands;
        const bbPosition = (indicators.currentPrice - indicators.bbLower) / (indicators.bbUpper - indicators.bbLower);

        if (bbPosition < tradingRules.thresholds.bbLowerZone) {
            score += weight;
            reasons.push({
                indicator: 'Bollinger Bands',
                signal: 'BULLISH',
                weight: weight,
                description: 'Price near lower band, oversold'
            });
        } else if (bbPosition > tradingRules.thresholds.bbUpperZone) {
            score -= weight;
            reasons.push({
                indicator: 'Bollinger Bands',
                signal: 'BEARISH',
                weight: weight,
                description: 'Price near upper band, overbought'
            });
        } else {
            reasons.push({
                indicator: 'Bollinger Bands',
                signal: 'NEUTRAL',
                weight: 0,
                description: 'Price within normal range'
            });
        }
    }

    // Volume
    if (tradingRules.enabled.volume) {
        const weight = tradingRules.weights.volume;
        if (indicators.volumeRatio > tradingRules.thresholds.volumeHigh) {
            if (score > 0) {
                score += weight;
                reasons.push({
                    indicator: 'Volume',
                    signal: 'CONFIRMS BULLISH',
                    weight: weight,
                    description: 'High volume (' + (indicators.volumeRatio * 100).toFixed(0) + '%) confirms uptrend'
                });
            } else {
                score -= weight;
                reasons.push({
                    indicator: 'Volume',
                    signal: 'CONFIRMS BEARISH',
                    weight: weight,
                    description: 'High volume confirms downtrend'
                });
            }
        }
    }

    // Momentum
    if (tradingRules.enabled.momentum) {
        const weight = tradingRules.weights.momentum;
        if (indicators.momentum > tradingRules.thresholds.momentumStrong) {
            score += weight;
            confirmations++;
            reasons.push({
                indicator: 'Momentum',
                signal: 'BULLISH',
                weight: weight,
                description: 'Strong positive momentum +' + indicators.momentum.toFixed(2) + '%'
            });
        } else if (indicators.momentum < -tradingRules.thresholds.momentumStrong) {
            score -= weight;
            confirmations++;
            reasons.push({
                indicator: 'Momentum',
                signal: 'BEARISH',
                weight: weight,
                description: 'Strong negative momentum ' + indicators.momentum.toFixed(2) + '%'
            });
        }
    }

    // Custom rules
    if (tradingRules.custom.minimumVolumeRequired && indicators.volumeRatio < tradingRules.custom.minimumVolumeThreshold) {
        score = score * 0.5;
        reasons.push({
            indicator: 'Volume Check',
            signal: 'WARNING',
            weight: 0,
            description: 'Low volume reduces confidence'
        });
    }

    if (tradingRules.custom.requireMultipleConfirmations && confirmations < tradingRules.custom.confirmationsNeeded) {
        score = score * 0.7;
        reasons.push({
            indicator: 'Confirmations',
            signal: 'WARNING',
            weight: 0,
            description: 'Only ' + confirmations + '/' + tradingRules.custom.confirmationsNeeded + ' confirmations'
        });
    }

    // Determine direction
    let direction, confidence;
    const absScore = Math.abs(score);

    if (score >= 3) {
        direction = 'BULLISH';
        confidence = Math.min(95, 60 + (absScore * 5));
    } else if (score <= -3) {
        direction = 'BEARISH';
        confidence = Math.min(95, 60 + (absScore * 5));
    } else if (score > 0) {
        direction = 'SLIGHTLY BULLISH';
        confidence = 50 + (absScore * 5);
    } else if (score < 0) {
        direction = 'SLIGHTLY BEARISH';
        confidence = 50 + (absScore * 5);
    } else {
        direction = 'NEUTRAL';
        confidence = 40;
    }

    // VAE confidence scaling — applied after base confidence is computed
    // so that anomalous market states reduce confidence and optionally raise a warning.
    if (vaeResult) {
        confidence = confidence * vaeResult.confidence;
        if (vaeResult.isAnomaly) {
            reasons.push({
                indicator: 'VAE Anomaly Detector',
                signal: 'WARNING',
                weight: 0,
                description: 'Current market state is outside normal historical patterns for this ticker. Confidence reduced.'
            });
        }
    }

    let action = 'HOLD';
    if (direction === 'BULLISH' && confidence > 70) action = 'STRONG BUY';
    else if (direction === 'BULLISH') action = 'BUY';
    else if (direction === 'BEARISH' && confidence > 70) action = 'STRONG SELL';
    else if (direction === 'BEARISH') action = 'SELL';

    return {
        direction: direction,
        confidence: confidence.toFixed(1),
        score: score,
        confirmations: confirmations,
        reasons: reasons,
        action: action
    };
}

// ==================== PRICE PREDICTIONS ====================
function generatePricePredictions(indicators, numPeriods, vaeResult) {
    const predictions = [];
    const currentPrice = indicators.currentPrice;

    let momentumFactor = indicators.momentum / 100;
    let trendFactor = 0;

    if (indicators.currentPrice > indicators.sma20 && indicators.sma20 > indicators.sma50) {
        trendFactor = 0.002;
    } else if (indicators.currentPrice < indicators.sma20 && indicators.sma20 < indicators.sma50) {
        trendFactor = -0.002;
    }

    let rsiFactor = 0;
    if (indicators.rsi > 70) rsiFactor = -0.001;
    else if (indicators.rsi < 30) rsiFactor = 0.001;
    else rsiFactor = (indicators.rsi - 50) / 10000;

    let macdFactor = indicators.macdHistogram > 0 ? 0.001 : -0.001;
    let combinedFactor = momentumFactor * 0.02 + trendFactor + rsiFactor + macdFactor;

    let price = currentPrice;
    for (let i = 1; i <= numPeriods; i++) {
        const meanReversionFactor = (indicators.sma20 - price) * 0.01;
        const decay = 1 - (i * 0.05);
        const adjustment = (combinedFactor + meanReversionFactor) * decay;

        price = price * (1 + adjustment);

        const volatility = Math.abs(indicators.currentPrice - indicators.sma20) / indicators.sma20;
        const confidenceRange = vaeResult
            ? price * vaeResult.reconError * i * (1 + (1 - vaeResult.confidence))
            : price * volatility * i * 0.3;

        predictions.push({
            period: i,
            price: price,
            upper: price + confidenceRange,
            lower: price - confidenceRange
        });
    }

    return predictions;
}

// ==================== TAB MANAGEMENT ====================
window.addNewAnalysis = async function() {
    const ticker = document.getElementById('ticker').value;
    const timeframe = document.getElementById('timeframe').value;
    const parts = timeframe.split('|');
    const range = parts[0];
    const interval = parts[1];

    tabCounter++;
    const tabId = 'tab-' + tabCounter;

    // Create tab data structure
    analysisTabs[tabId] = {
        id: tabId,
        ticker: ticker,
        timeframe: timeframe,
        range: range,
        interval: interval,
        data: null,
        indicators: null,
        prediction: null,
        history: [],
        chart: null,
        predictionChart: null,
        currentSubTab: 'chart',
        simulatorState: {
            isPlaying: false,
            isPaused: false,
            speed: 200, // ms per candle
            currentIndex: 0,
            startIndex: 20, // minimum data points needed for indicators
            position: null, // { type: 'BUY'|'SELL', entryIndex, entryPrice }
            trades: [], // completed trades
            simChart: null,
            playInterval: null,
            isComplete: false
        }
    };

    // Create and add tab element
    createTabElement(tabId, ticker);

    // Switch to new tab
    switchToTab(tabId);

    // Load data
    await refreshTabData(tabId);
}

function createTabElement(tabId, ticker) {
    const tabsContainer = document.getElementById('analyticsTabs');

    const tab = document.createElement('div');
    tab.className = 'analytics-tab';
    tab.id = 'tab-btn-' + tabId;
    tab.innerHTML = `
        <span class="tab-signal neutral"></span>
        <span class="tab-ticker">${ticker}</span>
        <span class="close-tab" onclick="event.stopPropagation(); closeTab('${tabId}')">×</span>
    `;
    tab.onclick = function() { switchToTab(tabId); };

    tabsContainer.appendChild(tab);
}

window.switchToTab = function(tabId) {
    // Update active states
    document.querySelectorAll('.analytics-tab').forEach(function(tab) {
        tab.classList.remove('active');
    });
    document.getElementById('tab-btn-' + tabId).classList.add('active');

    activeTabId = tabId;

    // Render content
    renderTabContent(tabId);
}

window.retryTab = async function(tabId) {
    await refreshTabData(tabId);
}

window.closeTab = function(tabId) {
    // Remove tab button
    const tabBtn = document.getElementById('tab-btn-' + tabId);
    if (tabBtn) tabBtn.remove();

    // Clean up chart
    if (analysisTabs[tabId] && analysisTabs[tabId].chart) {
        analysisTabs[tabId].chart.remove();
    }

    // Delete tab data
    delete analysisTabs[tabId];

    // Switch to another tab or show empty state
    const remainingTabs = Object.keys(analysisTabs);
    if (remainingTabs.length > 0) {
        switchToTab(remainingTabs[0]);
    } else {
        activeTabId = null;
        document.getElementById('mainContent').innerHTML = `
            <div class="empty-state" id="emptyState">
                <div class="empty-state-icon">📊</div>
                <div class="empty-state-text">No Analysis Open</div>
                <div class="empty-state-hint">Select a stock and click "New Analysis" to begin</div>
            </div>
        `;
    }
}

// ==================== VAE CALIBRATION ====================
async function calibrateVAE(tab) {
    tab.vaeResult = null;
    try {
        if (!window.VAE || !window.VAE.ready) return;

        const allWindows = window.VAE.buildWindows(tab.data);
        const calibResult = await window.VAE.calibrate(allWindows);
        const scoreResult = await window.VAE.score(allWindows[allWindows.length - 1]);

        tab.vaeResult = {
            reconError:  scoreResult.reconError,
            confidence:  scoreResult.confidence,
            isAnomaly:   scoreResult.isAnomaly,
            threshold:   scoreResult.threshold,
            windowCount: calibResult.windowCount,
            isReliable:  calibResult.isReliable
        };
    } catch (err) {
        console.warn('[VAE] calibrateVAE failed silently:', err.message);
        tab.vaeResult = null;
    }
}

async function refreshTabData(tabId) {
    const tab = analysisTabs[tabId];
    if (!tab) return;

    setStatus('loading', 'Fetching ' + tab.ticker + ' data...');

    try {
        tab.data = await fetchStockData(tab.ticker, tab.range, tab.interval);

        if (tab.data.length < 20) {
            throw new Error('Not enough data points (' + tab.data.length + '). Try a different timeframe.');
        }

        tab.indicators = calculateIndicators(tab.data);

        setStatus('loading', 'Calibrating VAE...');
        await calibrateVAE(tab);

        tab.prediction = predictDirection(tab.indicators, tab.vaeResult);

        // Add to history
        tab.history.unshift({
            timestamp: new Date(),
            price: tab.indicators.currentPrice,
            direction: tab.prediction.direction,
            confidence: tab.prediction.confidence,
            score: tab.prediction.score
        });

        // Keep only last 50 history items
        if (tab.history.length > 50) tab.history.pop();

        // Update tab signal indicator
        updateTabSignal(tabId, tab.prediction.direction);

        // Re-render if this is the active tab
        if (activeTabId === tabId) {
            renderTabContent(tabId);
        }

        setStatus('ready', 'Updated ' + tab.ticker);
        document.getElementById('lastUpdate').textContent = 'Last: ' + new Date().toLocaleTimeString();

    } catch (error) {
        console.error('Error:', error);
        setStatus('error', error.message);

        if (activeTabId === tabId) {
            document.getElementById('mainContent').innerHTML = `
                <div class="chart-area">
                    <div class="sub-tab-content" style="display: flex; align-items: center; justify-content: center;">
                        <div class="decision-card" style="max-width: 500px;">
                            <div class="decision-header" style="background: rgba(255,71,87,0.2);">
                                <span style="color: var(--accent-red);">Error loading ${tab.ticker} data</span>
                            </div>
                            <div class="decision-body">
                                <p style="margin-bottom: 16px;">${error.message}</p>
                                <button onclick="retryTab('${tabId}')" class="toolbar-btn" style="margin-right: 8px;">Retry</button>
                                <button onclick="closeTab('${tabId}')" class="toolbar-btn secondary">Close Tab</button>
                                <p style="margin-top: 16px; color: var(--text-muted); font-size: 0.9em;">Tip: Intraday timeframes (Today - 2 Min, Today - 5 Min) often work better with free proxies.</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }
}

function updateTabSignal(tabId, direction) {
    const tabBtn = document.getElementById('tab-btn-' + tabId);
    if (!tabBtn) return;

    const signal = tabBtn.querySelector('.tab-signal');
    signal.className = 'tab-signal';

    if (direction.indexOf('BULLISH') !== -1) {
        signal.classList.add('bullish');
    } else if (direction.indexOf('BEARISH') !== -1) {
        signal.classList.add('bearish');
    } else {
        signal.classList.add('neutral');
    }
}

function setStatus(status, text) {
    const indicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');

    indicator.className = 'status-indicator';
    if (status === 'loading') indicator.classList.add('loading');

    statusText.textContent = text;
}

// ==================== RENDERING ====================
function renderTabContent(tabId) {
    const tab = analysisTabs[tabId];
    if (!tab || !tab.data) {
        document.getElementById('mainContent').innerHTML = `
            <div class="chart-area">
                <div class="loading-overlay">
                    <div class="spinner"></div>
                    <div class="loading-text">Loading ${tab ? tab.ticker : ''} data...</div>
                </div>
            </div>
        `;
        return;
    }

    const mainContent = document.getElementById('mainContent');
    mainContent.innerHTML = `
        <div class="chart-area">
            <div class="sub-tabs">
                <div class="sub-tab ${tab.currentSubTab === 'chart' ? 'active' : ''}" onclick="switchSubTab('${tabId}', 'chart')">Chart</div>
                <div class="sub-tab ${tab.currentSubTab === 'history' ? 'active' : ''}" onclick="switchSubTab('${tabId}', 'history')">History</div>
                <div class="sub-tab ${tab.currentSubTab === 'decision' ? 'active' : ''}" onclick="switchSubTab('${tabId}', 'decision')">AI Decision</div>
                <div class="sub-tab ${tab.currentSubTab === 'predictions' ? 'active' : ''}" onclick="switchSubTab('${tabId}', 'predictions')">Predictions</div>
                <div class="sub-tab ${tab.currentSubTab === 'simulator' ? 'active' : ''}" onclick="switchSubTab('${tabId}', 'simulator')">Simulator</div>
            </div>
            <div class="sub-tab-content">
                <div id="panel-chart" class="sub-tab-panel ${tab.currentSubTab === 'chart' ? 'active' : ''}"></div>
                <div id="panel-history" class="sub-tab-panel ${tab.currentSubTab === 'history' ? 'active' : ''}"></div>
                <div id="panel-decision" class="sub-tab-panel ${tab.currentSubTab === 'decision' ? 'active' : ''}"></div>
                <div id="panel-predictions" class="sub-tab-panel ${tab.currentSubTab === 'predictions' ? 'active' : ''}"></div>
                <div id="panel-simulator" class="sub-tab-panel ${tab.currentSubTab === 'simulator' ? 'active' : ''}"></div>
            </div>
        </div>
    `;

    renderChartPanel(tab);
    renderHistoryPanel(tab);
    renderDecisionPanel(tab);
    renderPredictionsPanel(tab);
    renderSimulatorPanel(tab);
}

window.switchSubTab = function(tabId, subTab) {
    const tab = analysisTabs[tabId];
    if (!tab) return;

    tab.currentSubTab = subTab;

    // Update sub-tab buttons
    document.querySelectorAll('.sub-tab').forEach(function(st) {
        st.classList.remove('active');
    });
    event.target.classList.add('active');

    // Update panels
    document.querySelectorAll('.sub-tab-panel').forEach(function(panel) {
        panel.classList.remove('active');
    });
    document.getElementById('panel-' + subTab).classList.add('active');

    // Re-render charts if needed
    if (subTab === 'chart') {
        setTimeout(function() { renderMainChart(tab); }, 50);
    } else if (subTab === 'predictions') {
        setTimeout(function() { renderPredictionChartCanvas(tab); }, 50);
    }
}

function renderChartPanel(tab) {
    const panel = document.getElementById('panel-chart');
    const directionClass = tab.prediction.direction.indexOf('BULLISH') !== -1 ? 'positive' :
                          tab.prediction.direction.indexOf('BEARISH') !== -1 ? 'negative' : '';

    panel.innerHTML = `
        <div class="chart-type-buttons">
            <button class="chart-type-btn active" onclick="changeChartType('${tab.id}', 'candlestick')">Candlestick</button>
            <button class="chart-type-btn" onclick="changeChartType('${tab.id}', 'line')">Line</button>
            <button class="chart-type-btn" onclick="changeChartType('${tab.id}', 'area')">Area</button>
            <span style="margin-left: auto; display: flex; align-items: center; gap: 8px;">
                <button class="chart-type-btn" onclick="downloadCSV('${tab.id}')" style="font-size: 0.8em;">Download CSV</button>
                <button class="chart-type-btn" onclick="downloadVAEJson('${tab.id}')" style="font-size: 0.8em; background: #22c55e; color: #fff; border-color: #22c55e;">Export VAE JSON</button>
                <span style="color: var(--text-muted); font-size: 0.85em;">Scroll to zoom | Drag to pan</span>
            </span>
        </div>
        <div class="chart-container">
            <div id="mainChart-${tab.id}" style="width: 100%; height: 100%;"></div>
        </div>
        <div class="metrics-row">
            <div class="metric-cell">
                <div class="metric-value">$${tab.indicators.currentPrice.toFixed(2)}</div>
                <div class="metric-label">Current Price</div>
            </div>
            <div class="metric-cell">
                <div class="metric-value ${directionClass}">${tab.prediction.direction}</div>
                <div class="metric-label">AI Signal</div>
            </div>
            <div class="metric-cell">
                <div class="metric-value">${tab.prediction.confidence}%</div>
                <div class="metric-label">Confidence</div>
            </div>
            <div class="metric-cell">
                <div class="metric-value">${tab.indicators.rsi.toFixed(1)}</div>
                <div class="metric-label">RSI</div>
            </div>
            <div class="metric-cell">
                <div class="metric-value ${tab.indicators.momentum > 0 ? 'positive' : 'negative'}">${tab.indicators.momentum > 0 ? '+' : ''}${tab.indicators.momentum.toFixed(2)}%</div>
                <div class="metric-label">Momentum</div>
            </div>
            <div class="metric-cell">
                <div class="metric-value">${(tab.indicators.volumeRatio * 100).toFixed(0)}%</div>
                <div class="metric-label">Vol vs Avg</div>
            </div>
        </div>
    `;

    setTimeout(function() { renderMainChart(tab); }, 50);
}

function renderMainChart(tab) {
    const container = document.getElementById('mainChart-' + tab.id);
    if (!container) return;

    // Clear existing chart
    if (tab.chart) {
        tab.chart.remove();
        tab.chart = null;
    }

    // Create dark theme chart
    tab.chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight || 400,
        layout: {
            background: { color: '#1e2746' },
            textColor: '#b0b3b8',
        },
        grid: {
            vertLines: { color: '#2d3a5a' },
            horzLines: { color: '#2d3a5a' },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
        },
        rightPriceScale: {
            borderColor: '#2d3a5a',
        },
        timeScale: {
            borderColor: '#2d3a5a',
            timeVisible: true,
            secondsVisible: false,
        },
    });

    // Add candlestick series
    tab.candleSeries = tab.chart.addCandlestickSeries({
        upColor: '#00d26a',
        downColor: '#ff4757',
        borderVisible: false,
        wickUpColor: '#00d26a',
        wickDownColor: '#ff4757',
    });

    const candleData = tab.data.map(function(d) {
        return {
            time: d.date.getTime() / 1000,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close
        };
    });

    tab.candleSeries.setData(candleData);

    // Add SMA lines
    const sma20Series = tab.chart.addLineSeries({
        color: '#ffc107',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
    });

    const sma20Data = [];
    for (let i = 0; i < tab.data.length; i++) {
        if (tab.indicators.sma20Full[i] !== null) {
            sma20Data.push({
                time: tab.data[i].date.getTime() / 1000,
                value: tab.indicators.sma20Full[i]
            });
        }
    }
    sma20Series.setData(sma20Data);

    const sma50Series = tab.chart.addLineSeries({
        color: '#4a9eff',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
    });

    const sma50Data = [];
    for (let i = 0; i < tab.data.length; i++) {
        if (tab.indicators.sma50Full[i] !== null) {
            sma50Data.push({
                time: tab.data[i].date.getTime() / 1000,
                value: tab.indicators.sma50Full[i]
            });
        }
    }
    sma50Series.setData(sma50Data);

    tab.chart.timeScale().fitContent();

    // Handle resize
    const resizeObserver = new ResizeObserver(function() {
        if (tab.chart && container.clientWidth > 0) {
            tab.chart.applyOptions({ width: container.clientWidth, height: container.clientHeight || 400 });
        }
    });
    resizeObserver.observe(container);
}

window.changeChartType = function(tabId, type) {
    const tab = analysisTabs[tabId];
    if (!tab || !tab.chart) return;

    // Update buttons
    document.querySelectorAll('.chart-type-btn').forEach(function(btn) {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // Remove existing series
    if (tab.candleSeries) {
        tab.chart.removeSeries(tab.candleSeries);
        tab.candleSeries = null;
    }
    if (tab.lineSeries) {
        tab.chart.removeSeries(tab.lineSeries);
        tab.lineSeries = null;
    }
    if (tab.areaSeries) {
        tab.chart.removeSeries(tab.areaSeries);
        tab.areaSeries = null;
    }

    if (type === 'candlestick') {
        tab.candleSeries = tab.chart.addCandlestickSeries({
            upColor: '#00d26a',
            downColor: '#ff4757',
            borderVisible: false,
            wickUpColor: '#00d26a',
            wickDownColor: '#ff4757',
        });

        const candleData = tab.data.map(function(d) {
            return {
                time: d.date.getTime() / 1000,
                open: d.open, high: d.high, low: d.low, close: d.close
            };
        });
        tab.candleSeries.setData(candleData);

    } else if (type === 'line') {
        tab.lineSeries = tab.chart.addLineSeries({
            color: '#4a9eff',
            lineWidth: 2,
        });

        const lineData = tab.data.map(function(d) {
            return { time: d.date.getTime() / 1000, value: d.close };
        });
        tab.lineSeries.setData(lineData);

    } else if (type === 'area') {
        tab.areaSeries = tab.chart.addAreaSeries({
            topColor: 'rgba(74, 158, 255, 0.4)',
            bottomColor: 'rgba(74, 158, 255, 0.0)',
            lineColor: '#4a9eff',
            lineWidth: 2,
        });

        const areaData = tab.data.map(function(d) {
            return { time: d.date.getTime() / 1000, value: d.close };
        });
        tab.areaSeries.setData(areaData);
    }
}

function renderHistoryPanel(tab) {
    const panel = document.getElementById('panel-history');

    if (tab.history.length === 0) {
        panel.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                <p>No history yet. Analysis history will appear here.</p>
            </div>
        `;
        return;
    }

    let rows = tab.history.map(function(h) {
        const directionClass = h.direction.indexOf('BULLISH') !== -1 ? 'bullish' :
                              h.direction.indexOf('BEARISH') !== -1 ? 'bearish' : 'neutral';
        return `
            <tr>
                <td>${h.timestamp.toLocaleTimeString()}</td>
                <td>$${h.price.toFixed(2)}</td>
                <td><span class="reason-signal ${directionClass}">${h.direction}</span></td>
                <td>${h.confidence}%</td>
                <td>${h.score.toFixed(1)}</td>
            </tr>
        `;
    }).join('');

    panel.innerHTML = `
        <div style="overflow: auto; flex: 1;">
            <table class="history-table">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Price</th>
                        <th>Signal</th>
                        <th>Confidence</th>
                        <th>Score</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
        <div class="disclaimer">
            History shows all analysis snapshots during this session. Each refresh adds a new entry.
        </div>
    `;
}

function renderDecisionPanel(tab) {
    const panel = document.getElementById('panel-decision');
    const p = tab.prediction;

    const directionClass = p.direction.indexOf('BULLISH') !== -1 ? 'bullish' :
                          p.direction.indexOf('BEARISH') !== -1 ? 'bearish' : 'neutral';

    let reasonsHTML = p.reasons.map(function(r) {
        const rClass = r.signal.indexOf('BULLISH') !== -1 ? 'bullish' :
                      r.signal.indexOf('BEARISH') !== -1 ? 'bearish' : 'neutral';
        return `
            <div class="reason-item ${rClass}">
                <div class="reason-header">
                    <span class="reason-indicator">${r.indicator}</span>
                    <span class="reason-signal ${rClass}">${r.signal}</span>
                </div>
                <div class="reason-description">${r.description}</div>
            </div>
        `;
    }).join('');

    // VAE status badge — shown only when VAE calibration succeeded
    let vaeBadgeHTML = '';
    if (tab.vaeResult) {
        const vr = tab.vaeResult;
        const anomalyColor = vr.isAnomaly ? 'var(--accent-red)' : 'var(--accent-green)';
        const anomalyLabel = vr.isAnomaly ? 'ANOMALY DETECTED' : 'Normal';
        const reliabilityWarning = !vr.isReliable
            ? `<div style="color: var(--accent-yellow); margin-top: 8px; font-size: 0.85em;">
                   &#9888; Calibrated on fewer than 200 windows — less reliable on short timeframes.
               </div>`
            : '';
        vaeBadgeHTML = `
            <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-left: 3px solid var(--accent-purple); border-radius: 0 6px 6px 0; padding: 12px 16px; margin-bottom: 16px;">
                <div style="font-size: 0.8em; color: var(--accent-purple); font-weight: 600; margin-bottom: 8px; letter-spacing: 0.5px; text-transform: uppercase;">VAE Anomaly Detector</div>
                <div style="display: flex; gap: 20px; flex-wrap: wrap; font-size: 0.88em;">
                    <span style="color: var(--text-secondary);">Recon error: <strong style="color: var(--text-primary);">${vr.reconError.toFixed(4)}</strong></span>
                    <span style="color: var(--text-secondary);">Confidence: <strong style="color: var(--accent-purple);">${(vr.confidence * 100).toFixed(1)}%</strong></span>
                    <span style="color: var(--text-secondary);">Status: <strong style="color: ${anomalyColor};">${anomalyLabel}</strong></span>
                    <span style="color: var(--text-secondary);">Windows: <strong style="color: var(--text-primary);">${vr.windowCount}</strong></span>
                </div>
                ${reliabilityWarning}
            </div>
        `;
    }

    panel.innerHTML = `
        <div class="decision-card">
            <div class="decision-header">
                <div>
                    <div style="font-size: 0.9em; color: var(--text-muted); margin-bottom: 4px;">${tab.ticker} Analysis</div>
                    <div class="decision-direction ${directionClass}">${p.direction}</div>
                </div>
                <div style="text-align: right;">
                    <div class="decision-confidence">${p.confidence}%</div>
                    <div style="font-size: 0.9em; color: var(--text-muted);">Confidence</div>
                </div>
            </div>
            <div class="decision-body">
                <div style="background: var(--bg-tertiary); padding: 12px 16px; border-radius: 6px; margin-bottom: 16px;">
                    <span style="font-weight: 600; color: var(--accent-blue);">Recommendation: ${p.action}</span>
                    <span style="color: var(--text-muted); margin-left: 12px;">Score: ${p.score.toFixed(1)} | ${p.confirmations} confirmations</span>
                </div>
                ${vaeBadgeHTML}
                <h4 style="margin-bottom: 12px; color: var(--text-secondary);">Indicator Analysis</h4>
                ${reasonsHTML}
            </div>
        </div>
        <div class="disclaimer">
            This AI analysis is for educational purposes only. Do not use for actual trading decisions.
        </div>
    `;
}

function renderPredictionsPanel(tab) {
    const panel = document.getElementById('panel-predictions');
    const predictions = generatePricePredictions(tab.indicators, 10, tab.vaeResult);

    const lastPred = predictions[predictions.length - 1];
    const pctChange = ((lastPred.price - tab.indicators.currentPrice) / tab.indicators.currentPrice * 100);
    const changeClass = pctChange > 0 ? 'positive' : pctChange < 0 ? 'negative' : '';

    panel.innerHTML = `
        <div class="prediction-chart-container">
            <canvas id="predChart-${tab.id}"></canvas>
        </div>
        <div class="prediction-summary">
            <div class="prediction-card">
                <h4>Current Price</h4>
                <div class="value">$${tab.indicators.currentPrice.toFixed(2)}</div>
            </div>
            <div class="prediction-card">
                <h4>10-Period Prediction</h4>
                <div class="value ${changeClass}">$${lastPred.price.toFixed(2)}</div>
            </div>
            <div class="prediction-card">
                <h4>Expected Change</h4>
                <div class="value ${changeClass}">${pctChange > 0 ? '+' : ''}${pctChange.toFixed(2)}%</div>
            </div>
            <div class="prediction-card">
                <h4>Confidence Range</h4>
                <div class="value" style="font-size: 1em;">$${lastPred.lower.toFixed(2)} - $${lastPred.upper.toFixed(2)}</div>
            </div>
        </div>
        <div class="disclaimer">
            Predictions are based on technical indicators and historical patterns. Actual results may vary significantly.
        </div>
    `;

    setTimeout(function() { renderPredictionChartCanvas(tab); }, 50);
}

function renderPredictionChartCanvas(tab) {
    const canvas = document.getElementById('predChart-' + tab.id);
    if (!canvas) return;

    const predictions = generatePricePredictions(tab.indicators, 10, tab.vaeResult);

    const labels = ['Now'];
    const predictedPrices = [tab.indicators.currentPrice];
    const upperBound = [tab.indicators.currentPrice];
    const lowerBound = [tab.indicators.currentPrice];

    predictions.forEach(function(pred) {
        labels.push('T+' + pred.period);
        predictedPrices.push(pred.price);
        upperBound.push(pred.upper);
        lowerBound.push(pred.lower);
    });

    // Destroy existing chart
    if (tab.predictionChart) {
        tab.predictionChart.destroy();
    }

    tab.predictionChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Predicted Price',
                    data: predictedPrices,
                    borderColor: '#a855f7',
                    backgroundColor: 'rgba(168, 85, 247, 0.1)',
                    borderWidth: 3,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 4,
                    pointBackgroundColor: '#a855f7'
                },
                {
                    label: 'Upper Bound',
                    data: upperBound,
                    borderColor: 'rgba(0, 210, 106, 0.4)',
                    backgroundColor: 'rgba(0, 210, 106, 0.05)',
                    borderWidth: 1,
                    borderDash: [4, 4],
                    tension: 0.3,
                    fill: '+1',
                    pointRadius: 0
                },
                {
                    label: 'Lower Bound',
                    data: lowerBound,
                    borderColor: 'rgba(255, 71, 87, 0.4)',
                    backgroundColor: 'rgba(255, 71, 87, 0.05)',
                    borderWidth: 1,
                    borderDash: [4, 4],
                    tension: 0.3,
                    fill: '-1',
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { color: '#b0b3b8' }
                }
            },
            scales: {
                x: {
                    grid: { color: '#2d3a5a' },
                    ticks: { color: '#b0b3b8' }
                },
                y: {
                    grid: { color: '#2d3a5a' },
                    ticks: {
                        color: '#b0b3b8',
                        callback: function(value) {
                            return '$' + value.toFixed(2);
                        }
                    }
                }
            }
        }
    });
}

// ==================== LIVE TRADE SIMULATOR ====================
function renderSimulatorPanel(tab) {
    const panel = document.getElementById('panel-simulator');
    if (!panel) return;

    const sim = tab.simulatorState;
    const dataLength = tab.data.length;

    // Get current visible data
    const visibleData = tab.data.slice(0, sim.currentIndex + 1);
    const currentCandle = visibleData.length > 0 ? visibleData[visibleData.length - 1] : null;
    const prevCandle = visibleData.length > 1 ? visibleData[visibleData.length - 2] : null;

    // Calculate current indicators if we have enough data
    let currentIndicators = null;
    let currentPrediction = null;
    if (visibleData.length >= 20) {
        currentIndicators = calculateIndicators(visibleData);
        currentPrediction = predictDirection(currentIndicators);
    }

    // Price change display
    let priceChangeHTML = '';
    if (currentCandle && prevCandle) {
        const change = currentCandle.close - prevCandle.close;
        const changePct = (change / prevCandle.close) * 100;
        const changeClass = change >= 0 ? 'up' : 'down';
        priceChangeHTML = `<span class="sim-price-change ${changeClass}">${change >= 0 ? '+' : ''}${changePct.toFixed(2)}%</span>`;
    }

    // Position P&L
    let positionHTML = '';
    if (sim.position) {
        const currentPrice = currentCandle ? currentCandle.close : sim.position.entryPrice;
        const pnl = sim.position.type === 'BUY'
            ? ((currentPrice - sim.position.entryPrice) / sim.position.entryPrice) * 100
            : ((sim.position.entryPrice - currentPrice) / sim.position.entryPrice) * 100;
        const pnlClass = pnl >= 0 ? 'profit' : 'loss';
        positionHTML = `
            <div class="sim-open-position">
                <div class="position-type">${sim.position.type} Position Open</div>
                <div class="position-details">
                    <span class="position-entry">Entry: $${sim.position.entryPrice.toFixed(2)}</span>
                    <span class="position-pnl ${pnlClass}">${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%</span>
                </div>
            </div>
        `;
    }

    // Status badge
    let statusBadge = '';
    if (sim.isComplete) {
        statusBadge = '<span class="sim-status-badge completed"><span class="dot"></span>Simulation Complete</span>';
    } else if (sim.position) {
        statusBadge = '<span class="sim-status-badge in-position"><span class="dot"></span>Position Open</span>';
    } else if (sim.isPlaying) {
        statusBadge = '<span class="sim-status-badge waiting"><span class="dot"></span>Watching Market...</span>';
    }

    // Progress
    const progress = ((sim.currentIndex - sim.startIndex) / (dataLength - 1 - sim.startIndex)) * 100;

    // Indicators mini display
    let indicatorsHTML = '';
    if (currentIndicators) {
        const rsiClass = currentIndicators.rsi > 70 ? 'negative' : currentIndicators.rsi < 30 ? 'positive' : '';
        const momentumClass = currentIndicators.momentum > 0 ? 'positive' : 'negative';
        indicatorsHTML = `
            <div class="sim-indicators-mini">
                <div class="sim-indicator-mini">
                    <div class="value ${rsiClass}">${currentIndicators.rsi.toFixed(1)}</div>
                    <div class="label">RSI</div>
                </div>
                <div class="sim-indicator-mini">
                    <div class="value ${momentumClass}">${currentIndicators.momentum > 0 ? '+' : ''}${currentIndicators.momentum.toFixed(2)}%</div>
                    <div class="label">Momentum</div>
                </div>
            </div>
        `;
    }

    // Final results
    let finalResultsHTML = '';
    if (sim.isComplete && sim.trades.length > 0) {
        finalResultsHTML = renderFinalResults(tab);
    }

    panel.innerHTML = `
        <div class="sim-playback-controls">
            <button class="sim-play-btn ${sim.isPlaying && !sim.isPaused ? 'playing' : ''}"
                    id="sim-play-btn-${tab.id}"
                    onclick="toggleSimPlayback('${tab.id}')"
                    ${sim.isComplete ? 'disabled' : ''}>
                ${sim.isPlaying && !sim.isPaused ? '⏸' : '▶'}
            </button>
            <button class="sim-reset-btn" onclick="resetSimulation('${tab.id}')">Reset</button>
            <div class="sim-speed-control">
                <label>Speed:</label>
                <select id="sim-speed-${tab.id}" onchange="updateSimSpeed('${tab.id}', this.value)">
                    <option value="500" ${sim.speed === 500 ? 'selected' : ''}>0.5x</option>
                    <option value="200" ${sim.speed === 200 ? 'selected' : ''}>1x</option>
                    <option value="100" ${sim.speed === 100 ? 'selected' : ''}>2x</option>
                    <option value="50" ${sim.speed === 50 ? 'selected' : ''}>4x</option>
                </select>
            </div>
            <div class="sim-progress">
                <div class="sim-progress-bar">
                    <div class="sim-progress-fill" id="sim-progress-${tab.id}" style="width: ${progress}%"></div>
                </div>
                <div class="sim-progress-text">
                    <span>${currentCandle ? currentCandle.date.toLocaleString() : 'Ready to start'}</span>
                    <span>${sim.currentIndex - sim.startIndex + 1} / ${dataLength - sim.startIndex}</span>
                </div>
            </div>
            ${statusBadge}
        </div>

        <div class="sim-trading-panel">
            <div class="sim-chart-area">
                <div class="sim-chart-container" id="sim-chart-${tab.id}"></div>
            </div>
            <div class="sim-trade-panel">
                <div class="sim-position-card">
                    <h5>Current Price</h5>
                    <div class="sim-price-display" id="sim-price-${tab.id}">
                        ${currentCandle ? '$' + currentCandle.close.toFixed(2) : '--'}
                    </div>
                    ${priceChangeHTML}
                </div>

                ${indicatorsHTML}

                <div class="sim-position-card" id="sim-position-display-${tab.id}">
                    ${positionHTML}
                </div>

                <div class="sim-action-buttons" id="sim-actions-${tab.id}">
                    ${sim.position ? `
                        <button class="sim-action-btn close-position" onclick="closeSimPosition('${tab.id}')">
                            CLOSE POSITION
                        </button>
                    ` : `
                        <button class="sim-action-btn buy" onclick="openSimPosition('${tab.id}', 'BUY')"
                                ${!sim.isPlaying || sim.isComplete ? 'disabled' : ''}>
                            BUY
                        </button>
                        <button class="sim-action-btn sell" onclick="openSimPosition('${tab.id}', 'SELL')"
                                ${!sim.isPlaying || sim.isComplete ? 'disabled' : ''}>
                            SELL
                        </button>
                    `}
                </div>
            </div>
        </div>

        <div id="sim-results-${tab.id}">
            ${finalResultsHTML}
        </div>

        <div class="disclaimer">
            Watch the market unfold in real-time using historical data. Click BUY or SELL when you think the time is right, then close your position to lock in gains or cut losses. AI feedback provided after each trade.
        </div>
    `;

    // Initialize or update chart
    setTimeout(function() { initSimulatorChart(tab); }, 50);
}

function initSimulatorChart(tab) {
    const container = document.getElementById('sim-chart-' + tab.id);
    if (!container) return;

    const sim = tab.simulatorState;

    // Clear existing chart
    if (sim.simChart) {
        sim.simChart.remove();
        sim.simChart = null;
    }

    // Create chart
    sim.simChart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight || 350,
        layout: {
            background: { color: '#1e2746' },
            textColor: '#b0b3b8',
        },
        grid: {
            vertLines: { color: '#2d3a5a' },
            horzLines: { color: '#2d3a5a' },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
        },
        rightPriceScale: {
            borderColor: '#2d3a5a',
        },
        timeScale: {
            borderColor: '#2d3a5a',
            timeVisible: true,
            secondsVisible: false,
        },
    });

    // Add candlestick series
    sim.candleSeries = sim.simChart.addCandlestickSeries({
        upColor: '#00d26a',
        downColor: '#ff4757',
        borderVisible: false,
        wickUpColor: '#00d26a',
        wickDownColor: '#ff4757',
    });

    // Add markers series for trades
    sim.markerData = [];

    // Update chart with current visible data
    updateSimulatorChartData(tab);

    // Handle resize
    const resizeObserver = new ResizeObserver(function() {
        if (sim.simChart && container.clientWidth > 0) {
            sim.simChart.applyOptions({ width: container.clientWidth, height: container.clientHeight || 350 });
        }
    });
    resizeObserver.observe(container);
}

function updateSimulatorChartData(tab) {
    const sim = tab.simulatorState;
    if (!sim.simChart || !sim.candleSeries) return;

    const visibleData = tab.data.slice(0, sim.currentIndex + 1);

    const candleData = visibleData.map(function(d) {
        return {
            time: d.date.getTime() / 1000,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close
        };
    });

    sim.candleSeries.setData(candleData);

    // Add trade markers
    if (sim.markerData.length > 0) {
        sim.candleSeries.setMarkers(sim.markerData);
    }

    sim.simChart.timeScale().fitContent();
}

window.toggleSimPlayback = function(tabId) {
    const tab = analysisTabs[tabId];
    if (!tab) return;

    const sim = tab.simulatorState;

    if (sim.isComplete) return;

    if (sim.isPlaying && !sim.isPaused) {
        // Pause
        sim.isPaused = true;
        if (sim.playInterval) {
            clearInterval(sim.playInterval);
            sim.playInterval = null;
        }
        updatePlayButton(tabId);
    } else {
        // Play or resume
        sim.isPlaying = true;
        sim.isPaused = false;
        startSimPlayback(tabId);
        updatePlayButton(tabId);
        updateActionButtons(tabId);
    }
}

function startSimPlayback(tabId) {
    const tab = analysisTabs[tabId];
    if (!tab) return;

    const sim = tab.simulatorState;
    const dataLength = tab.data.length;

    sim.playInterval = setInterval(function() {
        if (sim.currentIndex < dataLength - 1) {
            sim.currentIndex++;
            updateSimulatorDisplay(tab);
        } else {
            // End of data
            clearInterval(sim.playInterval);
            sim.playInterval = null;
            sim.isComplete = true;

            // Auto-close position if still open
            if (sim.position) {
                closeSimPosition(tabId);
            } else {
                renderSimulatorPanel(tab);
            }
        }
    }, sim.speed);
}

function updateSimulatorDisplay(tab) {
    const sim = tab.simulatorState;
    const currentCandle = tab.data[sim.currentIndex];
    const prevCandle = sim.currentIndex > 0 ? tab.data[sim.currentIndex - 1] : null;

    // Update price display
    const priceEl = document.getElementById('sim-price-' + tab.id);
    if (priceEl) {
        priceEl.textContent = '$' + currentCandle.close.toFixed(2);
    }

    // Update progress
    const progressEl = document.getElementById('sim-progress-' + tab.id);
    if (progressEl) {
        const progress = ((sim.currentIndex - sim.startIndex) / (tab.data.length - 1 - sim.startIndex)) * 100;
        progressEl.style.width = progress + '%';
    }

    // Update position P&L if we have one
    if (sim.position) {
        const posDisplay = document.getElementById('sim-position-display-' + tab.id);
        if (posDisplay) {
            const pnl = sim.position.type === 'BUY'
                ? ((currentCandle.close - sim.position.entryPrice) / sim.position.entryPrice) * 100
                : ((sim.position.entryPrice - currentCandle.close) / sim.position.entryPrice) * 100;
            const pnlClass = pnl >= 0 ? 'profit' : 'loss';
            posDisplay.innerHTML = `
                <div class="sim-open-position">
                    <div class="position-type">${sim.position.type} Position Open</div>
                    <div class="position-details">
                        <span class="position-entry">Entry: $${sim.position.entryPrice.toFixed(2)}</span>
                        <span class="position-pnl ${pnlClass}">${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%</span>
                    </div>
                </div>
            `;
        }
    }

    // Update chart
    updateSimulatorChartData(tab);
}

function updatePlayButton(tabId) {
    const tab = analysisTabs[tabId];
    if (!tab) return;

    const btn = document.getElementById('sim-play-btn-' + tabId);
    if (btn) {
        const sim = tab.simulatorState;
        btn.textContent = (sim.isPlaying && !sim.isPaused) ? '⏸' : '▶';
        btn.classList.toggle('playing', sim.isPlaying && !sim.isPaused);
    }
}

function updateActionButtons(tabId) {
    const tab = analysisTabs[tabId];
    if (!tab) return;

    const sim = tab.simulatorState;
    const actionsDiv = document.getElementById('sim-actions-' + tabId);
    if (!actionsDiv) return;

    if (sim.position) {
        actionsDiv.innerHTML = `
            <button class="sim-action-btn close-position" onclick="closeSimPosition('${tabId}')">
                CLOSE POSITION
            </button>
        `;
    } else {
        actionsDiv.innerHTML = `
            <button class="sim-action-btn buy" onclick="openSimPosition('${tabId}', 'BUY')"
                    ${!sim.isPlaying || sim.isComplete ? 'disabled' : ''}>
                BUY
            </button>
            <button class="sim-action-btn sell" onclick="openSimPosition('${tabId}', 'SELL')"
                    ${!sim.isPlaying || sim.isComplete ? 'disabled' : ''}>
                SELL
            </button>
        `;
    }
}

window.openSimPosition = function(tabId, type) {
    const tab = analysisTabs[tabId];
    if (!tab || tab.simulatorState.position) return;

    const sim = tab.simulatorState;
    const currentCandle = tab.data[sim.currentIndex];

    // Calculate indicators at entry for later feedback
    const visibleData = tab.data.slice(0, sim.currentIndex + 1);
    const indicatorsAtEntry = visibleData.length >= 20 ? calculateIndicators(visibleData) : null;
    const predictionAtEntry = indicatorsAtEntry ? predictDirection(indicatorsAtEntry) : null;

    sim.position = {
        type: type,
        entryIndex: sim.currentIndex,
        entryPrice: currentCandle.close,
        entryDate: currentCandle.date,
        indicatorsAtEntry: indicatorsAtEntry,
        predictionAtEntry: predictionAtEntry
    };

    // Add marker to chart
    sim.markerData.push({
        time: currentCandle.date.getTime() / 1000,
        position: type === 'BUY' ? 'belowBar' : 'aboveBar',
        color: type === 'BUY' ? '#00d26a' : '#ff4757',
        shape: type === 'BUY' ? 'arrowUp' : 'arrowDown',
        text: type
    });

    updateSimulatorChartData(tab);
    updateActionButtons(tabId);

    // Update status
    const posDisplay = document.getElementById('sim-position-display-' + tabId);
    if (posDisplay) {
        posDisplay.innerHTML = `
            <div class="sim-open-position">
                <div class="position-type">${type} Position Open</div>
                <div class="position-details">
                    <span class="position-entry">Entry: $${sim.position.entryPrice.toFixed(2)}</span>
                    <span class="position-pnl profit">0.00%</span>
                </div>
            </div>
        `;
    }
}

window.closeSimPosition = function(tabId) {
    const tab = analysisTabs[tabId];
    if (!tab || !tab.simulatorState.position) return;

    const sim = tab.simulatorState;
    const currentCandle = tab.data[sim.currentIndex];
    const position = sim.position;

    // Calculate P&L
    const pnl = position.type === 'BUY'
        ? ((currentCandle.close - position.entryPrice) / position.entryPrice) * 100
        : ((position.entryPrice - currentCandle.close) / position.entryPrice) * 100;

    // Calculate max drawdown and runup during the trade
    const tradeData = tab.data.slice(position.entryIndex, sim.currentIndex + 1);
    let maxPrice = position.entryPrice;
    let minPrice = position.entryPrice;
    tradeData.forEach(function(d) {
        if (d.high > maxPrice) maxPrice = d.high;
        if (d.low < minPrice) minPrice = d.low;
    });

    let maxDrawdown, maxRunup;
    if (position.type === 'BUY') {
        maxDrawdown = ((position.entryPrice - minPrice) / position.entryPrice) * 100;
        maxRunup = ((maxPrice - position.entryPrice) / position.entryPrice) * 100;
    } else {
        maxDrawdown = ((maxPrice - position.entryPrice) / position.entryPrice) * 100;
        maxRunup = ((position.entryPrice - minPrice) / position.entryPrice) * 100;
    }

    // Generate feedback
    const feedback = generateAIFeedback(
        position.type,
        position.predictionAtEntry,
        pnl,
        pnl > 0,
        position.indicatorsAtEntry,
        maxDrawdown,
        maxRunup
    );

    // Record completed trade
    sim.trades.push({
        type: position.type,
        entryPrice: position.entryPrice,
        entryDate: position.entryDate,
        entryIndex: position.entryIndex,
        exitPrice: currentCandle.close,
        exitDate: currentCandle.date,
        exitIndex: sim.currentIndex,
        pnl: pnl,
        maxDrawdown: maxDrawdown,
        maxRunup: maxRunup,
        periodsHeld: sim.currentIndex - position.entryIndex,
        predictionAtEntry: position.predictionAtEntry,
        indicatorsAtEntry: position.indicatorsAtEntry,
        feedback: feedback
    });

    // Add exit marker
    sim.markerData.push({
        time: currentCandle.date.getTime() / 1000,
        position: 'aboveBar',
        color: '#a855f7',
        shape: 'circle',
        text: 'EXIT'
    });

    // Clear position
    sim.position = null;

    updateSimulatorChartData(tab);
    updateActionButtons(tabId);

    // Update position display
    const posDisplay = document.getElementById('sim-position-display-' + tabId);
    if (posDisplay) {
        posDisplay.innerHTML = '';
    }

    // Show trade result immediately
    const resultsDiv = document.getElementById('sim-results-' + tabId);
    if (resultsDiv) {
        resultsDiv.innerHTML = renderFinalResults(tab);
    }
}

window.resetSimulation = function(tabId) {
    const tab = analysisTabs[tabId];
    if (!tab) return;

    const sim = tab.simulatorState;

    // Stop playback
    if (sim.playInterval) {
        clearInterval(sim.playInterval);
        sim.playInterval = null;
    }

    // Reset state
    sim.isPlaying = false;
    sim.isPaused = false;
    sim.currentIndex = sim.startIndex;
    sim.position = null;
    sim.trades = [];
    sim.markerData = [];
    sim.isComplete = false;

    // Re-render
    renderSimulatorPanel(tab);
}

window.updateSimSpeed = function(tabId, speed) {
    const tab = analysisTabs[tabId];
    if (!tab) return;

    tab.simulatorState.speed = parseInt(speed);

    // If currently playing, restart with new speed
    if (tab.simulatorState.isPlaying && !tab.simulatorState.isPaused) {
        if (tab.simulatorState.playInterval) {
            clearInterval(tab.simulatorState.playInterval);
        }
        startSimPlayback(tabId);
    }
}

function generateAIFeedback(userAction, aiPrediction, profitLossPercent, isProfit, indicators, maxDrawdown, maxRunup) {
    const feedback = {
        verdict: '',
        verdictClass: '',
        summary: '',
        details: [],
        aiAgreed: false
    };

    if (!aiPrediction || !indicators) {
        feedback.verdict = 'Insufficient Data';
        feedback.verdictClass = 'mixed';
        feedback.summary = 'Not enough historical data was available at entry to generate AI signals.';
        return feedback;
    }

    // Determine if AI would have agreed with user's action
    const aiRecommendedBuy = aiPrediction.direction.indexOf('BULLISH') !== -1;
    const aiRecommendedSell = aiPrediction.direction.indexOf('BEARISH') !== -1;
    const userBought = userAction === 'BUY';

    feedback.aiAgreed = (userBought && aiRecommendedBuy) || (!userBought && aiRecommendedSell);

    // Generate verdict based on outcome and AI agreement
    if (isProfit) {
        if (feedback.aiAgreed) {
            feedback.verdict = 'Excellent Decision';
            feedback.verdictClass = 'good';
            feedback.summary = 'Your ' + userAction + ' decision was profitable and aligned with the AI\'s analysis at that time.';
        } else {
            feedback.verdict = 'Lucky Trade';
            feedback.verdictClass = 'mixed';
            feedback.summary = 'Your trade was profitable, but the AI\'s indicators suggested a different direction. Sometimes the market moves against technical signals.';
        }
    } else {
        if (!feedback.aiAgreed) {
            feedback.verdict = 'Against the Signals';
            feedback.verdictClass = 'bad';
            feedback.summary = 'This trade went against the AI\'s recommendation and resulted in a loss. The indicators were warning against this move.';
        } else {
            feedback.verdict = 'Market Surprise';
            feedback.verdictClass = 'mixed';
            feedback.summary = 'Despite aligning with the AI\'s analysis, this trade resulted in a loss. Technical analysis isn\'t always right.';
        }
    }

    // Add specific indicator insights
    if (indicators.rsi < 30) {
        feedback.details.push('RSI was oversold (' + indicators.rsi.toFixed(1) + '), suggesting potential upward bounce.');
    } else if (indicators.rsi > 70) {
        feedback.details.push('RSI was overbought (' + indicators.rsi.toFixed(1) + '), suggesting potential downward correction.');
    } else {
        feedback.details.push('RSI was neutral at ' + indicators.rsi.toFixed(1) + '.');
    }

    if (indicators.currentPrice > indicators.sma20 && indicators.sma20 > indicators.sma50) {
        feedback.details.push('Price was in an uptrend (above both moving averages).');
    } else if (indicators.currentPrice < indicators.sma20 && indicators.sma20 < indicators.sma50) {
        feedback.details.push('Price was in a downtrend (below both moving averages).');
    } else {
        feedback.details.push('Moving averages showed mixed signals with no clear trend.');
    }

    if (indicators.macdHistogram > 0) {
        feedback.details.push('MACD histogram was positive, indicating bullish momentum.');
    } else {
        feedback.details.push('MACD histogram was negative, indicating bearish momentum.');
    }

    // Risk analysis
    if (maxDrawdown > 5) {
        feedback.details.push('This trade saw a max drawdown of ' + maxDrawdown.toFixed(1) + '%, which required patience to hold through.');
    }

    if (maxRunup > Math.abs(profitLossPercent) && isProfit) {
        feedback.details.push('The position reached +' + maxRunup.toFixed(1) + '% before settling at ' + profitLossPercent.toFixed(2) + '%. Earlier exit could have improved returns.');
    }

    return feedback;
}

function renderFinalResults(tab) {
    const sim = tab.simulatorState;
    if (sim.trades.length === 0) return '';

    // Calculate total P&L
    const totalPnL = sim.trades.reduce(function(sum, trade) { return sum + trade.pnl; }, 0);
    const winningTrades = sim.trades.filter(function(t) { return t.pnl > 0; }).length;
    const winRate = (winningTrades / sim.trades.length) * 100;

    let tradesHTML = sim.trades.map(function(trade, index) {
        const pnlClass = trade.pnl >= 0 ? 'profit' : 'loss';
        const actionClass = trade.type.toLowerCase();

        const aiDirectionClass = trade.predictionAtEntry
            ? (trade.predictionAtEntry.direction.indexOf('BULLISH') !== -1 ? 'bullish' :
               trade.predictionAtEntry.direction.indexOf('BEARISH') !== -1 ? 'bearish' : 'neutral')
            : 'neutral';

        let detailsHTML = trade.feedback.details.map(function(detail) {
            return '<p style="margin-bottom: 6px; font-size: 0.9em;">• ' + detail + '</p>';
        }).join('');

        return `
            <div class="sim-trade-item" style="flex-direction: column; align-items: stretch;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div class="sim-trade-info">
                        <span class="sim-trade-action ${actionClass}">Trade ${index + 1}: ${trade.type}</span>
                        <span class="sim-trade-prices">$${trade.entryPrice.toFixed(2)} → $${trade.exitPrice.toFixed(2)} (${trade.periodsHeld} periods)</span>
                    </div>
                    <span class="sim-trade-result ${pnlClass}">${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}%</span>
                </div>
                <div class="ai-feedback" style="margin: 0;">
                    <p style="margin-bottom: 8px;">
                        <span class="feedback-verdict ${trade.feedback.verdictClass}">${trade.feedback.verdict}</span>
                        ${trade.feedback.summary}
                    </p>
                    ${detailsHTML}
                    ${trade.predictionAtEntry ? `
                        <div class="ai-recommendation" style="margin-top: 10px;">
                            <span class="ai-label">AI signal at entry:</span>
                            <span class="ai-action ${aiDirectionClass}">${trade.predictionAtEntry.action}</span>
                            <span style="color: var(--text-muted); font-size: 0.85em;">(${trade.predictionAtEntry.confidence}% confidence)</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    const totalClass = totalPnL >= 0 ? 'profit' : 'loss';

    return `
        <div class="sim-final-results">
            <div class="sim-final-header">
                <h4>Trading Session Summary</h4>
                <span class="result-outcome ${totalClass}">${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}% Total</span>
            </div>
            <div class="sim-final-body">
                <div class="result-metrics" style="margin-bottom: 16px;">
                    <div class="result-metric">
                        <div class="value">${sim.trades.length}</div>
                        <div class="label">Trades</div>
                    </div>
                    <div class="result-metric">
                        <div class="value positive">${winningTrades}</div>
                        <div class="label">Winners</div>
                    </div>
                    <div class="result-metric">
                        <div class="value negative">${sim.trades.length - winningTrades}</div>
                        <div class="label">Losers</div>
                    </div>
                    <div class="result-metric">
                        <div class="value">${winRate.toFixed(0)}%</div>
                        <div class="label">Win Rate</div>
                    </div>
                </div>
                <div class="sim-trades-list">
                    ${tradesHTML}
                </div>
            </div>
        </div>
    `;
}

// ==================== EXPORT VAE JSON ====================
window.downloadCSV = function(tabId) {
    const tab = analysisTabs[tabId];
    if (!tab || !tab.data) return;

    const header = 'Date,Open,High,Low,Close,Volume';
    const rows = tab.data.map(function(d) {
        return [
            d.date.toISOString().split('T')[0],
            d.open, d.high, d.low, d.close, d.volume
        ].join(',');
    });

    const csv = [header].concat(rows).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = tab.ticker + '_' + tab.range + '_' + tab.interval + '.csv';
    a.click();
    URL.revokeObjectURL(url);
};

window.downloadVAEJson = function(tabId) {
    const tab = analysisTabs[tabId];
    if (!tab || !tab.data) return;

    if (tab.timeframe !== '2y|1d') {
        if (!confirm('The current timeframe is not 2 Years - Daily (2y|1d). VAE models typically expect this timeframe for best results.\n\nExport anyway?')) {
            return;
        }
    }

    const exportData = {
        ticker: tab.ticker,
        range: tab.range,
        interval: tab.interval,
        exported_at: new Date().toISOString(),
        data_points: tab.data.length,
        data: tab.data.map(function(d) {
            return {
                date: d.date.toISOString().split('T')[0],
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close,
                volume: d.volume
            };
        })
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = tab.ticker + '_VAE_' + tab.range + '_' + tab.interval + '.json';
    a.click();
    URL.revokeObjectURL(url);
};

// ==================== AUTO-REFRESH ====================
let autoRefreshEnabled = false;
let autoRefreshInterval = 60;
let autoRefreshTimer = null;
let countdownTimer = null;
let nextRefreshTime = null;

window.toggleAutoRefresh = function() {
    autoRefreshEnabled = !autoRefreshEnabled;
    const btn = document.getElementById('toggleAutoRefresh');

    if (autoRefreshEnabled) {
        btn.textContent = 'Stop Refresh';
        btn.style.background = '#00d26a';
        startAutoRefresh();
    } else {
        btn.textContent = 'Auto-Refresh';
        btn.style.background = '';
        stopAutoRefresh();
    }
}

function startAutoRefresh() {
    stopAutoRefresh();

    nextRefreshTime = Date.now() + (autoRefreshInterval * 1000);
    updateCountdown();
    countdownTimer = setInterval(updateCountdown, 1000);

    autoRefreshTimer = setTimeout(function() {
        if (autoRefreshEnabled && activeTabId) {
            refreshTabData(activeTabId);
            startAutoRefresh();
        }
    }, autoRefreshInterval * 1000);
}

function stopAutoRefresh() {
    if (autoRefreshTimer) {
        clearTimeout(autoRefreshTimer);
        autoRefreshTimer = null;
    }
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
    document.getElementById('countdown').textContent = '';
}

function updateCountdown() {
    if (!autoRefreshEnabled || !nextRefreshTime) return;

    const remaining = Math.max(0, Math.ceil((nextRefreshTime - Date.now()) / 1000));
    document.getElementById('countdown').textContent = remaining + 's';
}

window.updateRefreshInterval = function() {
    autoRefreshInterval = parseInt(document.getElementById('refreshInterval').value);
    if (autoRefreshEnabled) startAutoRefresh();
}

console.log('Trading Assistant ready');
