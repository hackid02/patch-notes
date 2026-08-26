# Review brief — attack this codebase for me

You are reviewing **Patch Notes** ahead of a competition deadline. Be adversarial, not polite.
I want bugs, not encouragement. Prioritize: correctness crashes > security > math/logic errors > UX papercuts.

## How to review

1. **Read the code** in this order: `lib/pipeline.ts`, `lib/mcp.ts`, `lib/auth.ts`, `lib/guard.ts`,
   `app/api/announce/route.ts`, `app/api/patch/stream/route.ts`, `lib/store.ts`, then components.
2. **Run it**: `npm install && npm run dev`. Landing + `/patch/1_0` and `/patch/1_1` render from
   **sample fixtures** with zero credentials — use those for UI/UX review (this is the intended offline path).
   Do NOT expect generation/announce to work without the owner's OAuth file — that path is reviewable by reading only.
3. Report every finding as: **SEV (P0/P1/P2) · file:line · what's wrong · minimal fix**.

## Specifically interrogate

- **Window math** (`lib/pipeline.ts`): `inWindow` bounds, prev-window computation across month edges,
  snowflake decode for both X and Discord epochs, `limit:100` pagination termination.
- **Percent math**: divide-by-zero paths in buff/nerf deltas and meta ratio (prev=0, curr=0 cases).
- **OAuth edge cases** (`lib/auth.ts`, `lib/mcp.ts`): refresh-rotation reuse, single-flight refresh under
  concurrent calls, origin derivation behind proxies (Host vs x-forwarded-*), DCR cache poisoning.
- **Guard bypasses** (`lib/guard.ts`): can an unauthenticated caller trigger generation or a paid `post_content`
  call? Check Origin checks, cookie checks, and the SSE stream route equally.
- **Rate-limit behavior**: ~20 calls/min/user — does the pacing actually stay under it incl. skill polls?
- **Patch page rendering** (`app/patch/[version]/page.tsx`, `components/PatchNotes.tsx`): empty-state crashes —
  patch with zero champions, no fanOfThePatch, empty buffs AND nerfs, missing provenance.
- **Hydration/SSR traps**, `async` params usage (Next 16), unescaped `'`/`"` in JSX.
- **Anything that would embarrass us in a judge demo** — dead links, lorem text, console errors,
  broken light/dark flip, keyboard navigation gaps.

## Known-and-accepted (don't re-report)

- File-based JSON store, single tenant (documented demo tradeoff).
- Sentiment skill often times out → derived meta fallback engages by design (guardrails disclose it).
- `send_inbox_message` deliberately unused (safety positioning).
- Tunnel dev hosting is temporary; production deploy pending.

## Output

A numbered list of findings, most severe first, each with a concrete minimal fix.
End with: "If you only fix 3 things before the deadline, fix these: …"
