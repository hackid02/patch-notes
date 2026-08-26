"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

export default function GenerateForm() {
  const router = useRouter();
  const [from, setFrom] = useState(day(-7));
  const [to, setTo] = useState(day(0));
  const [stages, setStages] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => () => esRef.current?.close(), []);

  function generate() {
    if (running) return;
    setRunning(true); setError(""); setStages([]);
    const es = new EventSource(`/api/patch/stream?from=${from}&to=${to}`);
    esRef.current = es;

    es.onmessage = (ev) => {
      try {
        const o = JSON.parse(ev.data);
        if (o.type === "stage") setStages((p) => [...p, o.s]);
        if (o.type === "done") {
          es.close(); esRef.current = null;
          router.push(o.url); router.refresh();
        }
        if (o.type === "error") {
          es.close(); esRef.current = null;
          setError(o.message ?? "failed"); setRunning(false);
        }
      } catch { /* ignore malformed frame */ }
    };
    es.onerror = () => {
      es.close(); esRef.current = null;
      setError("connection lost mid-run — retry"); setRunning(false);
    };
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-5 text-left">
      <p className="font-mono text-[10px] font-bold tracking-[0.25em] text-zinc-500 uppercase mb-3">Generate a patch</p>
      <div className="flex gap-2 items-center flex-wrap justify-center">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
          className="rounded-lg bg-panel border border-line px-3 py-2 text-sm" disabled={running} />
        <span className="text-zinc-500">→</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
          className="rounded-lg bg-panel border border-line px-3 py-2 text-sm" disabled={running} />
        <button onClick={generate} disabled={running}
          className="rounded-xl bg-brand px-5 py-2 font-display font-bold text-white hover:bg-brand-soft disabled:opacity-50 transition card-hover">
          {running ? "Running…" : "🚀 Generate"}
        </button>
      </div>

      {running && (
        <ol className="mt-4 space-y-1.5 font-mono text-xs text-zinc-500">
          {stages.map((s, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className={i === stages.length - 1 ? "text-brand-soft animate-glow-pulse" : "text-emerald-400"}>
                {i === stages.length - 1 ? "⋯" : "✓"}
              </span>
              <span className={i === stages.length - 1 ? "text-zinc-300" : ""}>{s}</span>
            </li>
          ))}
          {stages.length === 0 && <li className="text-brand-soft animate-glow-pulse">⋯ warming up</li>}
        </ol>
      )}
      {error && <p className="mt-3 text-xs text-rose-400">❌ {error}</p>}
    </div>
  );
}
