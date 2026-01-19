// AI Trading Assistant - Main Application Logic
console.log(‘Trading Assistant script loaded successfully!’);

let stockData = null;
let technicalIndicators = null;

// Fetch historical stock data from Yahoo Finance (via proxy)
async function fetchStockData(ticker, range, interval) {
const proxies = [
‘https://api.allorigins.win/raw?url=’,
‘https://corsproxy.io/?’,
‘https://api.codetabs.com/v1/proxy?quest=’
];

```
const yahooUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/' + ticker + '?interval=' + interval + '&range=' + range;

let lastError = null;

for (let i = 0; i < proxies.length; i++) {
    try {
        console.log('Attempt ' + (i + 1) + ': Using proxy ' + (i + 1) + '...');
        const proxyUrl = proxies[i] + encodeURIComponent(yahooUrl);
        
        const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }
        
        const data = await response.json();
        
        if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
            throw new Error('No data found for this ticker');
        }
        
        const result = data.chart.result[0];
        
        if (!result.timestamp || !result.indicators || !result.indicators.quote) {
            throw new Error('Invalid data format from Yahoo Finance');
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
        
        console.log('Success with proxy ' + (i + 1));
        return formattedData;
        
    } catch (error) {
        console.warn('Proxy ' + (i + 1) + ' failed:', error.message);
        lastError = error;
    }
}

console.error('All proxies failed:', lastError);
throw new Error('Failed to fetch stock data after trying ' + proxies.length + ' proxies. Error: ' + (lastError ? lastError.message : 'Unknown error'));
```

}

// Calculate technical indicators
function calculateIndicators(data) {
const closes = data.map(function(d) { return d.close; });
const highs = data.map(function(d) { return d.high; });
const lows = data.map(function(d) { return d.low; });
const volumes = data.map(function(d) { return d.volume; });

```
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
```

}

// Simple Moving Average
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

// RSI Calculation
function calculateRSI(data, period) {
const result = [];
const gains = [];
const losses = [];

```
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
            const rsi = 100 - (100 / (1 + rs));
            result.push(rsi);
        }
    }
}

result.unshift(null);
return result;
```

}

// MACD Calculation
function calculateMACD(data, fastPeriod, slowPeriod, signalPeriod) {
fastPeriod = fastPeriod || 12;
slowPeriod = slowPeriod || 26;
signalPeriod = signalPeriod || 9;

```
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

return {
    macd: macdLine,
    signal: paddedSignal,
    histogram: histogram
};
```

}

// Exponential Moving Average
function calculateEMA(data, period) {
const result = [];
const multiplier = 2 / (period + 1);
let ema = null;

```
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
```

}

// Bollinger Bands
function calculateBollingerBands(data, period, stdDev) {
period = period || 20;
stdDev = stdDev || 2;

```
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
```

}

// AI Trading Rules Configuration
const tradingRules = {
// Enable/disable specific rules
enabled: {
movingAverages: true,
rsi: true,
macd: true,
bollingerBands: true,
volume: true,
momentum: true,
trendStrength: true,
priceAction: true
},

```
// Rule weights (how much each rule contributes to final score)
weights: {
    movingAverages: 2.0,    // Strongest signal
    rsi: 1.5,
    macd: 1.5,
    bollingerBands: 1.0,
    volume: 0.5,
    momentum: 1.0,
    trendStrength: 1.0,
    priceAction: 0.5
},

// Thresholds for indicators
thresholds: {
    rsiOversold: 30,        // RSI below this = oversold
    rsiOverbought: 70,      // RSI above this = overbought
    rsiNeutral: 50,         // RSI midpoint
    volumeHigh: 1.5,        // Volume ratio for "high volume"
    volumeLow: 0.7,         // Volume ratio for "low volume"
    momentumStrong: 2,      // Momentum % for strong moves
    bbLowerZone: 0.2,       // Bottom 20% of BB range
    bbUpperZone: 0.8        // Top 20% of BB range
},

// Custom rules - add your own here!
custom: {
    // Example: Don't trade if volume is too low
    minimumVolumeRequired: true,
    minimumVolumeThreshold: 0.5,
    
    // Example: Require multiple confirmations for strong signals
    requireMultipleConfirmations: true,
    confirmationsNeeded: 3,
    
    // Example: Reduce score if price is too volatile
    penalizeHighVolatility: false,
    volatilityThreshold: 5,
    
    // Example: Only trade with the trend
    trendFollowingOnly: false,
    
    // Example: Don't trade during first/last hour (for intraday)
    avoidMarketOpenClose: false
}
```

};

