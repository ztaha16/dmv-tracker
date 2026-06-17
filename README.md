# dmv+ tracker

A personal cafe & restaurant tracker built with React + Vite.

## Setup

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com), import the repo
3. It auto-detects Vite — just click Deploy

Or use the CLI:
```bash
npm i -g vercel
vercel
```

## Deploy to Netlify

1. Push to GitHub
2. Go to [netlify.com](https://app.netlify.com), import the repo
3. Build command: `npm run build`
4. Publish directory: `dist`

## How it works

All data (places, categories, locations, cost tiers) is stored in your browser's `localStorage`. Use the **Export Backup** button in Settings to save a JSON file you can restore later or on another device.
