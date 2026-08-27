"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Patch } from "@/lib/patch";
import PatchNotes from "./PatchNotes";
import DraftActions from "./DraftActions";

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

export default function GenerateForm() {
  const router = useRouter();
  const [from, setFrom] = useState(day(-7));
  const [to, setTo] = useState(day(0));
  const [stages, setStages] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Patch | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => () => esRef.current?.close(), []);
  useEffect(() => {
    document.body.style.overflow = preview ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [preview]);

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
          if (o.preview && o.patch) {
            // guest flow: nothing archived server-side — open the live preview overlay
            setPreview(o.patch as Patch);
            setRunning(false);
          } else {
            router.push(o.url); router.refresh();
          }
        }
        if (o.type === "error") {
          es.close(); esRef.current = null;
          setError(o.message ?? "failed"); setRunning(false);
        }
      } catch { /* ignore malformed frame */ }
    };
    es.onerror = () => {
      es.close(); esRef.current = null;
      setError(stages.length === 0
        ? "couldn't start — if you haven't connected FanBase yet, hit Connect first"
        : "connection lost mid-run — retry (owner runs are cached for 2 min, they won't double-spend)");
      setRunning(false);
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

      {preview && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-void/95 backdrop-blur-sm">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line/60 bg-void/90 px-5 py-3">
            <p className="font-mono text-[10px] font-bold tracking-[0.25em] text-brand-soft uppercase">
              ⚡ live preview — your FanBase · your org's credits · not saved to the showcase series
            </p>
            <div className="flex items-center gap-3">
              <DraftActions draft={{ announcement: preview.announcement, versionLabel: "preview" }} />
              <button onClick={() => setPreview(null)}
                className="rounded-lg border border-line px-3 py-1.5 text-sm font-bold text-zinc-300 hover:text-white transition">
                ✕ close
              </button>
            </div>
          </div>
          <PatchNotes patch={preview} />
        </div>
      )}
    </div>
  );
}
