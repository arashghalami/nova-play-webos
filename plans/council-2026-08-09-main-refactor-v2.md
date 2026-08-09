# LLM Council transcript — should we commit to `main-refactor-v2.md`?

**Date:** 2026-08-09
**Subject:** `plans/main-refactor-v2.md` — three-app codebase (webOS TV, Android TV, Android phone) on a shared `@nova/engine`
**Method:** Karpathy LLM Council — 5 independent advisors → anonymized peer review → chairman synthesis.
**Fleet:** run on the OpenWebUI gateway via `tools/agent-harness/ask-model.py`, not native sub-agents.
Advisors: gpt-5.6-sol (xhigh), claude-opus-4-8-think (high), gpt-5.6-terra (high), gpt-5.6-luna (high), gpt-5.6-sol (high).
Reviewers: sol/xhigh, opus-4-8-think/high, terra/high, luna/high, terra/xhigh. Chairman: sol/xhigh.

---

# Chairman verdict

## Where the Council Agrees

- **Do not commit to v2 as written.** It is internally disciplined but makes architecture the critical path to the required product. The phone does not begin until Phase 7, after guard infrastructure, requirements validation, playback research, engine extraction, an Android TV product, the Phase 5 `apps/webos` move, and Phase 6—which can still choose “Defer/stop phone.”
- **Build the phone before Android TV.** Phase 4’s Android TV slice is an unjustified detour. Reconsider Android TV only after the phone ships and its support burden is known.
- **Run the Android playback canary before Phase 0.** `spikes/android-playback/` moves no shipping source and its rollback cannot affect webOS. Therefore `scripts/target-registry.mjs`, workspace-aware cycle resolution, CSS scanner parameterization, and six guard fixtures protect changes the canary does not make.
- **Do not ship a TV/D-pad interface as an honest phone product.** The phone needs touch navigation, keyboard search, system Back, orientation handling, accessibility, lifecycle behavior, and phone-owned player controls.
- **Do not remain webOS-only.** Android is a business requirement, so option (e) is rejected.

## Where the Council Clashes

The main clash is the thin WebView wrapper.

The correct resolution is: **the wrapper is a mandatory diagnostic and a possible product shell, but the existing TV UI is not the product.** Package today’s web output unmodified, prove playback and lifecycle, and retain the Capacitor shell if WebView wins. Then replace the phone-friction surfaces with a touch-first presentation. Passing the media corpus does not make the wrapper ready for users.

Verified repository evidence makes this canary unusually cheap. `isWebOsRuntime()` at `src/main.ts:350` feature-detects webOS; all webOS calls are guarded or optional-chained, and the application already runs daily in a desktop browser. Modern Android WebView can run the ES2015 output. No platform-bridge refactor is needed just to package the existing `webos-app/` output.

The second clash is whether to build a permanently separate Android codebase. Four advisors endorsed that without pricing the maintenance cost. For two people, two divergent implementations of provider, playback, catalog, and policy logic would be unsustainable. The answer is **a distinct phone app and presentation, not a permanent logic fork**: share pure modules incrementally when both products consume them, but do not make a comprehensive `@nova/engine`, ports/adapters migration, `verify:single-engine`, or three-build hash equality a prerequisite to shipping.

## Blind Spots the Council Caught

The plan’s device gate is currently impossible to satisfy honestly. Phase 1 Section 4 requires approved minimum/current device classes; Phases 2, 4, and 7 require every physical-device row to pass. One phone and one TV box can establish feasibility on those exact devices, not Android compatibility.

The required choice is a **controlled phone beta**, not a fictional one-row “supported matrix.” Use the owned phone as the initial canary. Before a public claim of Android support, recruit a closed-track beta—an estimated target of 8–12 testers across at least three OEM/API/WebView classes—with sanitized crash, lifecycle, playback-backend, protocol, OS, and WebView telemetry plus rollback capability. If the owner cannot obtain that coverage, support must be explicitly limited to the named tested phone/API/WebView combination. No broad Android release claim is defensible otherwise.

Capacity also needs a hard allocation. Reserve **8–12 hours per week** for webOS support and release work, leaving **28–32 hours** for Android. The advisor estimate for a real phone MVP is **240–320 engineering hours**, excluding broad device certification. That implies roughly **9–13 calendar weeks**, including the initial canary, not “nearly free” and not “install now.”

Finally, the real calendar risk is Section 7’s refusal to estimate effort. Green gates can consume months while delivering nothing. Verification infrastructure must remain below 25% of available capacity, and no Phase 5 move of the shipping app into `apps/webos` should occur merely to complete a repository shape.

## The Recommendation

Make these explicit decisions:

