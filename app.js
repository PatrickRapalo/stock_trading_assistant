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

function predictDirection(indicators) {
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
function generatePricePredictions(indicators, numPeriods) {
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
        const confidenceRange = price * volatility * i * 0.3;

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
        currentSubTab: 'chart'
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
        tab.prediction = predictDirection(tab.indicators);

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
            </div>
            <div class="sub-tab-content">
                <div id="panel-chart" class="sub-tab-panel ${tab.currentSubTab === 'chart' ? 'active' : ''}"></div>
                <div id="panel-history" class="sub-tab-panel ${tab.currentSubTab === 'history' ? 'active' : ''}"></div>
                <div id="panel-decision" class="sub-tab-panel ${tab.currentSubTab === 'decision' ? 'active' : ''}"></div>
                <div id="panel-predictions" class="sub-tab-panel ${tab.currentSubTab === 'predictions' ? 'active' : ''}"></div>
            </div>
        </div>
    `;

    renderChartPanel(tab);
    renderHistoryPanel(tab);
    renderDecisionPanel(tab);
    renderPredictionsPanel(tab);
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
            <span style="margin-left: auto; color: var(--text-muted); font-size: 0.85em;">Scroll to zoom | Drag to pan</span>
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
    const predictions = generatePricePredictions(tab.indicators, 10);

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

    const predictions = generatePricePredictions(tab.indicators, 10);

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
