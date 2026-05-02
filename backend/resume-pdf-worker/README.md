# resume-pdf-worker

Cloudflare Worker that renders CV HTML to PDF using headless Chrome (Cloudflare Browser Rendering API).

## Deploy in 5 steps

### 1. Create a free Cloudflare account
https://dash.cloudflare.com/sign-up — no credit card required.

### 2. Install Wrangler and log in
```bash
npm install -g wrangler
wrangler login
```

### 3. Install dependencies
```bash
cd resume-pdf-worker
npm install
```

### 4. Deploy
```bash
npm run deploy
```
Copy the Worker URL from the output — it looks like:
`https://resume-pdf-worker.<your-subdomain>.workers.dev`

### 5. Set the Worker URL in the main app

**For local dev** — create `.env.local` in the project root:
```
VITE_PDF_WORKER_URL=https://resume-pdf-worker.<your-subdomain>.workers.dev
```

**For Vercel production** — add in Vercel dashboard:
- Settings → Environment Variables
- Key: `VITE_PDF_WORKER_URL`
- Value: `https://resume-pdf-worker.<your-subdomain>.workers.dev`

Also update `wrangler.toml` to set your Vercel URL in `ALLOWED_ORIGINS`:
```toml
[vars]
ALLOWED_ORIGINS = "https://your-app.vercel.app"
```
Then redeploy the worker: `npm run deploy`

## Free tier limits
- 10 minutes of browser time per day
- ~150–300 PDF renders per day
- No credit card, no cost