- **(a) Kill v2 as written.** Do not authorize the nine-phase, three-app program or its ordering.
- **(b) Endorse with a strict definition:** build a purpose-built, web-based Capacitor phone app with phone-owned presentation, while sharing only genuinely pure, dual-consumed logic. Do not create an independent fork of business and playback policy.
- **(c) Endorse.** Phone first; Android TV is deferred until after a successful phone release and may never proceed.
- **(d) Kill as a customer release, mandate as the first diagnostic.** The wrapper can become the retained Capacitor/WebView shell, but its TV-oriented UI cannot be called the phone product.
- **(e) Kill.** It contradicts the business requirement.

Replace v2 with three delivery checkpoints:

1. **Playback decision.** Answer only the subset of `docs/android/requirements.md` needed for mandatory phone protocols, cleartext policy, lifecycle, tracks, cancellation, and the legal corpus. Run WebView first. Record sanitized results in `docs/android/playback-spike-results.json` and commit `docs/adr/android-playback-backend.md`. If WebView fails, a Media3 feasibility spike is estimated at another **24–32 hours**; full plugin and product integration remains unestimated. If neither backend passes mandatory rows, stop at that ADR commit and change requirements rather than touching webOS.
2. **Phone vertical slice.** Build credentials/provider connectivity, browse/search, playback, actual track switching, A-to-B cancellation, resume, storage, background/foreground recovery, system Back, and touch controls. Do not create `modules/engine`, `apps/android-tv`, or run Phase 3’s `verify:boundaries` and `verify:single-engine` first.
3. **Controlled release.** Add signing, distribution, redacted telemetry, accessibility checks, and the controlled device beta. Extract a shared module only when otherwise fixing the same logic twice. At that first extraction, add the smallest necessary workspace/boundary guard—not all of Phase 0 preemptively.

The fatal halfway failure is engine extraction before phone delivery: code spread across `src/`, `modules/engine`, and unfinished apps while webOS bears new boundaries. The warning signs are two consecutive weeks without an APK completing login/browse/playback, more than 25% of capacity spent on verification machinery, or no end-to-end phone slice after **160 engineering hours**. The abandonment checkpoint is the playback ADR commit, before Phase 3’s workspace commit. At that boundary, retain the untouched webOS release and reduce scope to the phone product only.

## The One Thing to Do First

On Monday, tag the current approved webOS commit, then create one isolated commit under `spikes/android-phone-playback/`.

Spend approximately **four hours** fixing the mandatory phone playback/lifecycle requirements and legal corpus. Then spend an estimated **20–28 hours** packaging today’s unmodified `webos-app/` output in the smallest Capacitor shell and installing it on the owned phone. Test HLS, DASH, MPEG-TS, real audio/subtitle switching, A-cancel-then-B, background/foreground, Activity recreation, process death, and cleartext/CORS behavior.

Commit the sanitized report and backend ADR. Do **not** start `scripts/target-registry.mjs`, `test:guards`, `apps/webos`, `modules/engine`, or Android TV before that evidence exists.

---

# The framed question put to all five advisors

# The question before the council

## The situation

**Nova Play** is a private Xtream Codes IPTV player **shipping today to real
users** on LG webOS TVs (OLED55G1RLA, webOS 6.5.3, Chromium 79). Vite +
TypeScript, no framework. It is packaged as an IPK and installed on real
televisions. 48 test files / 442 tests green, four blocking build guards plus a
design-contract test. `src/main.ts` is 9,397 lines with ~90 mixed module-level
globals. `src/library/catalog-repository.ts` is 4,904 lines. There is no
Android project, no Capacitor, no Gradle, nothing.

The attached plan `main-refactor-v2.md` proposes turning this into a **three-app
codebase** — webOS TV, Android TV, Android phone — over **nine phases (0–8)**
on a shared `@nova/engine` workspace package with ports/adapters.

**The decision: should the owner commit to this plan?**

## What v2 already fixed — do NOT spend words re-recommending these

An earlier plan (`main-refractor.md`) was torn apart by a six-agent
investigation (`main-refactor-assessment.md`, also attached). **v2 already
absorbed every one of those findings.** Recommending them again is wasted
output. Specifically, v2 already:

- Puts **guard work first (Phase 0) with an explicit ban on moving any source
  or creating any production workspace** until it exits — because the four
  guards go false-green on new workspace packages.
- Makes Android playback an **isolated spike (Phase 2)** in `spikes/` with a
  real **STOP** outcome, before any repo reorganization.
- **Deleted** the `AppState`/`AppContext` god-object bridge; state is owned by
  named feature controllers with narrow ports.
- Made source-text contract-test migration **atomic** (each assertion moves only
  in the commit that moves its code, new behavioral test proven red first) —
  no upfront sweep.
- **Killed the shared-UI package and the 70–85% reuse figure.** No `ui-shared`
  before Phase 6, which *measures* view reuse via module-graph classification
  and then decides whether phone proceeds at all.
- Scoped Chromium 79 to webOS only, per-target CSS/JS policy, unclassified CSS
  fails closed.
- Treats `CatalogRepository` as a concrete class with **no** existing
  interface; a consumer-driven `CatalogRepositoryPort` is defined in Phase 4.
