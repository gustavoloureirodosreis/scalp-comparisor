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

## Evaluation: zero-shot SAM 3 vs. distilled RF-DETR

Run on 2026-10-18 against the four public test pairs in `public/test-images`, through the deployed `/api/analyze` endpoint, twice per model (cold, then warm). Cells show bald-spot area % and the highest detection confidence. Area results were identical across both runs.

| Pair | SAM 3 before | SAM 3 after | RF-DETR before | RF-DETR after |
|---|---|---|---|---|
| 1 | 4.44 % (0.67) | 3.79 % (0.32) | 4.84 % (0.85) | 3.59 % (0.90) |
| 2 | not detected | 4.60 % (0.10) | 9.59 % (0.92) | 3.89 % (0.90) |
| 3 | 5.49 % (0.15) | not detected | 7.35 % (0.93) | not detected |
| 4 | not detected | not detected | 3.09 % (0.76) | not detected |

| | SAM 3 (zero-shot) | RF-DETR (distilled) |
|---|---|---|
| Bald spot found in "before" photos | 2 of 4 | **4 of 4** |
| Confidence of detections | 0.10–0.67 | **0.76–0.93** |
| Server time per pair, warm | 1.6–5.6 s | **0.2–0.5 s** |

What this shows:

- The distilled model finds the bald spot in every "before" photo with high confidence. Zero-shot SAM 3 misses half of them and often only finds something at the confidence floor.
- It is roughly **5–10× faster** warm. The first, cold call can still take several seconds, especially when the "after" photo has nothing to detect and the confidence descent retries all the way down to 0.1.
- On pair 2, SAM 3 reports the "after" as balder than the "before", which is the wrong direction. RF-DETR reports a 59 % reduction.
- Both models detect nothing in the "after" photos of pairs 3 and 4. That's consistent with a successful treatment, but without ground-truth masks I can't confirm it. That's why a real eval set is on the list below.

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
