# Scalp Comparisor

Measure hair-loss progress from two photos. Upload a **before** and an **after** scalp photo, and the app segments the bald-spot regions in each, turns them into a percentage of the image, and reports the relative change.

**Live demo:** https://scalp-comparisor.vercel.app · **Batch test page:** [/test](https://scalp-comparisor.vercel.app/test)

Hair-loss treatments are usually judged by eye ("looks a bit fuller?"). This project is an attempt to put a number on it, and an exercise in getting an open-source vision model from zero-shot prototype to a smaller, faster, distilled model.

---

## Pipeline

```
 v1 (Sep 2025)        v2 (Dec 2025)                         v3 (Dec 2025, default)
 ──────────────       ─────────────────────────────         ───────────────────────────────────────
 GPT-4o-mini scores   SAM 3, zero-shot, prompted with       SAM 3 auto-labels the scalp images  ──►
 (replaced by a real  "bald spot" (Roboflow Workflows)      RF-DETR trained on those labels
 measurement)         no training data needed               (distillation)
                                                            ("Scalp Density Detector v4")
```

1. **v1, LLM scoring (replaced).** The first version asked an LLM to score density, lighting and sharpness. I replaced it with segmentation so the output is an actual measured area.
2. **v2, zero-shot SAM 3.** A Roboflow Workflow runs SAM 3 with the text prompt `"bald spot"` and returns instance masks. It needs no labelled data, but it's slow and inconsistent between photos (see evaluation).
3. **v3, distilled RF-DETR (default).** I used SAM 3 to **auto-label** the dataset and trained an **RF-DETR** model on those labels. The result is a model that is specialised for scalps, much faster, and more stable than prompting a foundation model every time.

Both models stay in the app so they can be compared. The model switcher is hidden behind the Konami code (↑ ↑ ↓ ↓ ← → ← → B A), and `/test` runs every test pair through a chosen model.

## How the measurement works

- **Area.** Each detection's polygon area is computed with the shoelace formula (falling back to the bounding box when there's no polygon). Areas are summed and divided by the image area, which gives `areaPercentage`.
- **Change.** `(after − before) / before`, shown as a relative percentage.
- **Confidence descent.** If nothing is detected at confidence 0.5, the API retries at 0.4, 0.3 … down to 0.1 and reports the highest detection confidence, so "nothing found" and "found at low confidence" are distinguishable.
- **Speed.** Before and after images are analysed in parallel. Progress and per-step timings are streamed to the UI with server-sent events.

## Evaluation (v2, zero-shot SAM 3)

Run on 2026-10-18 against the four public test pairs in `public/test-images`, through the deployed `/api/analyze` endpoint.

| Pair | Server time | Before (area %, conf) | After (area %, conf) |
|---|---|---|---|
| 1 | 2.8 s | 4.44 %, 0.67 | 3.79 %, 0.32 |
| 2 | 4.8 s | not detected | 4.60 %, 0.10 |
| 3 | 4.4 s | 5.49 %, 0.15 | not detected |
| 4 | 2.3 s | not detected | not detected |

What this shows:

- Zero-shot SAM 3 found a bald spot in only **3 of 8 images**, and two of those needed the confidence floor (0.10–0.15).
- **2.3–4.8 s** per pair, partly because of the confidence-descent retries.
- With misses this frequent, the "change" number is unreliable. That's the reason for distilling a dedicated model.

## Known limitations and what I'd do next

- **Normalise by scalp area, not image area.** Today a closer crop of the same head reads as "more bald". The next step is to segment the scalp too and report bald area ÷ scalp area.
- **Control for capture conditions.** Lighting, angle and wet vs. dry hair move the numbers more than real change does over a few weeks. A capture guide and a quality gate (blur, exposure, pose) would help more than a better model.
- **A real eval set.** Hand-drawn masks on a held-out set, reporting mask IoU and the error of the area % against the human labels, instead of eyeballing.

## Run locally

```bash
npm install
npm run dev                  # http://localhost:3000
```

Create `.env.local` in the project root:

```
ROBOFLOW_API_KEY=...       # Roboflow Workflows (v2, SAM 3)
ROBOFLOW_API_KEY_PRO=...   # hosted RF-DETR model (v3)
```

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · Roboflow Workflows / hosted inference · SAM 3 · RF-DETR · deployed on Vercel.

---

Built by [Gustavo Loureiro dos Reis](https://www.linkedin.com/in/gustavo-loureiro-dos-reis/). Test images are from public sources.
