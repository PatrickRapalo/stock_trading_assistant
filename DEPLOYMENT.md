# GitHub Pages Deployment Guide

## Quick Deployment (5 minutes)

### Step 1: Create GitHub Repository

1. Go to [GitHub](https://github.com)
2. Click "New repository"
3. Name it (e.g., `ai-trading-assistant`)
4. Make it Public
5. Click "Create repository"

### Step 2: Upload Files

**Option A: Using GitHub Web Interface**

1. Click "uploading an existing file"
2. Drag and drop these files:
   - `index.html`
   - `app.js`
   - `README.md`
3. Commit changes

**Option B: Using Git Command Line**

```bash
git init
git add index.html app.js README.md
git commit -m "Initial commit: AI Trading Assistant"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
git push -u origin main
```

### Step 3: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click "Settings" tab
3. Click "Pages" in the left sidebar
4. Under "Source":
   - Select branch: `main`
   - Select folder: `/ (root)`
5. Click "Save"

### Step 4: Access Your App

Wait 2-5 minutes, then visit:
```
https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/
```

Example: `https://patrick.github.io/ai-trading-assistant/`

## Updating Your App

Whenever you make changes:

```bash
git add .
git commit -m "Description of changes"
git push
```

GitHub Pages will automatically update in a few minutes.

## Custom Domain (Optional)

1. Buy a domain (e.g., from Namecheap, Google Domains)
2. In your repository settings → Pages
3. Add your custom domain
4. Configure DNS with your domain provider:
   - Add CNAME record pointing to: `YOUR-USERNAME.github.io`

## Testing Locally

Before deploying, test locally:

```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000

# Node.js (if you have http-server installed)
npx http-server
```

Then open: `http://localhost:8000`

## Troubleshooting

**Page shows 404**
- Wait 5-10 minutes for GitHub to process
- Check that files are in the root directory
- Verify Pages is enabled in Settings

**App not working**
- Check browser console (F12) for errors
- Verify all files uploaded correctly
- Test locally first

**CORS errors**
- This app uses a CORS proxy for Yahoo Finance
- If the proxy is down, you may need to find an alternative
- Consider using a different financial data API

## Performance Tips

1. **Enable caching**: GitHub Pages automatically caches static files
2. **Use CDN**: Chart.js loads from CDN for faster performance
3. **Optimize images**: If you add images, compress them first
4. **Minify code**: For production, consider minifying JavaScript

## Security Notes

- Never commit API keys (not needed for this demo)
- Keep dependencies updated
- This app runs entirely client-side (safe for GitHub Pages)

## Next Steps

After deploying:
1. Share the link on LinkedIn/Twitter
2. Add to your portfolio
3. Customize the styling
4. Add more features
5. Star the repository!

---

Need help? Check the [main README](README.md) or create an issue on GitHub.
