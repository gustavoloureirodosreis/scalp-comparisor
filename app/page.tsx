"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ImageResult = {
  area: number;
  areaPercentage: number;
  imageWidth: number;
  imageHeight: number;
  confidence: number;
  detected: boolean;
  boundingBox?: { x: number; y: number; width: number; height: number };
  allPolygons?: { x: number; y: number }[][];
  maskImage?: string;
};

type Analysis = {
  before: ImageResult;
  after: ImageResult;
};

function ImageWithOverlay({
  file,
  result,
  label,
}: {
  file: File;
  result: ImageResult;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageDimensions, setImageDimensions] = useState<{
    width: number;
    height: number;
    naturalWidth: number;
    naturalHeight: number;
  } | null>(null);

  const previewUrl = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      // Calculate displayed size maintaining aspect ratio within container
      const maxWidth = 400;
      const maxHeight = 300;
      const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
      setImageDimensions({
        width: img.width * ratio,
        height: img.height * ratio,
        naturalWidth: img.width,
        naturalHeight: img.height,
      });
    };
    img.src = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    if (!canvasRef.current || !imageDimensions || !result.detected) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = imageDimensions.width;
    canvas.height = imageDimensions.height;

    // Scale factor from natural to displayed size
    const scaleX = imageDimensions.width / imageDimensions.naturalWidth;
    const scaleY = imageDimensions.height / imageDimensions.naturalHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw ALL polygon masks if available
    if (result.allPolygons && result.allPolygons.length > 0) {
      for (const polygon of result.allPolygons) {
        if (polygon.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(polygon[0].x * scaleX, polygon[0].y * scaleY);
          for (let i = 1; i < polygon.length; i++) {
            ctx.lineTo(polygon[i].x * scaleX, polygon[i].y * scaleY);
          }
          ctx.closePath();
          ctx.fillStyle = "rgba(239, 68, 68, 0.3)";
          ctx.fill();
          ctx.strokeStyle = "rgba(239, 68, 68, 0.9)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }
    // Draw bounding box as fallback
    else if (result.boundingBox) {
      const { x, y, width, height } = result.boundingBox;
      // x, y are center coordinates
      const left = (x - width / 2) * scaleX;
      const top = (y - height / 2) * scaleY;
      const w = width * scaleX;
      const h = height * scaleY;

      ctx.fillStyle = "rgba(239, 68, 68, 0.2)";
      ctx.fillRect(left, top, w, h);
      ctx.strokeStyle = "rgba(239, 68, 68, 0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(left, top, w, h);
    }
  }, [imageDimensions, result]);

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-center">
        {label}
      </div>
      <div className="relative inline-block mx-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={`${label} image`}
          className="rounded-lg shadow-md"
          style={{
            width: imageDimensions?.width || "auto",
            height: imageDimensions?.height || "auto",
            maxWidth: 400,
            maxHeight: 300,
            objectFit: "contain",
          }}
        />
        {result.detected && imageDimensions && (
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 pointer-events-none rounded-lg"
            style={{
              width: imageDimensions.width,
              height: imageDimensions.height,
            }}
          />
        )}
      </div>
    </div>
  );
}

function AreaCard({
  label,
  result,
  comparison,
}: {
  label: string;
  result: ImageResult;
  comparison?: ImageResult;
}) {
  // Use percentage for comparison (resolution-independent)
  const change =
    comparison && comparison.areaPercentage > 0 && result.areaPercentage > 0
      ? ((result.areaPercentage - comparison.areaPercentage) /
          comparison.areaPercentage) *
        100
      : null;

  return (
    <div className="border border-border rounded-xl p-6 bg-card shadow-sm flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        {result.detected && (
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 font-medium">
            Detected
          </span>
        )}
        {!result.detected && (
          <span className="text-xs px-2 py-1 rounded-full bg-amber-500/10 text-amber-600 font-medium">
            Not detected
          </span>
        )}
      </div>

      {result.detected ? (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-4xl font-bold tabular-nums tracking-tight">
              {result.areaPercentage.toFixed(2)}%
            </span>
            <span className="text-sm text-muted-foreground">
              of image area ({result.imageWidth}×{result.imageHeight}px)
            </span>
          </div>

          <div className="flex items-center gap-4 pt-2 border-t border-border/50">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Confidence</span>
              <span className="text-lg font-semibold tabular-nums">
                {result.confidence}%
              </span>
            </div>
            {change !== null && label === "After" && (
              <div className="flex flex-col ml-auto text-right">
                <span className="text-xs text-muted-foreground">Change</span>
                <span
                  className={`text-lg font-semibold tabular-nums ${
                    change < 0
                      ? "text-emerald-600"
                      : change > 0
                      ? "text-rose-600"
                      : "text-muted-foreground"
                  }`}
                >
                  {change > 0 ? "+" : ""}
                  {change.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-4 text-muted-foreground">
          No bald spot detected in this image
        </div>
      )}
    </div>
  );
}

function ImageDrop({
  label,
  file,
  setFile,
}: {
  label: string;
  file: File | null;
  setFile: (f: File | null) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file]
  );

  return (
    <label
      className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 w-full sm:w-[320px] h-[220px] cursor-pointer transition-all duration-200 ${
        dragging
          ? "border-primary bg-primary/5 scale-[1.02]"
          : "border-border bg-card hover:border-primary/50 hover:bg-muted/50"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) setFile(f);
      }}
    >
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt={`${label} preview`}
          className="rounded-lg max-h-[180px] object-contain shadow-sm"
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-center text-sm text-muted-foreground gap-2">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <svg
              className="w-6 h-6 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <div className="font-medium text-foreground">{label}</div>
            <div className="text-xs opacity-70 mt-1">
              Click or drag to upload
            </div>
          </div>
        </div>
      )}
    </label>
  );
}

