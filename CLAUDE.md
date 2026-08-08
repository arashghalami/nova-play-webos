# Nova Play — agent guide

Private Xtream Codes IPTV player for LG webOS TVs. Vite + TypeScript, no framework.
See `README.md` for the feature surface; this file is the working contract.

## The target constrains everything

Physical device: **OLED55G1RLA / webOS 6.5.3 → Chromium 79**.

Chromium 79 silently discards CSS declarations it does not recognize and invalidates
any selector list containing a pseudo-class it cannot parse. No error, no fallback,
no symptom until a device screenshot is compared against intent.

**Defects here are classes, not sites.** Three separate bugs (`inset: 0`,
`:focus-visible`, `aspect-ratio`) were each found at one site and each turned out to
be systemic. When you fix a baseline or focus bug, fix the class and add a build-time
guard — do not patch the one site you found.

Banned JS globals (enforced by `scripts/check-webos-bundle.mjs`): `structuredClone`,
`reportError`, `AggregateError`, `WeakRef`, `FinalizationRegistry`,
`AbortSignal.timeout`, `Array.fromAsync`.

Only `transform` and `opacity` may be transitioned or animated. Focus changes fire on
every D-pad press; transitioning a paint property (`box-shadow`, `background`,
`border-color`) repaints every frame for the duration. `will-change` is banned in CSS
outright — if layer promotion is needed, apply it in JS to the one focused element and
remove it after.

## Commands

```bash
npm test                  # vitest run — 46 test files
npx vitest run <file>     # prefer this; the full suite is slow and noisy
npm run build             # tsc → 4 guards → vite build → worker build
npm run dev               # vite dev server
npm run package:webos     # build + proxy check + ares-package → packages/
npm run proxy:dev         # wrangler dev for metadata-proxy/
```

`npm run build` runs four guards that fail the build, not warnings:
`check-import-cycles`, `check-css-baseline` (Chromium 79), `check-css-motion`
(paint cost), `check-webos-bundle` (banned globals + asset presence).
`package:webos` additionally refuses to package unless `VITE_METADATA_PROXY_URL`
is set in the local ignored `.env`.

## Generated — never read, never edit

`webos-app/` `packages/` `dist/` `fixtures/` `.env` are all gitignored.
`webos-app/` holds ~2.5 MB of minified vendor bundles (`dash.all.min.js`,
`hls.min.js`, `mpegts.js`) plus a generated 650 KB `app.js`. Recursive shell
searches from the repo root will hit them; Grep/Glob will not.

## Large files — grep, don't read

| File | Size |
|---|---|
| `src/main.ts` | 8,221 lines (~85k tokens) |
| `src/library/catalog-repository.ts` | 4,316 lines |
| `src/style.css` | 86 KB |
| `docs/library-engine/journal/2026-08-04.md` | 93 KB (largest journal day) |
| `docs/library-engine/contracts.md` | 61 KB |

Reading any of these whole burns most of a context window. Use `Grep` with context,
or `Read` with `offset`/`limit`. `main.ts` is a flat module of top-level functions —
grep the function name.

## The two engine documents

`implementation_plan.md` (architecture, gates, identifiers) and
`LIBRARY_ENGINE_STATUS.md` (rules, baseline, phase register) are the entry points;
both are small now. Their bulk lives in `docs/library-engine/` — reference material
under the top level, dated entries under `journal/`. Each root file carries an index.
The journal is **append-only**: add new entries to
`docs/library-engine/journal/YYYY-MM-DD.md`, never edit or reorder existing ones.

## Conventions

- **Tests are contracts.** Files named `*-contract.test.ts` pin behavior that a device
  screenshot would otherwise be the only way to catch. Don't relax them to make a
  change pass — the assertion is the requirement.
- **Guards over review.** If a bug class can be detected mechanically, add it to a
  `scripts/check-*.mjs` rather than relying on future review.
- **Credentials are device-local only.** Never embed them in source, tests, fixtures,
  or the IPK. The metadata proxy exists so TMDB/Trakt secrets never reach the TV.
- Resume/favorite identity is the composite `section:streamType:id` — ID alone
  collides across sections.
- No import cycles in `src/` — enforced at build time.