- Made unknown Android product policy **blocking** (Phase 1
  `docs/android/requirements.md`, 10 BLOCKING questions, validated by
  `check-android-requirements.mjs`, where "TBD" and "latest" fail).
- Refuses to invent numbers: no `main.ts` line target, no reuse percentage, no
  performance thresholds, no dates. Section 7 lists ten things as unknown.

**In short: v2 is a well-disciplined, evidence-gated plan. Assume it is
internally coherent. The council's job is not to find sloppiness — it is to
judge whether committing to it is the right call for THIS owner.**

## The constraints v2 does not know — this is the crux

The plan was written with no knowledge of any of the following:

- **Team of 2 people. 40 hours/week of engineering capacity, total.** Not each.
- **Android is a genuine business requirement.** A large share of the intended
  user base is on Android, not on LG TVs. This is not a nice-to-have.
- **The Android phone app is required.** Not optional, not a stretch goal.
- **Device access: exactly one Android TV box and one test phone.** No device
  lab, no fleet, no minimum-spec devices, no CI hardware, no budget stated for
  acquiring more.
- **Appetite: incremental progress over months.** No appetite for a big-bang
  rewrite or a long stretch with nothing shipping.
- **Real users depend on the shipping webOS app** and will notice regressions.
  There is no staging population.

Consider what these do to the plan as written. Some observations to reason from
(verify them against the attached plan, and add your own):

- **Phase 0 is pure build tooling with zero user-visible output**: a new
  `scripts/target-registry.mjs`, rewriting `check-import-cycles.mjs` onto real
  TypeScript module resolution, parameterizing both CSS scanners, making the
  design-contract test path-resolved, a registry dispatcher for artifact
  guards, plus **six intentionally-failing guard fixtures** and a `test:guards`
  suite. Then **Phase 1 is entirely documents and a validator script** —
  `docs/refactor/baseline.md`, `docs/android/requirements.md` with owner-signed
  answers to 10 blocking questions, `check-android-requirements.mjs`, and a
  legal media corpus defined by stable sample ID and checksum. **Two full
  phases, no product, before a single line of Android code is written.**
- **Phase 1 requires a "supported device matrix" listing "each approved
  minimum-OS/minimum-WebView class and current Android TV and phone classes",
  with model, SoC, OS, WebView version, memory class and input type.** Phase 2
  then requires the playback corpus to pass "on every approved physical-device
  row, not only an emulator", and Phase 4 repeats this. **The owner has one TV
  box and one phone.** Either the matrix is honestly a single row per form
  factor — which weakens every "proven on Android" claim the plan's gates rest
  on — or the plan is unsatisfiable as written.
- **The required phone app is gated behind Phase 6**, i.e. behind guards,
  requirements, a playback spike, an engine extraction, a full Android TV
  vertical product slice, and moving the entire webOS app into `apps/webos`.
  A required product sits at the end of a six-phase queue, and Phase 6 is
  explicitly allowed to conclude "Defer/stop phone".
- **Phase 5 moves the shipping webOS app into `apps/webos`** — pure disruption
  to the one thing that currently works and has paying-attention users, with no
  new capability delivered by that phase.
- **The plan adds a large permanent verification surface**: `test:guards`,
  `verify:android-requirements`, `verify:android-playback-report`,
  `verify:boundaries`, `verify:single-engine`, `verify:android-tv-report`,
  `report:phone-ui-reuse`, `verify:phone-decision`,
  `verify:android-phone-report`, `verify:artifacts`, plus per-app design
  contracts, artifact manifests and an engine-source-hash equality check across
  three builds. All of it maintained by two people who also ship features.
- **Phases 3, 4 and 5 each require physical-device regression runs on the LG
  television** with recorded reports, in addition to the Android device rows.

## What the council must pressure-test

Answer all four. Be specific to this plan, this team size, this device access.
Cite phases, section numbers, file paths and gates from the attached plan.

1. **Is three apps the right goal at all** — or is a rigorous nine-phase
   monorepo plan being used to *avoid* making the actual product decision about
   what Android should be? Each of these must be explicitly endorsed or killed,
   not surveyed:
   (a) v2 as written — one engine, three apps, nine gated phases;
   (b) build a **separate, purpose-built Android app** (native or web) sharing
       only the genuinely pure logic, and stop pretending the UI is shared;
   (c) **Android phone first**, Android TV later or never — the phone is the
       stated requirement and the TV box is the one the owner already covers
       with webOS;
   (d) ship the **existing web build in a thin Android WebView wrapper with no
       refactor at all**, find out what breaks on real hardware, and let that
       evidence drive everything else;
   (e) stay **webOS-only** and accept losing the Android audience.