// AI Prediction Logic with Rules Engine
function predictDirection(indicators) {
let score = 0;
const reasons = [];
let confirmations = 0;  // Track how many indicators agree

```
// Rule 1: Moving Average Analysis
if (tradingRules.enabled.movingAverages) {
    const weight = tradingRules.weights.movingAverages;
    
    if (indicators.currentPrice > indicators.sma20 && indicators.sma20 > indicators.sma50) {
        score += weight;
        confirmations++;
        reasons.push({
            indicator: 'Moving Averages',
            signal: 'BULLISH',
            weight: weight,
            description: 'Price ($' + indicators.currentPrice.toFixed(2) + ') is above both 20-period SMA ($' + indicators.sma20.toFixed(2) + ') and 50-period SMA ($' + indicators.sma50.toFixed(2) + '), indicating upward momentum.'
        });
    } else if (indicators.currentPrice < indicators.sma20 && indicators.sma20 < indicators.sma50) {
        score -= weight;
        confirmations++;
        reasons.push({
            indicator: 'Moving Averages',
            signal: 'BEARISH',
            weight: weight,
            description: 'Price ($' + indicators.currentPrice.toFixed(2) + ') is below both moving averages, suggesting downward trend.'
        });
    } else {
        reasons.push({
            indicator: 'Moving Averages',
            signal: 'NEUTRAL',
            weight: 0,
            description: 'Moving averages show mixed signals with no clear trend direction.'
        });
    }
}

// Rule 2: RSI Analysis
if (tradingRules.enabled.rsi) {
    const weight = tradingRules.weights.rsi;
    const oversold = tradingRules.thresholds.rsiOversold;
    const overbought = tradingRules.thresholds.rsiOverbought;
    const neutral = tradingRules.thresholds.rsiNeutral;
    
    if (indicators.rsi < oversold) {
        score += weight;
        confirmations++;
        reasons.push({
            indicator: 'RSI',
            signal: 'BULLISH',
            weight: weight,
            description: 'RSI at ' + indicators.rsi.toFixed(2) + ' is oversold (below ' + oversold + '), potentially indicating a buying opportunity.'
        });
    } else if (indicators.rsi > overbought) {
        score -= weight;
        confirmations++;
        reasons.push({
            indicator: 'RSI',
            signal: 'BEARISH',
            weight: weight,
            description: 'RSI at ' + indicators.rsi.toFixed(2) + ' is overbought (above ' + overbought + '), suggesting potential for price decline.'
        });
    } else if (indicators.rsi > neutral) {
        score += weight / 3;
        reasons.push({
            indicator: 'RSI',
            signal: 'SLIGHTLY BULLISH',
            weight: weight / 3,
            description: 'RSI at ' + indicators.rsi.toFixed(2) + ' is above ' + neutral + ', showing moderate bullish momentum.'
        });
    } else {
        score -= weight / 3;
        reasons.push({
            indicator: 'RSI',
            signal: 'SLIGHTLY BEARISH',
            weight: weight / 3,
            description: 'RSI at ' + indicators.rsi.toFixed(2) + ' is below ' + neutral + ', showing moderate bearish momentum.'
        });
    }
}

// Rule 3: MACD Analysis
if (tradingRules.enabled.macd) {
    const weight = tradingRules.weights.macd;
    
    if (indicators.macd > indicators.macdSignal && indicators.macdHistogram > 0) {
        score += weight;
        confirmations++;
        reasons.push({
            indicator: 'MACD',
            signal: 'BULLISH',
            weight: weight,
            description: 'MACD line (' + indicators.macd.toFixed(4) + ') is above signal line, indicating bullish momentum.'
        });
    } else if (indicators.macd < indicators.macdSignal && indicators.macdHistogram < 0) {
        score -= weight;
        confirmations++;
        reasons.push({
            indicator: 'MACD',
            signal: 'BEARISH',
            weight: weight,
            description: 'MACD line is below signal line, indicating bearish momentum.'
        });
    } else {
        reasons.push({
            indicator: 'MACD',
            signal: 'NEUTRAL',
            weight: 0,
            description: 'MACD shows no strong directional signal.'
        });
    }
}

// Rule 4: Bollinger Bands
if (tradingRules.enabled.bollingerBands) {
    const weight = tradingRules.weights.bollingerBands;
    const bbPosition = (indicators.currentPrice - indicators.bbLower) / (indicators.bbUpper - indicators.bbLower);
    
    if (bbPosition < tradingRules.thresholds.bbLowerZone) {
        score += weight;
        reasons.push({
            indicator: 'Bollinger Bands',
            signal: 'BULLISH',
            weight: weight,
            description: 'Price is near lower band ($' + indicators.bbLower.toFixed(2) + '), suggesting oversold conditions.'
        });
    } else if (bbPosition > tradingRules.thresholds.bbUpperZone) {
        score -= weight;
        reasons.push({
            indicator: 'Bollinger Bands',
            signal: 'BEARISH',
            weight: weight,
            description: 'Price is near upper band ($' + indicators.bbUpper.toFixed(2) + '), suggesting overbought conditions.'
        });
    } else {
        reasons.push({
            indicator: 'Bollinger Bands',
            signal: 'NEUTRAL',
            weight: 0,
            description: 'Price is within normal range between bands.'
        });
    }
}

// Rule 5: Volume Analysis
if (tradingRules.enabled.volume) {
    const weight = tradingRules.weights.volume;
    
    if (indicators.volumeRatio > tradingRules.thresholds.volumeHigh) {
        if (score > 0) {
            score += weight;
            reasons.push({
                indicator: 'Volume',
                signal: 'CONFIRMS TREND',
                weight: weight,
                description: 'Volume is ' + (indicators.volumeRatio * 100).toFixed(0) + '% above average, confirming the current price movement.'
            });
        } else {
            score -= weight;
            reasons.push({
                indicator: 'Volume',
                signal: 'CONFIRMS TREND',
                weight: weight,
                description: 'High volume confirms downward pressure.'
            });
        }
    } else if (indicators.volumeRatio < tradingRules.thresholds.volumeLow) {
        reasons.push({
            indicator: 'Volume',
            signal: 'LOW CONVICTION',
            weight: 0,
            description: 'Volume is only ' + (indicators.volumeRatio * 100).toFixed(0) + '% of average, suggesting low conviction.'
        });
    }
}

// Rule 6: Momentum
if (tradingRules.enabled.momentum) {
    const weight = tradingRules.weights.momentum;
    const strongThreshold = tradingRules.thresholds.momentumStrong;
    
    if (indicators.momentum > strongThreshold) {
        score += weight;
        confirmations++;
        reasons.push({
            indicator: 'Price Momentum',
            signal: 'BULLISH',
            weight: weight,
            description: 'Strong positive momentum of ' + indicators.momentum.toFixed(2) + '% over the last 5 periods.'
        });
    } else if (indicators.momentum < -strongThreshold) {
        score -= weight;
        confirmations++;
        reasons.push({
            indicator: 'Price Momentum',
            signal: 'BEARISH',
            weight: weight,
            description: 'Strong negative momentum of ' + indicators.momentum.toFixed(2) + '% over the last 5 periods.'
        });
    }
}

// CUSTOM RULE: Minimum Volume Required
if (tradingRules.custom.minimumVolumeRequired) {
    if (indicators.volumeRatio < tradingRules.custom.minimumVolumeThreshold) {
        score = score * 0.5;  // Cut score in half if volume too low
        reasons.push({
            indicator: 'Custom Rule: Minimum Volume',
            signal: 'WARNING',
            weight: 0,
            description: 'ALERT: Volume below minimum threshold (' + tradingRules.custom.minimumVolumeThreshold + 'x). Reducing confidence in prediction.'
        });
    }
}

// CUSTOM RULE: Require Multiple Confirmations
if (tradingRules.custom.requireMultipleConfirmations) {
    if (confirmations < tradingRules.custom.confirmationsNeeded) {
        score = score * 0.7;  // Reduce score by 30% if not enough confirmations
        reasons.push({
            indicator: 'Custom Rule: Multiple Confirmations',
            signal: 'WARNING',
            weight: 0,
            description: 'ALERT: Only ' + confirmations + ' confirmations out of ' + tradingRules.custom.confirmationsNeeded + ' required. Reducing confidence.'
        });
    }
}

// CUSTOM RULE: Trend Following Only
if (tradingRules.custom.trendFollowingOnly) {
    const trendBullish = indicators.currentPrice > indicators.sma20 && indicators.sma20 > indicators.sma50;
    const trendBearish = indicators.currentPrice < indicators.sma20 && indicators.sma20 < indicators.sma50;
    
    if (!trendBullish && !trendBearish) {
        score = 0;  // No trade if no clear trend
        reasons.push({
            indicator: 'Custom Rule: Trend Following',
            signal: 'NO TRADE',
            weight: 0,
            description: 'ALERT: No clear trend detected. This rule requires a strong trend to trade.'
        });
    }
}

// Determine direction based on total score
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

return {
    direction: direction,
    confidence: confidence.toFixed(1),
    score: score,
    confirmations: confirmations,
    reasons: reasons,
    recommendation: generateRecommendation(direction, confidence, confirmations)
};
```

}

