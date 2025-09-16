"use client";

import { useMemo, useState } from "react";

type MetricScores = {
  scalpDensity: number;
  lighting: number;
  sharpness: number;
};

type Analysis = {
  before: MetricScores;
  after: MetricScores;
};

function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm tabular-nums">{value}%</span>
      </div>
      <div className="w-full h-2 bg-black/[.06] dark:bg-white/[.10] rounded">
        <div
          className="h-2 bg-foreground rounded"
          style={{ width: `${Math.max(0, Math.min(100, Math.round(value)))}%` }}
        />
      </div>
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
      className="flex flex-col items-center justify-center gap-2 border border-dashed border-black/[.15] dark:border-white/[.18] rounded-lg p-6 w-full sm:w-[320px] h-[220px] cursor-pointer hover:bg-black/[.02] dark:hover:bg-white/[.03] transition"
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
        <img
          src={previewUrl}
          alt={`${label} preview`}
          className="rounded max-h-[180px] object-contain"
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-center text-sm text-black/70 dark:text-white/70">
          <div className={`text-xs mb-1 ${dragging ? "underline" : ""}`}>
            Click to upload or drag and drop
          </div>
          <div className="font-medium">{label}</div>
          <div className="text-[11px] opacity-80">PNG, JPG up to ~5MB</div>
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
    } catch (e: any) {
      setError(e?.message || "Analysis failed");
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

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <div className="w-full max-w-[900px] flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Scalp Comparison</h1>

        <div className="flex flex-col sm:flex-row gap-4">
          <ImageDrop label="Before photo" file={before} setFile={setBefore} />
          <ImageDrop label="After photo" file={after} setFile={setAfter} />
        </div>

        <div className="flex gap-3">
          <button
            className={`h-10 px-4 rounded bg-foreground text-background disabled:opacity-40 disabled:cursor-not-allowed`}
            disabled={!canAnalyze}
            onClick={startAnalysis}
          >
            Start analysis
          </button>
          <button
            className="h-10 px-4 rounded border border-black/[.12] dark:border-white/[.16]"
            onClick={restart}
          >
            Restart
          </button>
        </div>

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-pulse">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="border border-black/[.08] dark:border-white/[.12] rounded-lg p-4"
              >
                <div className="h-4 w-32 bg-black/[.08] dark:bg-white/[.12] rounded mb-4" />
                <div className="h-2 w-full bg-black/[.08] dark:bg-white/[.12] rounded mb-2" />
                <div className="h-2 w-4/5 bg-black/[.08] dark:bg-white/[.12] rounded mb-2" />
                <div className="h-2 w-3/5 bg-black/[.08] dark:bg-white/[.12] rounded" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="text-red-600 dark:text-red-400 text-sm">{error}</div>
        )}

        {result && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-black/[.08] dark:border-white/[.12] rounded-lg p-4">
              <div className="font-medium mb-3">Before</div>
              <div className="flex flex-col gap-3">
                <Progress
                  label="Scalp density"
                  value={result.before.scalpDensity}
                />
                <Progress label="Lighting" value={result.before.lighting} />
                <Progress label="Sharpness" value={result.before.sharpness} />
              </div>
            </div>
            <div className="border border-black/[.08] dark:border-white/[.12] rounded-lg p-4">
              <div className="font-medium mb-3">After</div>
              <div className="flex flex-col gap-3">
                <Progress
                  label="Scalp density"
                  value={result.after.scalpDensity}
                />
                <Progress label="Lighting" value={result.after.lighting} />
                <Progress label="Sharpness" value={result.after.sharpness} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