2. **Guard-first vs Android-canary-first.** v2 chose guard-first and forbids
   any source movement or workspace creation until Phase 0 exits — and then
   adds Phase 1's document/validator work before the spike. The competing
   position: the single largest unknown in the entire plan is whether Capacitor
   WebView can play this app's HLS/DASH/MPEG-TS with track selection,
   cancellation and lifecycle on real Android hardware. If that answer is no,
   Phase 0's guard architecture was built for a plan that does not survive.
   Note that Phase 2's spike lives in `spikes/`, imports nothing from the
   shipping app, and per its own rollback section *cannot damage webOS* — which
   raises the question of why guards must precede it at all.
   **Take a side. Which is genuinely correct for two people with 40 hours a
   week, and what is the smallest first step that resolves the most risk?**

3. **What the phone app should actually be**, given it is required and v2 puts
   it at Phase 6 behind a gate that may say "Defer/stop". Options include: a
   phone-owned view layer over the shared engine as v2 assumes; a separate app
   sharing only non-UI logic; a completely separate product; or built *first*,
   before Android TV, because it is the actual requirement. If it is required,
   what is the cheapest honest path to a phone app that real users can install,
   and roughly when in this plan does that happen versus when it could happen?

4. **What kills this project halfway through and leaves the owner worse off
   than today** — mid-migration, webOS destabilized or frozen, no shipping
   Android app, verification scripts half-built, source split across
   `src/`/`apps/`/`modules/`, and no clean way back. Name the **specific**
   failure mode, the **specific early warning sign** visible before it is too
   late, and the **specific commit-level checkpoint** at which the owner should
   abandon or reduce scope. Consider also the failure mode where nothing goes
   wrong technically and the project simply **runs out of months** — the plan
   itself says effort and dates are unknown and refuses to estimate.

## What is wanted

**A verdict actionable on Monday morning.** Not a balanced overview, not "it
depends", not a list of considerations. A position, the reasoning, and a
concrete first move. If the honest answer is "this plan is excellent and still
wrong for this team, do X instead", say exactly that. If the honest answer is
"commit to it unchanged", say that and defend it against the constraints above.

---

# Advisor responses

Anonymization map used for peer review: Executor = A, Outsider = B, Contrarian = C, Expansionist = D, First Principles = E.

## The Contrarian  *(gpt-5.6-sol, xhigh — shown to reviewers as C)*

1. **Kill (a):** nine gated phases optimize architectural uniformity instead of Android delivery. **Endorse (b):** build a purpose-built Android app with its own presentation and share only modules already proven DOM-free, such as the Phase 3 candidates `search.ts`, `playback-fallback.ts`, and `track-selection.ts`. **Endorse (c):** phone first; defer Android TV until phone ships. Phase 4 otherwise consumes the scarce capacity before the required product even reaches Phase 6. **Kill (d) as a released product:** the existing remote/focus-driven `src/main.ts` UI is not an honest phone experience; use the wrapper only as a disposable feasibility probe. **Kill (e):** it rejects the stated Android business requirement.

2. Android-canary-first is correct. Phase 0’s `scripts/target-registry.mjs`, TypeScript cycle resolver, parameterized CSS scanners, registry dispatcher, and six failing fixtures protect source movement that the isolated Phase 2 spike explicitly does not perform. Requiring `test:guards` and all ten Phase 1 answers before touching Android burns capacity against a hypothetical repository shape. Monday morning, create a disposable Capacitor phone spike outside production workspaces, install it on the sole phone, and run the Phase 2 corpus for HLS/DASH/MPEG-TS, actual track switching, cancellation A→B, background/foreground, Activity recreation, and process death. Produce `docs/adr/android-playback-backend.md`; do not build Phase 0 first.

3. The phone should be a separate touch-first Capacitor product using the selected WebView or Media3 backend, not a late view layer over an engine that does not yet exist. Implement one installable vertical slice: credentials, browse/search, playback, track selection, cancellation, and resume. Reuse pure logic only when import inspection proves it safe; do not make `verify:single-engine` a precondition for customer value. V2 delivers this no earlier than Phase 7, after the Android-TV product, engine extraction, and disruptive Phase 5 move into `apps/webos`. It could begin immediately after the playback ADR and ship before Phases 3–5 exist.

4. The fatal halfway state is Phase 4: logic has migrated into `modules/engine`, `apps/android-tv` is incomplete, webOS now depends on new boundaries, and the required phone has no shipping route. The early warning is two consecutive capacity checkpoints spent satisfying `verify:boundaries`, `verify:single-engine`, device reports, and contract migrations without producing a newly installable phone flow. The abandonment checkpoint is the Phase 2 ADR commit, before Phase 3 adds workspaces. At that commit, replace the nine-phase program with the separate phone product. If no end-to-end phone slice exists after 160 engineering hours, cut Android TV and all engine-hash machinery. Section 7’s refusal to estimate dates otherwise guarantees that technically green gates can consume the available months while Phase 5 destabilizes the only shipped app.

## The First Principles Thinker  *(claude-opus-4-8-think, high — shown as E)*