export default function Home() {
  const [before, setBefore] = useState<File | null>(null);
  const [after, setAfter] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);

  const canAnalyze = !!before && !!after && !loading;

  async function startAnalysis() {
    if (!before || !after) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("before", before);
      fd.append("after", after);
      const res = await fetch("/api/analyze", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Request failed: ${res.status}`);
      }
      const data = (await res.json()) as Analysis;
      setResult(data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Analysis failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function restart() {
    setBefore(null);
    setAfter(null);
    setResult(null);
    setError(null);
    setLoading(false);
  }

  // Calculate change using percentage (resolution-independent)
  const percentageChange =
    result &&
    result.before.detected &&
    result.after.detected &&
    result.before.areaPercentage > 0
      ? ((result.after.areaPercentage - result.before.areaPercentage) /
          result.before.areaPercentage) *
        100
      : null;

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="w-full max-w-[960px] bg-card/80 backdrop-blur-sm border border-border shadow-2xl rounded-3xl p-8 sm:p-10 flex flex-col gap-8">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25 mb-2">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900 dark:from-white dark:via-slate-200 dark:to-white bg-clip-text text-transparent">
            Bald Spot Analyzer
          </h1>
          <p className="text-sm text-muted-foreground max-w-[500px] leading-relaxed">
            Upload before and after photos to measure bald spot area. Results
            are normalized by image resolution for accurate comparison.
          </p>
        </div>

        {/* Image upload / results with overlay */}
        {!result ? (
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <ImageDrop label="Before photo" file={before} setFile={setBefore} />
            <ImageDrop label="After photo" file={after} setFile={setAfter} />
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            {before && (
              <ImageWithOverlay
                file={before}
                result={result.before}
                label="Before"
              />
            )}
            {after && (
              <ImageWithOverlay
                file={after}
                result={result.after}
                label="After"
              />
            )}
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          {!result && (
            <button
              className="h-12 px-8 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-medium shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-lg"
              disabled={!canAnalyze}
              onClick={startAnalysis}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Analyzing...
                </span>
              ) : (
                "Analyze Images"
              )}
            </button>
          )}
          <button
            className="h-12 px-6 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            onClick={restart}
          >
            {result ? "Start Over" : "Reset"}
          </button>
        </div>

        {error && (
          <div className="text-center p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900">
            <span className="text-rose-600 dark:text-rose-400 text-sm">
              {error}
            </span>
          </div>
        )}

        {result && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <AreaCard label="Before" result={result.before} />
            <AreaCard
              label="After"
              result={result.after}
              comparison={result.before}
            />
          </div>
        )}

        {percentageChange !== null && (
          <div className="text-center p-6 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-900/50 border border-border">
            <div className="text-sm text-muted-foreground mb-2">Summary</div>
            <div className="text-lg font-medium">
              {percentageChange < 0 ? (
                <span className="text-emerald-600">
                  Bald spot area decreased by{" "}
                  {Math.abs(percentageChange).toFixed(1)}%
                </span>
              ) : percentageChange > 0 ? (
                <span className="text-rose-600">
                  Bald spot area increased by {percentageChange.toFixed(1)}%
                </span>
              ) : (
                <span className="text-muted-foreground">
                  No change in bald spot area
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