// Generate trading recommendation
function generateRecommendation(direction, confidence, confirmations) {
let action = ‘HOLD’;
let reasoning = ‘’;

```
if (direction === 'BULLISH' && confidence > 70) {
    action = 'STRONG BUY';
    reasoning = 'Multiple bullish signals with high confidence. Consider entering a long position.';
} else if (direction === 'BULLISH' && confidence > 55) {
    action = 'BUY';
    reasoning = 'Bullish signals detected. Consider a smaller position or wait for confirmation.';
} else if (direction === 'BEARISH' && confidence > 70) {
    action = 'STRONG SELL';
    reasoning = 'Multiple bearish signals with high confidence. Consider exiting or shorting.';
} else if (direction === 'BEARISH' && confidence > 55) {
    action = 'SELL';
    reasoning = 'Bearish signals detected. Consider reducing position size or exiting.';
} else {
    action = 'HOLD';
    reasoning = 'Mixed or weak signals. Wait for clearer market direction before acting.';
}

if (confirmations < 2) {
    reasoning += ' WARNING: Low number of confirming indicators.';
}

return {
    action: action,
    reasoning: reasoning
};
```

}

// Render results
function renderResults(ticker, prediction, indicators, data, interval) {
const resultsDiv = document.getElementById(‘results’);

```
const directionClass = prediction.direction.indexOf('BULLISH') !== -1 ? 'up' : 
                       prediction.direction.indexOf('BEARISH') !== -1 ? 'down' : 'neutral';

let reasonsHTML = prediction.reasons.map(function(r) {
    const weightDisplay = r.weight !== undefined ? ' [Weight: ' + r.weight.toFixed(1) + ']' : '';
    const signalClass = r.signal.indexOf('BULLISH') !== -1 ? ' style="border-left-color: #10b981;"' : 
                       r.signal.indexOf('BEARISH') !== -1 ? ' style="border-left-color: #ef4444;"' :
                       r.signal.indexOf('WARNING') !== -1 ? ' style="border-left-color: #f59e0b;"' : '';
    return '<div class="reasoning-item"' + signalClass + '><strong>' + r.indicator + ':</strong> ' + r.signal + weightDisplay + '<br>' + r.description + '</div>';
}).join('');

let timeframeDesc = interval === '2m' ? '2-Minute' :
                   interval === '5m' ? '5-Minute' :
                   interval === '15m' ? '15-Minute' :
                   interval === '30m' ? '30-Minute' :
                   interval === '60m' ? '1-Hour' : 'Daily';

resultsDiv.innerHTML = '<div class="prediction-card"><div class="prediction-header"><div><h2>Prediction for ' + ticker.toUpperCase() + ' (' + timeframeDesc + ')</h2><div class="direction ' + directionClass + '">' + prediction.direction + '</div></div><div class="confidence">' + prediction.confidence + '% Confidence</div></div><div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #0ea5e9;"><strong style="color: #0369a1; font-size: 1.2em;">Recommendation: ' + prediction.recommendation.action + '</strong><br><span style="color: #0c4a6e; margin-top: 8px; display: block;">' + prediction.recommendation.reasoning + '</span></div><div class="reasoning"><h3>AI Reasoning (Score: ' + prediction.score.toFixed(1) + ' | Confirmations: ' + prediction.confirmations + ')</h3>' + reasonsHTML + '</div></div><div class="chart-container"><canvas id="priceChart"></canvas></div><div class="metrics"><div class="metric-card"><div class="metric-value">$' + indicators.currentPrice.toFixed(2) + '</div><div class="metric-label">Current Price</div></div><div class="metric-card"><div class="metric-value">' + indicators.rsi.toFixed(1) + '</div><div class="metric-label">RSI (14)</div></div><div class="metric-card"><div class="metric-value">' + indicators.momentum.toFixed(2) + '%</div><div class="metric-label">5-Period Momentum</div></div><div class="metric-card"><div class="metric-value">' + (indicators.volumeRatio * 100).toFixed(0) + '%</div><div class="metric-label">Volume vs Avg</div></div></div>';

renderChart(data, indicators, interval);
```

}

