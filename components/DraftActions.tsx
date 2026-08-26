"use client";
import { useRef, useState } from "react";

/**
 * Inline approval for the announcement drafts — arm-to-confirm (no native dialogs).
 * First click arms the button ("confirm?"), second click ships within 5s.
 */
export default function DraftActions({ version }: { version: string }) {
  const [log, setLog] = useState("");
  const [armed, setArmed] = useState<"x" | "discord" | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function arm(target: "x" | "discord") {
    setArmed(target);
    setLog(target === "x" ? "press again to schedule (uses credits)" : "press again to post to #announcements (uses credits)");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setArmed(null), 5000);
  }

  async function ship(target: "x" | "discord") {
    setBusy(true); setArmed(null); setLog("shipping…");
    try {
      const res = await fetch("/api/announce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, target, mode: target === "x" ? "schedule" : "post_now" }),
      });
      const json = await res.json();
      setLog(res.ok
        ? `✅ ${target === "x" ? "scheduled on X (+10 min)" : `posted to Discord #${json.channel ?? "?"}`}`
        : `❌ ${json.error}`);
    } catch (e: any) {
      setLog(`❌ ${e?.message ?? "request failed"}`);
    } finally {
      setBusy(false);
    }
  }

  function click(target: "x" | "discord") {
    if (busy) return;
    if (armed === target) void ship(target);
    else arm(target);
  }

  return (
    <div className="mt-4 flex items-center gap-3 flex-wrap">
      <button
        onClick={() => click("x")}
        disabled={busy}
        className={`rounded-xl px-4 py-2 font-display text-sm font-bold transition card-hover border ${
          armed === "x"
            ? "border-gold bg-gold/20 text-gold"
            : "border-line bg-panel text-zinc-200 hover:text-white"
        } disabled:opacity-50`}
      >
        {armed === "x" ? "⚠ Confirm schedule" : "Schedule on X"}
      </button>
      <button
        onClick={() => click("discord")}
        disabled={busy}
        className={`rounded-xl px-4 py-2 font-display text-sm font-bold transition card-hover border ${
          armed === "discord"
            ? "border-indigo-400 bg-indigo-500/25 text-indigo-200"
            : "border-indigo-500/50 bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25"
        } disabled:opacity-50`}
      >
        {armed === "discord" ? "⚠ Confirm post" : "Post Discord embed"}
      </button>
      {log && <span className="text-xs text-zinc-500">{log}</span>}
    </div>
  );
}
