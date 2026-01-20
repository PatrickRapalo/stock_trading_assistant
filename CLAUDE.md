# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AI Trading Assistant Demo - a client-side only stock analysis tool that provides directional predictions based on technical indicators. It runs entirely in the browser with no backend, build process, or dependencies to install.

## Running Locally

Open `index.html` directly in a browser, or serve with any static file server:
```bash
python -m http.server 8000
# Then visit http://localhost:8000
```

## Deployment

Static files deploy directly to GitHub Pages. Upload `index.html` and `app.js` to a GitHub repo, enable Pages in Settings, and the app will be live.

## Architecture

**Single-page application with two files:**
- `index.html` - UI markup and CSS (all styles are inline in a `<style>` block)
- `app.js` - All application logic

**Data Flow:**
1. User selects stock ticker and timeframe
2. `fetchStockData()` fetches from Yahoo Finance via CORS proxy (tries multiple proxies in fallback order)
3. `calculateIndicators()` computes technical indicators (SMA, RSI, MACD, Bollinger Bands, volume, momentum)
4. `predictDirection()` runs rule-based scoring system to generate prediction
5. `renderResults()` displays prediction, charts, and metrics

**Key Components:**

*Technical Indicator Calculations (app.js:77-244):*
- `calculateSMA()` - Simple Moving Average
- `calculateRSI()` - Relative Strength Index
- `calculateMACD()` - Moving Average Convergence Divergence
- `calculateEMA()` - Exponential Moving Average
- `calculateBollingerBands()` - Bollinger Bands

*Trading Rules Engine (app.js:247-304):*
- `tradingRules` object configures which indicators are enabled, their weights, and thresholds
- Custom rules include minimum volume, multiple confirmations, trend following

*Prediction Logic (app.js:307-580):*
- Scores each indicator and aggregates into bullish/bearish/neutral prediction
- Score >= 3: BULLISH, Score <= -3: BEARISH, otherwise NEUTRAL/SLIGHTLY directional

*Charts:*
- Uses Chart.js for line charts
- Uses Lightweight Charts for interactive candlestick charts with pan/zoom
- `generatePricePredictions()` creates forward price estimates with confidence bands

**External Dependencies (loaded via CDN in index.html):**
- TensorFlow.js (loaded but not actively used - available for ML enhancements)
- Chart.js for standard charting
- Lightweight Charts for candlestick charts

## Customization Points

- Adjust scoring weights in `tradingRules.weights` object
- Modify indicator thresholds in `tradingRules.thresholds`
- Enable/disable custom rules in `tradingRules.custom`
- Add new technical indicators by implementing calculation function and integrating into `predictDirection()`
