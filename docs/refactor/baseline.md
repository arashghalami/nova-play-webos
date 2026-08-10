# Refactor baseline — the webOS release everything else is measured against

**Phase:** `plans/main-refactor-v3.md` Phase 1, step 1.
**Captured:** 2026-08-09.
**Owner:** Arash Ghalamifard (`sghalamifard@adaptavist.com`).

This file records the last webOS state verified green before any Android work
begins. Phase 2's rollback ("keep shipping the Phase 1 tag") means *this* commit.

---

## 1. Baseline commit

| Field | Value |
|---|---|
| Commit | `7a4a3b163d436dd1727b9fad5356536e27ef8a7f` |
| Short | `7a4a3b1` |
| Authored | 2026-08-09T03:03:26+02:00 |
| Subject | `docs(plans): council verdict on the three-app plan` |
| Branch | `master` |
| Tag | **not yet created** — see §4 |

**Working tree at capture.** The verification below ran against `7a4a3b1` plus
these uncommitted changes, all documentation:

```
 M .gitignore
 M CLAUDE.md
 M plans/main-refactor-v2.md
?? plans/main-refactor-v3.md
```

No file under `src/`, `public/`, `scripts/` or any build config differs from
`7a4a3b1`. The runtime source verified below is exactly the committed source.

---

## 2. `npm test` — exit 0

```
Test Files  48 passed (48)
     Tests  442 passed (442)
  Duration  9.06s
```

Matches the plan's stated baseline (48 files / 442 tests) exactly.

## 3. `npm run build` — exit 0

Full guarded chain, in order:

```
tsc
  && node scripts/check-import-cycles.mjs
  && vite build
  && node scripts/check-webos-bundle.mjs
  && node scripts/check-css-baseline.mjs
  && node scripts/check-css-motion.mjs
  && npm run build:library-probe-worker
```

Every guard passed. Verbatim guard output:

| Guard | Result |
|---|---|
| `check-import-cycles` | `Verified 43 runtime source modules contain no relative import cycles.` |
| `check-webos-bundle` | `Verified D:\Work\Tools\iptv\webos-app\app.js has no prohibited post-ES2015 globals and loads Dash.js, Hls.js, and MPEG-TS outside the application IIFE.` |
| `check-css-baseline` | `Verified 2 stylesheet(s) contain no CSS feature above the Chromium 79 webOS baseline. Allowed progressive enhancements: accent-color (8), color-scheme (2), scrollbar-width (4).` |
| `check-css-motion` | `Verified 2 stylesheet(s) animate only compositor-safe properties and declare no will-change.` |

Emitted artifacts:

| Artifact | Raw | gzip |
|---|---|---|
| `webos-app/app.js` | 647.42 kB | 142.66 kB |
| `webos-app/style.css` | 86.18 kB | 18.33 kB |
| `webos-app/library-capability-worker.js` | 6.98 kB | 2.35 kB |

Toolchain: `vite v8.1.5`. Client build 242 ms; worker build 48 ms.

**Not run:** `npm run package:webos`. It refuses to package without
`VITE_METADATA_PROXY_URL` in the local ignored `.env`, and produces an IPK — a
build artifact, not a source fact. Phase 1 is documentation-only, so packaging
was deliberately left out of this capture. It is unchanged by Phase 1 and must
be re-verified on the device before any release cut.

---

## 4. What is *not* established here

**No tag exists yet.** `git tag -l` is empty at capture time; this repository has
never been tagged. Phase 1 step 1 calls for tagging this commit. Tag creation is
a repository mutation outside `docs/` and is deliberately deferred to an explicit
owner instruction. Until it exists, `7a4a3b163d436dd1727b9fad5356536e27ef8a7f`
is the identifier Phase 2's rollback refers to.

**"Green" here is not "shipped."** `npm test` and `npm run build` are host-side
verification. Neither runs on OLED55G1RLA / webOS 6.5.3. Per `CLAUDE.md`, a
whole class of defect on this target is invisible until a device screenshot is
compared against intent. This baseline records a *verified build*, not a
device-verified release. Do not label it shippable on the strength of this file.

**Green says nothing about Android.** Per plan §5, all four guards are scoped to
hardcoded paths — `src/`, `webos-app/`, `src/style.css`, `public/appinfo.json`.
Anything at another path passes because nothing looks at it. This build result is
evidence about webOS only, and must never be cited as coverage of phone code.

---

## 5. Re-verification

To reproduce, from a clean checkout of the commit above:

```bash
npm ci
npm test          # expect 48 files / 442 tests, exit 0
npm run build     # expect all four guards to print their Verified lines, exit 0
```

A divergence in test count, guard output or bundle size means the baseline has
moved and this file is stale. Update it in the same commit that moves it.