Strip the question. The owner does not need "three apps sharing one engine." In six months the owner needs Android users — phone users specifically — running a working player while webOS keeps shipping. That is the truth to make true. v2 is an architecture migration wearing a product goal as a costume, and it never asks whether unifying an engine is what puts a phone app on a phone.

**Q1.** Kill (a). Endorse (d) now, then (c). The tell that this plan is avoiding the product decision is structural: the *required* phone app's existence is not decided until Phase 6's `docs/adr/android-phone-product.md`, whose own decision point permits "Defer/stop phone." A plan cannot both treat phone as a hard requirement and place a "maybe never" gate five phases deep. That is architecture used to postpone the only question that matters — what is the phone product — behind guard fixtures, requirement docs, a spike, an engine extraction, and a full Android TV slice. The engine unification (`verify:single-engine`, engine-source-hash equality across three builds) is a maintenance dream serving zero users. Build the phone as its own thing; share only what the import graph forces later.

**Q2.** Canary-first, decisively. The plan defeats its own sequencing: Phase 2's spike lives in `spikes/android-playback/`, "has no import from the shipping webOS entry," and its rollback "cannot damage webOS." Guards (Phase 0) exist only to stop false-green *source moves and workspace creation* (Section 1, the Phase 0 ban). The spike does neither. So Phase 0 and Phase 1's `check-android-requirements.mjs` document work gate nothing the spike can break. Smallest first step that resolves the most risk: skip to (d) — wrap today's Vite build in a Capacitor WebView and run it on the one phone against real HLS/DASH/TS. That answers the single largest unknown (Section 7: "Android playback compatibility is unknown") in days, not two productless phases.

**Q3.** Phone first, and it is nearly free. If the WebView wrapper plays the corpus, real users install a phone app *now* — not at Phase 7. If it doesn't, Media3 is your answer before you've touched `src/`. Either way you learn before restructuring.

**Q4.** The killer isn't technical — it's Section 7's admission that "effort and release dates are unknown." Two people at 40 hours total spend Phases 0–1 shipping nothing, then Phase 5 destabilizes the working webOS app (`apps/webos` move) for zero new capability. Early warning: the calendar passes Phase 2 with no installable phone artifact. Checkpoint to abandon: the Phase 2 exit commit. If no phone runs by then, stop the monorepo and ship the wrapper.

## The Expansionist  *(gpt-5.6-terra, high — shown as D)*

Kill (a) v2 as written. Endorse (b), (c), and (d) as one sequence: ship a thin Android phone WebView wrapper first, then evolve it into a purpose-built phone app that shares only proven pure logic. Kill (e). Android is the growth market, and the undervalued asset is the existing browser player: Hls.js, Dash.js, MPEG-TS, native video paths, track-selection policy, `playback-fallback.ts`, `player-transport.ts`, and `search.ts` already constitute an Android-launch kernel identified for `modules/engine` in Phase 3. The wrong move is making the required phone product wait behind Phase 6’s explicitly permitted “Defer/stop phone” decision and Phase 7. A required customer surface cannot be an experiment after Android TV, a full engine extraction, and the disruptive `apps/webos` move in Phase 5.

Endorse Android-canary-first, not guard-first. The smallest high-option-value Monday move is a minimal Capacitor phone wrapper under `spikes/android-playback/`—or rename it `spikes/android-phone-playback/`—loading the current web build with one media surface and the Phase 2 corpus, cancellation, track, and lifecycle instrumentation. Phase 2 already proves this spike imports nothing from the shipping app and can be deleted without harming webOS; its rollback section makes it the perfect zero-regression discovery vehicle. Run the Section 5 Phase 2 protocol immediately on the one available phone, using the legal corpus requirements from Section 4. This produces the only evidence that matters: whether Nova Play can become installable Android software now. `scripts/target-registry.mjs`, `test:guards`, and workspace-aware resolution are valuable infrastructure, but they are expansion infrastructure only after Android has demonstrated a viable commercial surface.

The phone should be a phone-owned product from its first installable APK: touch navigation, keyboard search, system Back, portrait/landscape, accessibility, and player controls. Start with the existing web UI inside the wrapper because that is the fastest route to real-user evidence; immediately replace only the phone-friction surfaces. Share pure policies and contracts once proven, not a view tree. This advances the Phase 6 experiment’s three representative flows—browse/search, details, player controls—to the front, where they can generate user learning instead of a late `docs/android/phone-ui-reuse.json`. Android TV follows as a distinct second product when the phone validates backend, storage, and engine seams.

The project dies through “architecture without distribution”: Phase 0–5 produce registries, reports, `modules/engine`, and `apps/webos`, while no user can install Android. The early warning is any green commit adding `modules/engine` or moving `src/main.ts` before an installable phone APK has passed the Phase 2 playback corpus on the physical phone. At that exact commit boundary, abandon the three-app migration and reduce scope to the independent Android phone wrapper/product. Preserve webOS at the Phase 1 baseline commit and let Android earn later extraction through shipping usage, not through nine phases of preparation.

