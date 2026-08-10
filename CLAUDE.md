# Nova Play — agent guide

Private Xtream Codes IPTV player. Vite + TypeScript, no framework.
See `README.md` for the feature surface; this file is the working contract.

**LG webOS TV is the only shipping target.** An Android phone app is a real
product requirement and is being proved out — see *Where the multi-platform
refactor stands* below before writing anything outside `src/`.

## The webOS target constrains everything it touches

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

**These are webOS-target rules, not house style.** They bind `src/`, `webos-app/`,
and anything in the webOS import graph. They do not bind code written for another
runtime: on a modern Android System WebView, Chromium 79 is a floor, not a ceiling,
and the motion policy is a D-pad repaint budget that a touch UI does not have.

They are also **not enforced outside that graph**. `check-webos-bundle` reads only
`webos-app/`; both CSS guards read only `src/style.css` and generated webOS CSS;
`check-import-cycles` walks only `src/` and relative imports. Anything at another
path passes because nothing looks at it. Never read a green build as coverage of
code the guards cannot see — say so explicitly instead.

## Commands

```bash
npm test                  # vitest run — 48 test files, 442 tests
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

Android build output — `**/android/app/build/`, `**/android/.gradle/`, `*.apk`,
`*.aab` — is gitignored for the same reason and must stay that way. An APK embeds
the whole web bundle, so a committed one is both a huge binary and a credential
exposure surface.

## Large files — grep, don't read

| File | Size |
|---|---|
| `src/main.ts` | 9,397 lines (~85k tokens) |
| `src/library/catalog-repository.ts` | 4,904 lines |
| `src/style.css` | 86 KB |
| `docs/library-engine/journal/2026-08-04.md` | 93 KB (largest journal day) |
| `docs/library-engine/contracts.md` | 61 KB |

Reading any of these whole burns most of a context window. Use `Grep` with context,
or `Read` with `offset`/`limit`. `main.ts` is a flat module of top-level functions —
grep the function name.

## Where the multi-platform refactor stands

An Android **phone** app is a real product requirement. webOS remains the only
shipping target, and **nothing about the repository layout has been decided**.

| Document | Standing |
|---|---|
| `plans/main-refactor-v3.md` | **The plan of record. Execute this one.** Four phases: pin requirements → prove phone playback in a disposable spike → ship the phone app → controlled release. |
| `plans/main-refactor-v2.md` | Nine-phase three-app monorepo proposal. **Not approved — do not execute.** Superseded by v3, which lifts the parts that survived. Still the reference for the feature-owned state table, the atomic contract-migration mapping, and the full blocking-question list. |
| `plans/main-refactor-assessment.md` | Six-agent audit of the original plan. Findings hold; v2 absorbed them. |
| `plans/council-2026-08-09-main-refactor-v2.md` | Why v2 was rejected. Verdict plus full transcript. |

The shape, in short: prove Android playback first in a **disposable spike** that
imports nothing from the shipping app; phone before Android TV; duplicate
composition glue rather than extracting it; share a module only once both
products actively consume it.

**Until `docs/adr/android-playback-backend.md` exists and names a passing
backend:** do not create workspace packages, do not move anything out of `src/`,
do not build `scripts/target-registry.mjs`, and do not start Android TV.

**Guards are extended in the same commit as the first code movement they need to
police** — never preemptively, never as a phase of their own. See v3 §5.

## The two Library Engine documents

"Engine" here means the **local-first Library Engine** — the profile-isolated
IndexedDB catalog under `src/library/`. It is unrelated to the `@nova/engine`
shared package proposed in `main-refactor-v2.md`, which does not exist and is
not approved. Don't conflate them.

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
  or any shipped artifact — IPK, APK, AAB, or WebView assets. The metadata proxy
  exists so TMDB/Trakt secrets never reach the device. This extends to anything
  captured from a device: sanitize provider URLs and payloads out of spike reports,
  logs and ADRs before committing them.
- Resume/favorite identity is the composite `section:streamType:id` — ID alone
  collides across sections.
- No import cycles in `src/` — enforced at build time.