// Render chart
function renderChart(data, indicators, interval) {
const ctx = document.getElementById(‘priceChart’).getContext(‘2d’);

```
const isIntraday = ['2m', '5m', '15m', '30m', '60m'].indexOf(interval) !== -1;
const labels = data.map(function(d) {
    if (isIntraday) {
        return d.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } else {
        return d.date.toLocaleDateString();
    }
});
const prices = data.map(function(d) { return d.close; });

new Chart(ctx, {
    type: 'line',
    data: {
        labels: labels,
        datasets: [
            {
                label: 'Price',
                data: prices,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                borderWidth: 2,
                tension: 0.1,
                fill: true
            },
            {
                label: '20-period SMA',
                data: indicators.sma20Full,
                borderColor: '#f59e0b',
                borderWidth: 2,
                borderDash: [5, 5],
                fill: false,
                pointRadius: 0
            },
            {
                label: '50-period SMA',
                data: indicators.sma50Full,
                borderColor: '#10b981',
                borderWidth: 2,
                borderDash: [5, 5],
                fill: false,
                pointRadius: 0
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: {
                display: true,
                position: 'top'
            },
            title: {
                display: true,
                text: 'Price History with Moving Averages (' + interval.toUpperCase() + ' intervals)',
                font: { size: 16 }
            }
        },
        scales: {
            x: {
                ticks: {
                    maxTicksLimit: isIntraday ? 20 : 30,
                    maxRotation: 45,
                    minRotation: 45
                }
            },
            y: {
                beginAtZero: false,
                ticks: {
                    callback: function(value) {
                        return '$' + value.toFixed(2);
                    }
                }
            }
        }
    }
});
```

}