## The Outsider  *(gpt-5.6-luna, high — shown as B)*

(a) **Kill v2 as written.** It is a technically coherent migration plan, but for two people it confuses “gated” with “affordable.” The required phone is explicitly allowed to die at Phase 6, while Phases 0–5 consume the project before the required product exists. `verify:single-engine`, ten report/guard commands, three artifact policies, and repeated physical-device runs are a permanent second product: verification infrastructure. That is not justified by 40 total engineering hours per week.

(b) **Endorse a separate Android app sharing only pure logic.** Phase 3 already names graph-confirmed candidates—`search.ts`, `content-rating.ts`, `playback-fallback.ts`, `track-selection.ts`—but the plan turns this modest reuse into `@nova/engine`, ports, adapters, controllers, and three-build hash equality. Build the Android product independently, copy nothing merely to satisfy “one engine,” and share only code proven DOM-free by the Phase 3 dependency report.

(c) **Endorse phone first; postpone Android TV indefinitely.** The phone is mandatory; Android TV is an additional product with remote navigation, focus, and a device-matrix burden. Phase 4 requires a full Android-TV slice plus physical LG regression, yet Phase 7 is when the required phone finally appears. That ordering is backwards.

(d) **Endorse the thin WebView wrapper as Monday’s first move.** Phase 2 already proves the spike can be isolated under `spikes/android-playback/` and cannot damage webOS. Use the existing web build, package it with the smallest Android shell, and test playback, tracks, cancellation, lifecycle, login, and catalog on the one phone and one TV box. This produces product evidence without Phase 0’s `target-registry.mjs`, six failing fixtures, workspace resolver, or `test:guards`. The first commit should be a wrapper spike and installable APK, not guard architecture.

(e) **Kill webOS-only.** Android is a genuine business requirement; accepting its loss is not a viable decision.

The cheapest honest phone path is: thin wrapper first, then a phone-owned app sharing only tested pure logic. It could be installable within the first few weeks, whereas v2 delivers no phone until after Phase 6 and permits “Defer/stop.” Do not build Android TV first.

The project dies when Phase 2 evidence shows the wrapper needs native playback or Android-specific lifecycle/storage, but the owner continues into Phase 3’s engine extraction. The warning sign is a failing mandatory row in `docs/android/playback-spike-results.json`, or any requirement still forcing design changes after `docs/adr/android-playback-backend.md`. Abandon the three-app refactor at that commit; retain the wrapper or build a separate phone product.

A second failure is calendar exhaustion: Phase 7 has not begun after the first month of work, while webOS remains unchanged and the verification surface grows. Set a hard checkpoint after the wrapper spike: if an installable phone canary and a prioritized Android product backlog do not exist, stop `main.ts` migration, `apps/`, `modules/engine`, and `verify:single-engine`. Keep shipping the current webOS build rather than ending with code split across `src/` and `apps/`.

## The Executor  *(gpt-5.6-sol, high — shown as A)*

1. Kill **(a) v2 as written**. Nine phases make architecture the critical path to a required product. Phase 7 cannot start until guards, requirements, playback proof, engine extraction, Android TV, the disruptive `apps/webos` move, and Phase 6’s experiment—and Section 6 still permits “Defer/stop phone.” Endorse **(b)**: a purpose-built Android app with phone-owned presentation, sharing only DOM-free modules proven useful. Endorse **(c)**: phone first; Android TV waits until the phone ships. Kill **(d)** as a release strategy: wrapping the existing TV-focused `src/main.ts` produces an installable APK, not an honest touch product. Use a wrapper only as disposable diagnostic code. Kill **(e)** because Android is a business requirement.

2. Run the Android canary before Phase 0. The guard-first rule protects workspace movement, but `spikes/android-playback/` performs none and Phase 2’s rollback explicitly isolates it from webOS. Monday morning: spend four hours answering only the Phase 1 Section 4 questions needed to define mandatory phone playback, lifecycle, cleartext networking, and the legal corpus. Then spend 20–28 hours building Phase 2’s one-screen Capacitor spike and testing it on the actual phone. Test HLS/DASH/MPEG-TS, track switching, A-cancel-then-B, background/foreground, Activity recreation, and process death; write `docs/adr/android-playback-backend.md`. If WebView fails, allow another 24–32 hours for Media3. Do not write `scripts/target-registry.mjs`, rewrite `check-import-cycles.mjs`, or build six guard fixtures until a backend passes.

3. Build the phone app immediately after that ADR as a separate Capacitor product, not after Android TV and not after Phase 6. Budget 240–320 engineering hours: 40–60 for shell, credentials, and provider connectivity; 80–100 for browse/search/details; 60–80 for playback, tracks, cancellation, and resume; 40–60 for lifecycle, persistence, packaging, and device QA. Reserving 8–12 hours weekly for webOS support yields an installable phone release in roughly 8–10 weeks. Initially duplicate composition glue rather than extracting controllers from `src/main.ts`. Move only already-tested pure modules listed in Phase 3—such as `playback-fallback.ts`, `track-selection.ts`, and `series-presentation.ts`—when both apps actively consume them.

