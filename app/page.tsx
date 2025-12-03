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
          ctx.fillStyle = "rgba(252, 222, 100, 0.3)"; // Yellow tint
          ctx.fill();
          ctx.strokeStyle = "rgba(252, 222, 100, 1)"; // Yellow outline
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]); // Dashed line for "precise" look
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

      ctx.strokeStyle = "rgba(252, 222, 100, 1)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(left, top, w, h);
    }
  }, [imageDimensions, result]);

  return (
    <div className="flex flex-col gap-2 animate-enter">
      <div className="flex items-center justify-between border-b border-border pb-1">
        <div className="text-xs uppercase tracking-widest font-bold text-primary">
          [{label}]
        </div>
        <div className="text-[10px] text-muted-foreground">
          IMG_DATA_00{label === "Before" ? "1" : "2"}
        </div>
      </div>
      <div className="relative inline-block mx-auto border-2 border-border bg-black/20 p-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={`${label} image`}
          className="grayscale-[20%] contrast-125"
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
            className="absolute top-1 left-1 pointer-events-none"
            style={{
              width: imageDimensions.width,
              height: imageDimensions.height,
            }}
          />
        )}
        {/* Crosshair overlay */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20">
          <div className="absolute top-1/2 left-0 w-full h-px bg-white mix-blend-difference"></div>
          <div className="absolute top-0 left-1/2 w-px h-full bg-white mix-blend-difference"></div>
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
    <div className="border-2 border-border bg-card p-4 flex flex-col gap-4 animate-enter relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-8 h-8 border-l-2 border-b-2 border-border opacity-50"></div>

      <div className="flex items-center justify-between border-b border-border/20 pb-2">
        <span className="text-xs font-bold uppercase tracking-widest text-primary">
          {label}_ANALYSIS
        </span>
        {result.detected ? (
          <span className="text-[10px] px-1 border border-primary text-primary uppercase">
            DETECTED
          </span>
        ) : (
          <span className="text-[10px] px-1 border border-muted-foreground text-muted-foreground uppercase">
            NO_SIGNAL
          </span>
        )}
      </div>

      {result.detected ? (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-5xl font-bold tabular-nums tracking-tighter text-foreground">
              {result.areaPercentage.toFixed(2)}%
            </span>
            <span className="text-xs text-muted-foreground uppercase">
              Coverage Area ({result.imageWidth}×{result.imageHeight})
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2 border-t-2 border-border/20">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase text-muted-foreground">
                Confidence
              </span>
              <span className="text-lg font-bold tabular-nums">
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
      className={`relative flex flex-col items-center justify-center gap-2 border-2 border-dashed p-6 w-full sm:w-[320px] h-[220px] cursor-pointer transition-all duration-200 animate-enter group ${
        dragging
          ? "border-primary bg-primary/10"
          : "border-border hover:border-primary hover:bg-white/5"
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
      {/* Corner markers */}
      <div className="absolute top-0 left-0 w-2 h-2 border-l-2 border-t-2 border-primary opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div className="absolute top-0 right-0 w-2 h-2 border-r-2 border-t-2 border-primary opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div className="absolute bottom-0 left-0 w-2 h-2 border-l-2 border-b-2 border-primary opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div className="absolute bottom-0 right-0 w-2 h-2 border-r-2 border-b-2 border-primary opacity-0 group-hover:opacity-100 transition-opacity"></div>

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
          className="max-h-[180px] object-contain border border-border p-1 bg-black/20"
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-center text-sm text-muted-foreground gap-4">
          <div className="w-12 h-12 border-2 border-current flex items-center justify-center group-hover:scale-110 transition-transform">
            <span className="text-2xl font-light">+</span>
          </div>
          <div>
            <div className="font-bold uppercase tracking-widest text-card-foreground">
              {label}
            </div>
            <div className="text-[10px] uppercase mt-1 opacity-70">
              [Drop Zone]
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
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 gap-8">
      {/* Top decorative ruler */}
      <div className="w-full max-w-[960px] border-b border-foreground/20 pb-2 flex justify-between text-[10px] font-mono opacity-50">
        <span>SYS.V.1.0</span>
        <span>SCALP_ANALYSIS_MODULE</span>
        <span>{new Date().toISOString().split("T")[0]}</span>
      </div>

      <div className="w-full max-w-[960px] bg-card border-2 border-foreground shadow-[8px_8px_0px_0px_rgba(33,60,40,0.2)] p-8 sm:p-10 flex flex-col gap-8 relative">
        {/* Decorative corner accents */}
        <div className="absolute top-0 left-0 w-4 h-4 border-r-2 border-b-2 border-foreground bg-background"></div>
        <div className="absolute top-0 right-0 w-4 h-4 border-l-2 border-b-2 border-foreground bg-background"></div>
        <div className="absolute bottom-0 left-0 w-4 h-4 border-r-2 border-t-2 border-foreground bg-background"></div>
        <div className="absolute bottom-0 right-0 w-4 h-4 border-l-2 border-t-2 border-foreground bg-background"></div>

        <div className="flex flex-col items-center text-center gap-4 border-b-2 border-border pb-8">
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tighter uppercase text-primary">
            Bald Spot Analyzer
          </h1>
          <div className="h-px w-24 bg-border"></div>
          <p className="text-sm text-muted-foreground max-w-[500px] leading-relaxed font-mono">
            // INITIATE COMPARISON SEQUENCE <br />
            Upload visual data points to calculate surface area delta.
          </p>
        </div>

        {/* Image upload / results with overlay */}
        <div className="min-h-[300px] flex items-center justify-center">
          {!result ? (
            <div className="flex flex-col sm:flex-row gap-6 justify-center w-full">
              <ImageDrop label="Before" file={before} setFile={setBefore} />
              <div className="hidden sm:flex items-center justify-center">
                <div className="w-px h-20 bg-border"></div>
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

        <div className="flex items-center justify-center gap-4 border-t-2 border-border pt-8">
          <button
            className="h-12 px-8 border-2 border-border bg-transparent text-card-foreground font-bold uppercase tracking-wider hover:bg-border/10 transition-colors"
            onClick={restart}
          >
            {result ? "Reset_System" : "Clear"}
          </button>
          {!result && (
            <button
              className="h-12 px-10 border-2 border-transparent bg-primary text-primary-foreground font-bold uppercase tracking-wider hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)]"
              disabled={!canAnalyze}
              onClick={startAnalysis}
            >
              {loading ? "Processing..." : "Execute Analysis"}
            </button>
          )}
        </div>

        {error && (
          <div className="text-center p-4 border-2 border-destructive/50 bg-destructive/10 animate-enter">
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
          <div className="text-center p-6 border-2 border-border bg-black/10 animate-enter">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              /// FINAL_REPORT ///
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
          </div>
        )}
      </div>

      <div className="text-[10px] text-foreground/40 font-mono">
        SYSTEM_READY // WAITING_FOR_INPUT
      </div>
    </div>
  );
}
