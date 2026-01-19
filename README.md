# 📈 AI Trading Assistant Demo

[Link to Demo](https://patrickrapalo.github.io/stock_trading_assistant/)

An educational stock analysis tool that provides directional predictions with clear, transparent reasoning based on technical indicators.

## 🎯 Features

- **Real Historical Data**: Fetches live NASDAQ stock data from Yahoo Finance
- **AI-Powered Analysis**: Uses technical indicators to predict stock direction
- **Transparent Reasoning**: Shows exactly why the AI makes each prediction
- **Interactive Charts**: Visualize price history with moving averages
- **Multiple Timeframes**: Analyze 1-month, 3-month, 6-month, or 1-year periods
- **Technical Indicators**:
  - Moving Averages (SMA 20 & 50)
  - RSI (Relative Strength Index)
  - MACD (Moving Average Convergence Divergence)
  - Bollinger Bands
  - Volume Analysis
  - Price Momentum

## 🚀 Live Demo

Deploy this to GitHub Pages in minutes!

## 📦 Installation

### Option 1: Direct Deployment to GitHub Pages

1. Create a new repository on GitHub
2. Upload these files:
   - `index.html`
   - `app.js`
3. Go to repository Settings → Pages
4. Select branch `main` and folder `/ (root)`
5. Save and wait a few minutes
6. Your app will be live at `https://yourusername.github.io/repository-name`

### Option 2: Local Development

Simply open `index.html` in your web browser. No build process required!

```bash
# Clone or download the repository
cd ai-trading-assistant

# Open in browser
open index.html
# or
python -m http.server 8000
# Then visit http://localhost:8000
```

## 🎮 How to Use

1. **Enter a Stock Symbol**: Type any NASDAQ ticker (e.g., AAPL, MSFT, GOOGL, TSLA)
2. **Select Time Period**: Choose how much historical data to analyze
3. **Click "Analyze Stock"**: The AI will fetch data and make a prediction
4. **Review the Results**:
   - **Direction**: BULLISH, BEARISH, or NEUTRAL prediction
   - **Confidence**: How confident the model is (0-100%)
   - **Reasoning**: Detailed explanation for each technical indicator
   - **Chart**: Visual representation of price and moving averages
   - **Metrics**: Key statistics at a glance

## 🧠 How It Works

The AI uses a **rule-based scoring system** that analyzes multiple technical indicators:

### Scoring System

Each indicator contributes to a total score:

1. **Moving Averages** (±2 points)
   - Bullish: Price > SMA20 > SMA50
   - Bearish: Price < SMA20 < SMA50

2. **RSI** (±1.5 points)
   - Oversold (< 30): Bullish signal
   - Overbought (> 70): Bearish signal

3. **MACD** (±1.5 points)
   - MACD > Signal + positive histogram: Bullish
   - MACD < Signal + negative histogram: Bearish

4. **Bollinger Bands** (±1 point)
   - Near lower band: Oversold (Bullish)
   - Near upper band: Overbought (Bearish)

5. **Volume** (±0.5 points)
   - High volume confirms the trend

6. **Momentum** (±1 point)
   - Strong 5-day momentum indicates direction

### Final Prediction

- **Score ≥ 3**: BULLISH ↗️
- **Score ≤ -3**: BEARISH ↘️
- **-3 < Score < 3**: SLIGHTLY BULLISH/BEARISH or NEUTRAL

## 🔧 Technical Stack

- **Frontend**: Pure JavaScript (no framework needed)
- **Charts**: Chart.js
- **Data Source**: Yahoo Finance API (via CORS proxy)
- **Deployment**: GitHub Pages compatible (static files only)

## ⚠️ Important Disclaimers

**This is an educational demo only:**

- ❌ NOT financial advice
- ❌ NOT suitable for real trading decisions
- ❌ Past performance does not predict future results
- ✅ Use only for learning about technical analysis
- ✅ Always consult financial professionals before investing

## 🎓 Educational Value

This project demonstrates:

1. **Technical Analysis Fundamentals**: Learn how traders use indicators
2. **Transparent AI**: See exactly how the AI makes decisions
3. **Data Visualization**: Understand stock charts and trends
4. **API Integration**: Fetch and process real financial data
5. **Web Development**: Build interactive financial applications

## 🛠️ Customization

### Change Prediction Logic

Edit the `predictDirection()` function in `app.js` to adjust:
- Scoring weights for each indicator
- Confidence thresholds
- Add new technical indicators

### Add More Indicators

Common indicators you can add:
- Stochastic Oscillator
- ATR (Average True Range)
- ADX (Average Directional Index)
- Fibonacci Retracements
- Volume Weighted Average Price (VWAP)

### Styling

Modify the CSS in `index.html` to change:
- Color scheme
- Layout
- Typography
- Animations

## 📊 Example Stocks to Try

Popular NASDAQ stocks:
- **Tech Giants**: AAPL, MSFT, GOOGL, AMZN, META
- **Growth**: TSLA, NVDA, AMD, NFLX
- **Finance**: PYPL, SQ, COIN
- **Index**: QQQ (NASDAQ-100 ETF)

## 🐛 Troubleshooting

**"Failed to fetch stock data"**
- Check internet connection
- Verify the ticker symbol is correct
- Try a different stock (some tickers may not be available)
- The CORS proxy might be temporarily down

**Chart not displaying**
- Ensure Chart.js CDN is accessible
- Check browser console for errors
- Try refreshing the page

**No data for ticker**
- Not all tickers are available on Yahoo Finance
- Try major NASDAQ stocks first

## 🚀 Future Enhancements

Potential improvements:
- [ ] Machine learning model (LSTM/Transformer)
- [ ] Multi-stock comparison
- [ ] Backtesting functionality
- [ ] Portfolio optimization
- [ ] Real-time data updates
- [ ] Sentiment analysis from news
- [ ] Options flow analysis

## 📝 License

MIT License - Feel free to use for educational purposes

## 🤝 Contributing

This is an educational project. Feel free to:
- Fork and modify
- Add new features
- Improve the prediction algorithm
- Share with others learning about trading

## 💡 Learning Resources

To learn more about technical analysis:
- [Investopedia - Technical Analysis](https://www.investopedia.com/technical-analysis-4689657)
- [TradingView Education](https://www.tradingview.com/education/)
- [Yahoo Finance](https://finance.yahoo.com/)

---

**Remember**: This tool is for educational purposes only. Never risk money you can't afford to lose, and always do your own research before making investment decisions.

Happy Learning! 📚📈
