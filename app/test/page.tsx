"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// Test image pairs configuration
const TEST_PAIRS = [
  {
    id: 1,
    before: "/test-images/before01.jpg",
    after: "/test-images/after01.jpg",
  },
  {
    id: 2,
    before: "/test-images/before02.png",
    after: "/test-images/after02.png",
  },
  {
    id: 3,
    before: "/test-images/before03.png",
    after: "/test-images/after03.png",
  },
  {
    id: 4,
    before: "/test-images/before04.png",
    after: "/test-images/after04.png",
  },
];

const MODELS = [
  {
    id: "scalp-density-detector",
    name: "Scalp Density Detector v4",
    shortName: "SDDv4",
  },
  { id: "nivel-de-cabelo", name: "Nivel de Cabelo (Legacy)", shortName: "NdC" },
];

type ImageResult = {
  area: number;
  areaPercentage: number;
  imageWidth: number;
  imageHeight: number;
  confidence: number;
  detected: boolean;
  allPolygons?: { x: number; y: number }[][];
};

type TestResult = {
  pairId: number;
  modelId: string;
  modelName: string;
  before: ImageResult;
  after: ImageResult;
  beforeUrl: string;
  afterUrl: string;
  duration: number;
  error?: string;
};

type TestStatus = "idle" | "running" | "complete";

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

async function fetchImageAsFile(url: string): Promise<File> {
  const response = await fetch(url);
  const blob = await response.blob();
  const filename = url.split("/").pop() || "image";
  return new File([blob], filename, { type: blob.type });
}

async function runAnalysis(
  beforeUrl: string,
  afterUrl: string,
  modelId: string
): Promise<{ before: ImageResult; after: ImageResult; duration: number }> {
  const startTime = performance.now();

  const [beforeFile, afterFile] = await Promise.all([
    fetchImageAsFile(beforeUrl),
    fetchImageAsFile(afterUrl),
  ]);

  const fd = new FormData();
  fd.append("before", beforeFile);
  fd.append("after", afterFile);
  fd.append("model", modelId);

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
  let result: { before: ImageResult; after: ImageResult } | null = null;

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
          if (event.type === "complete") {
            result = event.result;
          } else if (event.type === "error") {
            throw new Error(event.error);
          }
        } catch {
          // Skip parse errors
        }
      }
    }
  }

  if (!result) {
    throw new Error("No result received");
  }

  const duration = Math.round(performance.now() - startTime);
  return { ...result, duration };
}