4. The fatal failure mode is engine extraction becoming mandatory before any Android product ships. The warning sign is two consecutive weeks without a phone APK completing login, catalog browse, and sample playback, or more than 25% of capacity going into `verify:boundaries`, `verify:single-engine`, registries, reports, and manifests. Tag the current webOS release, then create the abandonment checkpoint immediately after the Phase 2 backend ADR and before Phase 3’s workspace commit. If the week-two vertical slice misses, abandon shared-engine work and continue the separate phone app. Delete Phase 5 entirely; moving webOS into `apps/webos` delivers nothing. Delete Phase 6 because phone is not optional. Reconsider Android TV only after the phone release is operating on real users’ devices.

---

# Peer reviews

Each reviewer saw all five responses anonymized as A–E, plus the framing and the v2 plan. None knew which advisor wrote which.

## Reviewer 1

1. **A is strongest.** It explicitly decides all five strategic options, correctly distinguishes a wrapper as a diagnostic rather than a credible touch product, sequences WebView then Media3, reserves capacity for webOS support, and supplies engineering-hour ranges plus concrete abandonment triggers. Its checkpoint before Phase 3’s workspace commit is especially strong: it prevents “shared engine” from becoming sunk-cost coercion.

2. **E has the biggest blind spot.** Calling the phone app “nearly free” is reckless. Passing Phase 2’s media corpus proves only playback on one screen. It proves neither provider login/connectivity, CORS and cleartext behavior, credential storage, catalog persistence, process-death recovery, touch usability, accessibility, nor Play Store acceptance. “If the wrapper plays, real users install now” collapses a backend experiment into a production-readiness claim with no evidence.

3. **All five silently accepted one-phone testing as sufficient Android evidence.** None confronts the incompatibility between the available hardware and Phases 1, 2, 4, and 7: Android codec stacks, OEM WebViews, memory pressure, lifecycle behavior, and track support vary materially, so one successful handset cannot justify an “Android phone” release or A’s 8–10-week forecast. The chairman must require an explicit choice before approving any path: either narrowly support that named phone/API/WebView class, fund or borrow a minimum physical matrix, or recruit a controlled beta with compatibility telemetry and rollback. If none is possible, the council should say plainly that broad Android support is untestable—not redefine one-device success as validation.

## Reviewer 2

**(1) Strongest: A.** It alone converts the shared diagnosis into an executable schedule: hour budgets (20–28h spike, 240–320h phone), a path to an installable APK in ~8–10 weeks, named modules moved only when both apps consume them, and two falsifiable warning signs (two weeks with no APK completing login/browse/playback; >25% of capacity sunk into `verify:*` machinery). It also says concretely what to delete (Phase 5, Phase 6). E has sharper prose but thin execution; A is the one usable Monday morning.

**(2) Biggest blind spot: E.** Its case rests on "phone first, and it is nearly free"—treating a passing WebView corpus as a phone app "real users install now." That conflates playback feasibility with the entire touch view layer: portrait, soft keyboard, system Back, accessibility, one-handed controls—the actual bulk of the work (A budgets 240–320h for exactly this). Ship the TV/D-pad UI to a phone and it is not an honest product. E assumes away the largest cost.

**(3) What all five missed:** They all assume the existing Vite build even runs outside webOS. It targets Chromium 79 with webOS-scoped globals; login, credential storage, lifecycle and exit may route through webOS platform bridges absent in a bare Capacitor WebView. If so, the "cheap canary" dies before playback—the biggest risk is webOS-coupling, not codecs—and every "test on the one phone" gate collapses. Also unchecked: one phone proves nothing about Android WebView fragmentation, and a separate app commits two people to permanently maintaining divergent codebases—precisely the cost v2's single engine existed to prevent. Nobody did that capacity arithmetic.

## Reviewer 3

1. **Strongest: C.** It gives the clearest product verdict: kill v2, phone-first, separate touch-owned app, Android-canary-first, and no Android-TV-first detour. It correctly distinguishes the isolated Phase 2 proof from a product, identifies Phase 4 as the dangerous irreversible state, and sets the decisive checkpoint before Phase 3 creates workspaces and `modules/engine`. Unlike B/D/E, it does not mistake a TV-oriented WebView wrapper for an honest phone release.

2. **Biggest blind spot: E.** “Phone first, and it is nearly free” is reckless nonsense. A passing media corpus proves playback feasibility, not a shippable phone product. E ignores provider login/catalog integration, Android cleartext/CORS behavior, credential storage, persistence, keyboard/touch/accessibility, signing, distribution, crash handling, and support. Phase 2 explicitly has *no catalog/provider implementation*; claiming users can install “a phone app now” from that result conflates a one-screen spike with a product.

