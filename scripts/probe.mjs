// One-shot: fire a raw MCP tools/call against FanBase and print the FULL response.
// usage: node scripts/probe.mjs <tool> '<json-args>'
import { readFileSync } from "fs";

const [tool, argStr = "{}"] = process.argv.slice(2);
const tok = JSON.parse(readFileSync(".fanbase-tokens.json", "utf8"));

const res = await fetch("https://api.copilot.fanbase.gg/mcp", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${tok.access_token}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: tool, arguments: JSON.parse(argStr) },
  }),
});

const ct = res.headers.get("content-type") ?? "";
const raw = await res.text();
console.log(`HTTP ${res.status} · ${ct}`);
let body = raw;
if (ct.includes("event-stream")) {
  body = raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).map((d) => { try { return JSON.stringify(JSON.parse(d), null, 1); } catch { return d; } }).join("\n---frame---\n");
} else {
  try { body = JSON.stringify(JSON.parse(raw), null, 1); } catch {}
}
console.log(body.slice(0, 6000));
