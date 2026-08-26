"use client";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [light, setLight] = useState<boolean | null>(null);

  useEffect(() => setLight(document.documentElement.classList.contains("light")), []);
  if (light === null) return <span className="h-8 w-14" />;

  function toggle() {
    const next = !light;
    document.documentElement.classList.toggle("light", next);
    try { localStorage.setItem("pn-theme", next ? "light" : "dark"); } catch {}
    setLight(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle light mode"
      className="relative flex h-8 w-14 items-center rounded-full border border-line bg-panel px-1 transition"
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[11px] text-white shadow transition-transform duration-300 ${
          light ? "translate-x-6" : "translate-x-0"
        }`}
      >
        {light ? "☀" : "☾"}
      </span>
    </button>
  );
}