3. **All five missed the same release-validation hole:** they treat testing on the single available phone as enough evidence to move toward real Android users. It is enough for a backend canary, not for a supported Android launch. None requires a Monday decision on device procurement/funding, a defensible minimum-device policy, beta distribution, crash/telemetry, or how unsupported devices will be handled. V2’s Phase 1 matrix is presently either dishonest (one row per form factor) or impossible. Before any verdict, the owner must decide whether they will fund a minimal representative device set and controlled beta; otherwise “Android is a business requirement” is not an executable commitment, and every promised phone schedule is fiction.

## Reviewer 4

1. **Strongest: D.** It makes the correct product/architecture distinction: use the existing web build as a disposable Android canary, but do not mistake that for the phone product. It correctly exploits Phase 2’s isolation and rollback instead of spending scarce capacity on Phase 0 infrastructure. It also identifies the concrete failure pattern—`modules/engine` and `apps/webos` appearing before any installable phone APK—and gives a useful commit-level stop rule. Unlike E, it does not pretend a wrapper is “nearly free” or automatically a shippable phone experience.

2. **Biggest blind spot: E.** It calls the wrapper “nearly free” and implies that if it plays, real users can install a phone app “now.” That ignores the plan’s mandatory product surface: touch navigation, keyboard/search, Back behavior, orientation, accessibility, persistence, lifecycle, distribution, and likely credentials/network policy. A playback wrapper proves feasibility, not a usable or supportable phone product. E also underestimates the cost of Media3 if WebView fails.

3. **All five missed the owner’s operational capacity as a release constraint.** They recommend a phone-first path, but none converts 40 total engineering hours/week into an explicit allocation against ongoing webOS support, Android development, QA, release work, and user support. Their 8–10-week or “first few weeks” claims are unsupported, especially with one phone, one TV box, no CI hardware, and no staging population. Nobody defines a minimum supported-device policy honestly: the plan’s “matrix” is either one unrepresentative device or an unfunded promise. Before verdict, the chairman should require a paid-capacity budget, acquisition/coverage decision for devices, and a weekly shipping checkpoint—e.g. preserve a fixed webOS support/release allocation and stop if the phone has not reached a real-user canary by a specified capacity burn, not merely a green spike.

## Reviewer 5

1. **A** is strongest. It makes every required kill/endorse call, correctly treats `spikes/android-playback/` as safe to run before Phase 0, and distinguishes a disposable wrapper probe from a touch product. Its Phase-2 protocol, ADR checkpoint, webOS-support reserve, and “no workspace before phone slice” stop rule are operationally useful. Its hour estimates are speculative, but the sequencing is sound.

2. **E** has the biggest blind spot: calling the phone app “nearly free” is reckless. A passing Phase 2 proves only isolated playback; that spike explicitly has no catalog, provider, credentials, storage, phone navigation, accessibility, packaging, or real-user support path. Nor does “WebView fails, therefore Media3” follow: Media3 still requires a native plugin, lifecycle integration, track/control parity, and the Phase 1 requirements. E mistakes a codec canary for a product.

3. **All five** evade the device-support problem. Each proposes proving or shipping from the sole phone, yet none resolves Phase 1 §4’s supported-device matrix or Phase 2/7’s requirement to pass every approved physical-device row. A one-phone success is a narrow canary, not evidence for the intended Android audience. Before verdict, the owner must choose: explicitly support only named owned device/WebView classes, fund/borrow a minimum device set or lab, or run a tightly bounded beta with compatibility telemetry and no broad-support claim. Without that decision, every proposed “ship the phone first” path silently replaces product validation with hope.

---

# Orchestrator verification (not from the council)

Reviewer 2 claimed nobody had checked whether the existing build runs outside
webOS at all, and that this — not codecs — might be the real risk. That claim
changes the Monday action, so it was checked against the repository rather than
passed through.

**It is largely false.** `isWebOsRuntime()` (`src/main.ts:350`) is a pure
feature detector for `window.webOSSystem || window.PalmSystem`. All 34 webOS
references in `src/main.ts` are either ternary branches on that boolean
(`src/main.ts:378, 382, 386, 4705, 4711, 4945`) or optional-chained calls that
no-op when the bridge is absent (`system?.keepAlive?.(true)`,
`src/main.ts:8599-8601, 8617-8619`). Launch params early-return when absent
(`src/main.ts:403-407`). The app is developed daily in a desktop browser via
`npm run dev`, which is the same environment as a bare Capacitor WebView.

Corollary: the Chromium 79 / ES2015 build target is a floor, not a ceiling. Any
modern Android System WebView runs that output. The canary therefore needs no
build changes — it can package today's existing `webos-app/` output unmodified.
This makes the canary cheaper than any advisor assumed.

Reviewer 2's second point stands and was fed to the chairman: choosing a
separate Android app commits two people to maintaining divergent codebases,
which is the cost `@nova/engine` and `verify:single-engine` existed to prevent.
Four of five advisors recommended the separate app without pricing that.