// Component to display image with polygon overlay
function ImageWithOverlay({
  src,
  result,
  label,
}: {
  src: string;
  result: ImageResult;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
    naturalWidth: number;
    naturalHeight: number;
  } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const maxWidth = 140;
      const maxHeight = 100;
      const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
      setDimensions({
        width: img.width * ratio,
        height: img.height * ratio,
        naturalWidth: img.width,
        naturalHeight: img.height,
      });
    };
    img.src = src;
  }, [src]);

  useEffect(() => {
    if (
      !canvasRef.current ||
      !dimensions ||
      !result.detected ||
      !result.allPolygons
    )
      return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const scaleX = dimensions.width / result.imageWidth;
    const scaleY = dimensions.height / result.imageHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const polygon of result.allPolygons) {
      if (polygon.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(polygon[0].x * scaleX, polygon[0].y * scaleY);
        for (let i = 1; i < polygon.length; i++) {
          ctx.lineTo(polygon[i].x * scaleX, polygon[i].y * scaleY);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(244, 211, 94, 0.4)";
        ctx.fill();
        ctx.strokeStyle = "rgba(244, 211, 94, 1)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }, [dimensions, result]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-[9px] text-muted-foreground uppercase">{label}</div>
      <div className="relative rounded-lg overflow-hidden border border-border/30 bg-black/20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={label}
          style={{
            width: dimensions?.width || 140,
            height: dimensions?.height || 100,
            objectFit: "contain",
          }}
        />
        {result.detected && dimensions && (
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 pointer-events-none"
            style={{
              width: dimensions.width,
              height: dimensions.height,
            }}
          />
        )}
      </div>
      <div className="text-[10px] font-medium tabular-nums">
        {result.detected ? (
          <span className="text-primary">
            {result.areaPercentage.toFixed(2)}%
          </span>
        ) : (
          <span className="text-muted-foreground">No detection</span>
        )}
      </div>
    </div>
  );
}

function ResultCard({ result }: { result: TestResult }) {
  const percentageChange =
    result.before.detected &&
    result.after.detected &&
    result.before.areaPercentage > 0
      ? ((result.after.areaPercentage - result.before.areaPercentage) /
          result.before.areaPercentage) *
        100
      : null;

  return (
    <div className="border border-border/30 rounded-xl bg-card/50 p-4 animate-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/20">
        <span className="text-xs font-bold text-primary uppercase">
          Pair {result.pairId}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {formatDuration(result.duration)}
        </span>
      </div>

      {result.error ? (
        <div className="text-destructive text-sm">{result.error}</div>
      ) : (
        <div className="space-y-3">
          {/* Images with overlays */}
          <div className="flex items-center justify-center gap-3">
            <ImageWithOverlay
              src={result.beforeUrl}
              result={result.before}
              label="Before"
            />
            <div className="text-muted-foreground/40 text-lg">→</div>
            <ImageWithOverlay
              src={result.afterUrl}
              result={result.after}
              label="After"
            />
          </div>

          {/* Delta */}
          <div className="text-center pt-2 border-t border-border/20">
            {percentageChange !== null ? (
              <span
                className={`text-sm font-bold ${
                  percentageChange < 0
                    ? "text-primary"
                    : percentageChange > 0
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                Delta: {percentageChange < 0 ? "" : "+"}
                {percentageChange.toFixed(1)}%
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground uppercase">
                No comparison available
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TestPage() {
  const [status, setStatus] = useState<TestStatus>("idle");
  const [results, setResults] = useState<TestResult[]>([]);
  const [currentTest, setCurrentTest] = useState<string>("");

  async function runAllTests() {
    setStatus("running");
    setResults([]);
    const allResults: TestResult[] = [];

    for (const pair of TEST_PAIRS) {
      for (const model of MODELS) {
        setCurrentTest(`Pair ${pair.id} with ${model.shortName}`);

        try {
          const result = await runAnalysis(pair.before, pair.after, model.id);
          const testResult: TestResult = {
            pairId: pair.id,
            modelId: model.id,
            modelName: model.name,
            before: result.before,
            after: result.after,
            beforeUrl: pair.before,
            afterUrl: pair.after,
            duration: result.duration,
          };
          allResults.push(testResult);
          setResults([...allResults]);
        } catch (error) {
          const testResult: TestResult = {
            pairId: pair.id,
            modelId: model.id,
            modelName: model.name,
            before: {
              area: 0,
              areaPercentage: 0,
              imageWidth: 0,
              imageHeight: 0,
              confidence: 0,
              detected: false,
            },
            after: {
              area: 0,
              areaPercentage: 0,
              imageWidth: 0,
              imageHeight: 0,
              confidence: 0,
              detected: false,
            },
            beforeUrl: pair.before,
            afterUrl: pair.after,
            duration: 0,
            error: error instanceof Error ? error.message : "Unknown error",
          };
          allResults.push(testResult);
          setResults([...allResults]);
        }
      }
    }

    setCurrentTest("");
    setStatus("complete");
  }

  // Group results by model
  const resultsByModel = MODELS.map((model) => ({
    model,
    results: results.filter((r) => r.modelId === model.id),
    totalTime: results
      .filter((r) => r.modelId === model.id)
      .reduce((sum, r) => sum + r.duration, 0),
  }));

  return (
    <div className="min-h-screen w-full flex flex-col items-center p-6 gap-6">
      {/* Header */}
      <div className="w-full max-w-6xl flex items-center justify-between">
        <Link
          href="/"
          className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back
        </Link>
        <div className="text-[10px] text-muted-foreground font-mono">
          TEST_SUITE_V1
        </div>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-6xl bg-card rounded-2xl shadow-xl p-8 flex flex-col gap-6">
        {/* Title */}
        <div className="text-center border-b border-border/20 pb-6">
          <h1 className="text-2xl font-bold uppercase tracking-wider text-accent">
            Batch Model Test
          </h1>
          <p className="text-xs text-muted-foreground mt-2">
            Will test {TEST_PAIRS.length} image pairs across {MODELS.length}{" "}
            models
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={runAllTests}
            disabled={status === "running"}
            className="h-12 px-8 rounded-lg bg-primary text-primary-foreground font-bold uppercase tracking-wider hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
          >
            {status === "running" ? "Running..." : "Run All Tests"}
          </button>
        </div>

        {/* Current test indicator */}
        {status === "running" && currentTest && (
          <div className="text-center animate-pulse">
            <span className="text-xs text-muted-foreground">
              Running: {currentTest}
            </span>
          </div>
        )}

        {/* Results by Model */}
        {results.length > 0 && (
          <div className="space-y-8">
            {resultsByModel.map(
              ({ model, results: modelResults, totalTime }) => (
                <div key={model.id} className="space-y-4">
                  {/* Model Header */}
                  <div className="flex items-center justify-between border-b border-border/20 pb-2">
                    <div className="flex items-center gap-3">
                      <h2 className="text-sm font-bold uppercase tracking-wider text-primary">
                        {model.name}
                      </h2>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {modelResults.length} / {TEST_PAIRS.length} tests
                      </span>
                    </div>
                    {modelResults.length > 0 && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Total: {formatDuration(totalTime)}
                      </span>
                    )}
                  </div>

                  {/* Results Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {modelResults.map((result, idx) => (
                      <ResultCard
                        key={`${result.modelId}-${result.pairId}-${idx}`}
                        result={result}
                      />
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* Model Comparison Summary */}
        {status === "complete" &&
          resultsByModel.every(
            (m) => m.results.length === TEST_PAIRS.length
          ) && (
            <div className="border border-primary/30 rounded-xl bg-primary/5 p-6 animate-enter">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-4 text-center">
                {`/// MODEL COMPARISON ///`}
              </div>
              <div className="grid grid-cols-2 gap-6">
                {resultsByModel.map(({ model, totalTime }) => (
                  <div key={model.id} className="text-center">
                    <div className="text-xs text-muted-foreground mb-1">
                      {model.name}
                    </div>
                    <div className="text-2xl font-bold text-primary tabular-nums">
                      {formatDuration(totalTime)}
                    </div>
                  </div>
                ))}
              </div>
              {resultsByModel.length === 2 && (
                <div className="text-center mt-4 pt-4 border-t border-border/20">
                  <span className="text-xs text-muted-foreground">
                    {resultsByModel[0].totalTime <
                    resultsByModel[1].totalTime ? (
                      <>
                        <span className="text-primary font-bold">
                          {resultsByModel[0].model.shortName}
                        </span>{" "}
                        was{" "}
                        <span className="text-primary font-bold">
                          {(
                            ((resultsByModel[1].totalTime -
                              resultsByModel[0].totalTime) /
                              resultsByModel[1].totalTime) *
                            100
                          ).toFixed(0)}
                          % faster
                        </span>
                      </>
                    ) : resultsByModel[1].totalTime <
                      resultsByModel[0].totalTime ? (
                      <>
                        <span className="text-primary font-bold">
                          {resultsByModel[1].model.shortName}
                        </span>{" "}
                        was{" "}
                        <span className="text-primary font-bold">
                          {(
                            ((resultsByModel[0].totalTime -
                              resultsByModel[1].totalTime) /
                              resultsByModel[0].totalTime) *
                            100
                          ).toFixed(0)}
                          % faster
                        </span>
                      </>
                    ) : (
                      "Both models took the same time"
                    )}
                  </span>
                </div>
              )}
            </div>
          )}
      </div>

      {/* Footer */}
      <div className="text-[10px] text-foreground/40 font-mono">
        SECRET_LAB_TEST_SUITE
      </div>
    </div>
  );
}
