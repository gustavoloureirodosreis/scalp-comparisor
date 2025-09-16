## Scalp Comparisor

Dead-simple, stateless tool that compares two scalp photos (before/after) using OpenAI vision and returns structured scores for:

- Scalp density
- Lighting
- Sharpness

### Setup

Create `.env.local` in the project root with your OpenAI key:

```
OPENAI_API_KEY=sk-...
# Optional: override the default model
OPENAI_MODEL=gpt-4o-mini
```

Install dependencies and run the dev server:

```
npm install
npm run dev
```

Open http://localhost:3000

### How it works

- Upload two images (placeholders provided)
- Click "Start analysis"
- See skeleton loading while the API runs
- Results show 0–100 scores with progress bars for each metric
- Click "Restart" to reset the flow
