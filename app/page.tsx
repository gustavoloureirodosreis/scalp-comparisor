"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Progress tracking types
type StepStatus = "pending" | "running" | "completed";
type StepName =
  | "validate"
  | "prepare"
  | "analyze_before"
  | "analyze_after"
  | "finalize";

type StepProgress = {
  step: StepName;
  label: string;
  status: StepStatus;
  duration?: number;
};

type ProgressState = {
  steps: StepProgress[];
  currentStep: StepName | null;
  totalDuration: number | null;
  isComplete: boolean;
};

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

    const scaleX = imageDimensions.width / imageDimensions.naturalWidth;
    const scaleY = imageDimensions.height / imageDimensions.naturalHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (result.allPolygons && result.allPolygons.length > 0) {
      for (const polygon of result.allPolygons) {
        if (polygon.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(polygon[0].x * scaleX, polygon[0].y * scaleY);
          for (let i = 1; i < polygon.length; i++) {
            ctx.lineTo(polygon[i].x * scaleX, polygon[i].y * scaleY);
          }
          ctx.closePath();
          ctx.fillStyle = "rgba(244, 211, 94, 0.3)"; // Pastel yellow tint
          ctx.fill();
          ctx.strokeStyle = "rgba(244, 211, 94, 0.9)"; // Pastel yellow outline
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    } else if (result.boundingBox) {
      const { x, y, width, height } = result.boundingBox;
      const left = (x - width / 2) * scaleX;
      const top = (y - height / 2) * scaleY;
      const w = width * scaleX;
      const h = height * scaleY;

      ctx.strokeStyle = "rgba(244, 211, 94, 0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(left, top, w, h);
    }
  }, [imageDimensions, result]);

  return (
    <div className="flex flex-col gap-2 animate-enter">
      <div className="flex items-center justify-between border-b border-border/30 pb-1">
        <div className="text-xs uppercase tracking-widest font-bold text-primary">
          [{label}]
        </div>
        <div className="text-[10px] text-muted-foreground">
          IMG_DATA_00{label === "Before" ? "1" : "2"}
        </div>
      </div>
      <div className="relative inline-block mx-auto rounded-lg border border-border/50 bg-black/10 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={`${label} image`}
          className="rounded shadow-sm"
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
            className="absolute top-2 left-2 pointer-events-none rounded"
            style={{
              width: imageDimensions.width,
              height: imageDimensions.height,
            }}
          />
        )}
        {/* Softer crosshair overlay */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-10">
          <div className="absolute top-1/2 left-0 w-full h-px bg-white mix-blend-overlay"></div>
          <div className="absolute top-0 left-1/2 w-px h-full bg-white mix-blend-overlay"></div>
        </div>
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
  const change =
    comparison && comparison.areaPercentage > 0 && result.areaPercentage > 0
      ? ((result.areaPercentage - comparison.areaPercentage) /
          comparison.areaPercentage) *
        100
      : null;

  return (
    <div className="border border-border/50 bg-card/50 backdrop-blur-sm p-5 rounded-xl flex flex-col gap-4 animate-enter relative overflow-hidden group shadow-sm">
      <div className="flex items-center justify-between border-b border-border/20 pb-2">
        <span className="text-xs font-bold uppercase tracking-widest text-primary">
          {label}_ANALYSIS
        </span>
        {result.detected ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary uppercase font-medium">
            Detected
          </span>
        ) : (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase font-medium">
            No Signal
          </span>
        )}
      </div>

      {result.detected ? (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-5xl font-bold tabular-nums tracking-tight text-card-foreground">
              {result.areaPercentage.toFixed(2)}%
            </span>
            <span className="text-xs text-muted-foreground uppercase">
              Coverage Area ({result.imageWidth}×{result.imageHeight})
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/20">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase text-muted-foreground">
                Confidence
              </span>
              <span className="text-lg font-bold tabular-nums text-card-foreground">
                {result.confidence}%
              </span>
            </div>
            {change !== null && label === "After" && (
              <div className="flex flex-col text-right">
                <span className="text-[10px] uppercase text-muted-foreground">
                  Delta
                </span>
                <span
                  className={`text-lg font-bold tabular-nums ${
                    change < 0
                      ? "text-primary"
                      : change > 0
                      ? "text-destructive"
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
        <div className="text-center py-8 text-muted-foreground text-xs uppercase tracking-widest">
          Target not acquired
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
      className={`relative flex flex-col items-center justify-center gap-2 border border-dashed rounded-xl p-6 w-full sm:w-[320px] h-[220px] cursor-pointer transition-all duration-300 animate-enter group ${
        dragging
          ? "border-primary bg-primary/10 scale-[1.02]"
          : "border-border hover:border-primary/50 hover:bg-white/5"
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
          className="max-h-[180px] object-contain rounded-lg shadow-sm"
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-center text-sm text-muted-foreground gap-4">
          <div className="w-12 h-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <span className="text-2xl font-light text-primary">+</span>
          </div>
          <div>
            <div className="font-bold uppercase tracking-wider text-card-foreground text-xs mb-1">
              {label}
            </div>
            <div className="text-[10px] uppercase opacity-60">
              Click or Drop Image
            </div>
          </div>
        </div>
      )}
    </label>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

function StepProgressDisplay({ progress }: { progress: ProgressState }) {
  if (progress.steps.length === 0) return null;

  return (
    <div className="w-full max-w-md mx-auto animate-enter">
      <div className="border border-border/30 rounded-xl bg-black/20 backdrop-blur-sm p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-border/20 pb-2 mb-1">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Processing
          </span>
          {progress.isComplete && progress.totalDuration !== null && (
            <span className="text-[10px] uppercase tracking-wider text-primary font-medium">
              Total: {formatDuration(progress.totalDuration)}
            </span>
          )}
        </div>

        <div className="space-y-2">
          {progress.steps.map((step, index) => (
            <div
              key={step.step}
              className={`flex items-center gap-3 transition-all duration-300 ${
                step.status === "pending" ? "opacity-40" : "opacity-100"
              }`}
              style={{
                animationDelay: `${index * 50}ms`,
              }}
            >
              {/* Status indicator */}
              <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                {step.status === "pending" && (
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                )}
                {step.status === "running" && (
                  <div className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                )}
                {step.status === "completed" && (
                  <svg
                    className="w-4 h-4 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </div>

              {/* Step label */}
              <span
                className={`flex-1 text-xs font-medium ${
                  step.status === "running"
                    ? "text-primary"
                    : step.status === "completed"
                    ? "text-card-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>

              {/* Duration */}
              {step.status === "completed" && step.duration !== undefined && (
                <span className="text-[10px] tabular-nums text-muted-foreground font-mono">
                  {formatDuration(step.duration)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const initialProgressState: ProgressState = {
  steps: [],
  currentStep: null,
  totalDuration: null,
  isComplete: false,
};

export default function Home() {
  const [before, setBefore] = useState<File | null>(null);
  const [after, setAfter] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);
  const [progress, setProgress] = useState<ProgressState>(initialProgressState);
  const [showProgressDetails, setShowProgressDetails] = useState(false);

  const canAnalyze = !!before && !!after && !loading;

  async function startAnalysis() {
    if (!before || !after) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setProgress(initialProgressState);

    try {
      const fd = new FormData();
      fd.append("before", before);
      fd.append("after", after);

      const res = await fetch("/api/analyze", {
        method: "POST",
        body: fd,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6);
            try {
              const event = JSON.parse(jsonStr);

              if (event.type === "progress") {
                setProgress({
                  steps: event.steps,
                  currentStep: event.currentStep,
                  totalDuration: null,
                  isComplete: false,
                });
              } else if (event.type === "complete") {
                setProgress({
                  steps: event.steps,
                  currentStep: null,
                  totalDuration: event.totalDuration,
                  isComplete: true,
                });
                setResult(event.result);
              } else if (event.type === "error") {
                throw new Error(event.error);
              }
            } catch (parseError) {
              // Skip invalid JSON
              if (
                parseError instanceof Error &&
                parseError.message !== "Unexpected end of JSON input"
              ) {
                throw parseError;
              }
            }
          }
        }
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Analysis failed";
      setError(message);
      setProgress(initialProgressState);
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
    setProgress(initialProgressState);
    setShowProgressDetails(false);
  }

  const percentageChange = useMemo(() => {
    if (!result || !result.before.detected) return null;

    if (!result.after.detected) {
      return -100; // Assume 100% reduction if not detected in "after" photo
    }

    if (result.before.areaPercentage > 0) {
      return (
        ((result.after.areaPercentage - result.before.areaPercentage) /
          result.before.areaPercentage) *
        100
      );
    }

    return null;
  }, [result]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 gap-8">
      {/* Top decorative ruler - made subtler */}
      <div className="w-full max-w-[960px] border-b border-foreground/10 pb-2 flex justify-between text-[10px] font-mono opacity-40">
        <span>SYS.V.1.2</span>
        <span>SCALP_ANALYSIS_MODULE</span>
        <span>{new Date().toISOString().split("T")[0]}</span>
      </div>

      <div className="w-full max-w-[960px] bg-card rounded-2xl shadow-xl p-8 sm:p-10 flex flex-col gap-8 relative overflow-hidden">
        <div className="flex flex-col items-center text-center gap-4 border-b border-border/20 pb-8">
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight uppercase text-accent">
            Bald Spot Analyzer
          </h1>
          <div className="h-px w-16 bg-primary/30"></div>
          <p className="text-sm text-muted-foreground max-w-[500px] leading-relaxed font-mono">
            Upload visual data points to calculate surface area delta.
          </p>
        </div>

        {/* Image upload / results with overlay */}
        <div className="min-h-[300px] flex items-center justify-center">
          {loading && progress.steps.length > 0 ? (
            <StepProgressDisplay progress={progress} />
          ) : !result ? (
            <div className="flex flex-col sm:flex-row gap-6 justify-center w-full">
              <ImageDrop label="Before" file={before} setFile={setBefore} />
              <div className="hidden sm:flex items-center justify-center opacity-30">
                <div className="w-px h-12 bg-border"></div>
              </div>
              <ImageDrop label="After" file={after} setFile={setAfter} />
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-8 justify-center w-full">
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
        </div>

        <div className="flex items-center justify-center gap-4 border-t border-border/20 pt-8">
          <button
            className="h-12 px-8 border border-border/30 rounded-lg bg-transparent text-card-foreground/80 font-bold uppercase tracking-wider hover:bg-white/5 transition-colors text-sm"
            onClick={restart}
          >
            {result ? "Reset" : "Clear"}
          </button>
          {!result && (
            <button
              className="h-12 px-10 rounded-lg bg-primary text-primary-foreground font-bold uppercase tracking-wider hover:bg-primary/90 hover:translate-y-[-1px] active:translate-y-[0px] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20 text-sm"
              disabled={!canAnalyze}
              onClick={startAnalysis}
            >
              {loading ? "Processing..." : "Execute Analysis"}
            </button>
          )}
        </div>

        {error && (
          <div className="text-center p-4 border border-destructive/30 rounded-lg bg-destructive/10 animate-enter">
            <span className="text-destructive font-bold uppercase text-sm">
              [Error]: {error}
            </span>
          </div>
        )}

        {result && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 animate-enter">
            <AreaCard label="Before" result={result.before} />
            <AreaCard
              label="After"
              result={result.after}
              comparison={result.before}
            />
          </div>
        )}

        {percentageChange !== null && (
          <div className="text-center p-6 border border-border/30 rounded-xl bg-black/20 animate-enter">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              {/* eslint-disable-next-line react/jsx-no-comment-textnodes */}
              <span>/// FINAL_REPORT ///</span>
            </div>
            <div className="text-xl font-bold">
              {percentageChange < 0 ? (
                <span className="text-primary">
                  DELTA: -{Math.abs(percentageChange).toFixed(1)}% (IMPROVEMENT)
                </span>
              ) : percentageChange > 0 ? (
                <span className="text-destructive">
                  DELTA: +{percentageChange.toFixed(1)}% (REGRESSION)
                </span>
              ) : (
                <span className="text-muted-foreground">
                  DELTA: 0.0% (NO_CHANGE)
                </span>
              )}
            </div>
            {progress.totalDuration !== null && (
              <button
                onClick={() => setShowProgressDetails(true)}
                className="text-[10px] uppercase tracking-wider text-muted-foreground mt-3 pt-3 border-t border-border/20 hover:text-primary transition-colors cursor-pointer flex items-center gap-1.5 mx-auto"
              >
                <span>
                  Processed in {formatDuration(progress.totalDuration)}
                </span>
                <svg
                  className="w-3 h-3 opacity-60"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Progress Details Modal */}
        {showProgressDetails && progress.isComplete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
            onClick={() => setShowProgressDetails(false)}
          >
            <div
              className="relative animate-enter"
              onClick={(e) => e.stopPropagation()}
            >
              <StepProgressDisplay progress={progress} />
              <button
                onClick={() => setShowProgressDetails(false)}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-card border border-border/50 flex items-center justify-center text-muted-foreground hover:text-card-foreground hover:bg-card/80 transition-colors"
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="text-[10px] text-foreground/40 font-mono">
        SYSTEM_READY
      </div>
    </div>
  );
}