// Main analysis function
window.analyze = async function() {
console.log(‘Analyze button clicked!’);

```
const tickerSelect = document.getElementById('ticker');
const ticker = tickerSelect ? tickerSelect.value : null; 
const timeframeSelect = document.getElementById('timeframe');
const timeframe = timeframeSelect ? timeframeSelect.value : null;
const resultsDiv = document.getElementById('results');
const analyzeBtn = document.getElementById('analyzeBtn');

console.log('Ticker:', ticker);
console.log('Timeframe:', timeframe);

if (!ticker || !timeframe || !resultsDiv || !analyzeBtn) {
    resultsDiv.innerHTML = '<div class="error"><strong>Debug Info:</strong><br>Ticker found: ' + (ticker ? 'YES (' + ticker + ')' : 'NO') + '<br>Timeframe found: ' + (timeframe ? 'YES (' + timeframe + ')' : 'NO') + '<br>Results div found: ' + (resultsDiv ? 'YES' : 'NO') + '<br>Button found: ' + (analyzeBtn ? 'YES' : 'NO') + '<br><br>Please refresh the page and try again.</div>';
    return;
}

const parts = timeframe.split('|');
const range = parts[0];
const interval = parts[1];

if (!range || !interval) {
    resultsDiv.innerHTML = '<div class="error">Invalid timeframe format. Expected "range|interval", got: ' + timeframe + '</div>';
    return;
}

analyzeBtn.disabled = true;
analyzeBtn.textContent = 'Analyzing...';
resultsDiv.innerHTML = '<div class="loading"><div class="spinner"></div><div style="margin-top: 20px; font-size: 1.1em; font-weight: 600;">Analyzing ' + ticker + '...</div><div style="margin-top: 10px; color: #764ba2;"><div>Fetching ' + interval + ' interval data from Yahoo Finance...</div><div style="margin-top: 5px;">This may take 5-15 seconds...</div></div></div>';

try {
    console.log('Fetching ' + interval + ' data for ' + ticker + ' (range: ' + range + ')...');
    stockData = await fetchStockData(ticker, range, interval);
    console.log('Received ' + stockData.length + ' data points');
    
    if (stockData.length < 50) {
        throw new Error('Not enough data points (' + stockData.length + '). Try a longer timeframe.');
    }
    
    console.log('Calculating technical indicators...');
    technicalIndicators = calculateIndicators(stockData);
    console.log('Indicators calculated:', technicalIndicators);
    
    console.log('Generating AI prediction...');
    const prediction = predictDirection(technicalIndicators);
    console.log('Prediction complete:', prediction);
    
    renderResults(ticker, prediction, technicalIndicators, stockData, interval);
    console.log('Results rendered successfully');
    
} catch (error) {
    console.error('Error:', error);
    resultsDiv.innerHTML = '<div class="error"><strong>Error:</strong> ' + error.message + '<br><br><strong>Details:</strong><br>Ticker: ' + ticker + '<br>Range: ' + range + '<br>Interval: ' + interval + '<br><br>Try selecting a different timeframe or stock.</div>';
} finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'Analyze Stock';
}
```

}

console.log(‘All functions loaded successfully!’);