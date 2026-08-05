# Nova Play Library Engine Status

This is the append-only implementation record for the phased Library Engine described in [`implementation_plan.md`](implementation_plan.md). The plan defines the architecture and acceptance gates; this file records what was actually attempted, measured, accepted, deferred, or rolled back.

## Record rules

For every phase:

1. Add a dated entry before implementation begins.
2. Record the baseline commit or working-tree reference.
3. List files changed and tests added.
4. Record automated verification commands and results.
5. Record emulator/physical-device evidence where the phase requires it.
6. Record deviations from `implementation_plan.md` and the reason.
7. Record unresolved risks.
8. State the rollback procedure and whether it was tested.
9. Mark the phase and gate `accepted`, `rejected`, or `pending`.
10. Do not begin a dependent phase while its gate is pending or rejected.

Do not store:

- IPTV credentials;
- provider URLs;
- title, person, or search text from private catalogs;
- raw provider payloads;
- exported device traces.

Commit only sanitized aggregate measurements and conclusions.

## Current baseline

- Date: 2026-07-30
- Repository: `nova-play-webos`
- Target app: `com.arash.novaplay`
- Physical target used during preceding search work: `lg-oled-g1`
- Plan: `implementation_plan.md`
- Library Engine implementation state: not started
- Current durable catalog: none
- Current persistent application storage: `localStorage` for profiles, settings, favorites, and resume history
- Current catalog/search storage: bounded in-memory caches only
- Current packaged app type: web app, no packaged service
- Current intended first phase: Phase 0 capability probe
- Gate 0: pending

## Preserved pre-plan device findings

These measurements motivated the local-first architecture but do not satisfy Gate 0:

- Whole-library Xtream endpoints can fail to answer in a useful time window.
- Category endpoints can also stall intermittently.
- Live TV exceeded the current 6,000-record per-section in-memory catalog policy.
- A match-all Live TV warm reached 6,001 records in approximately 2.7 seconds and was marked oversized.
- A prior global search could remain active for approximately one minute.
- Bounded provider-wide and category fallback timeouts reduced one partial-result completion to approximately 16.1 seconds.
- Partial provider results are deliberately non-authoritative and non-cacheable.
- Provider capability health, coverage, and resumable work therefore must be persisted in the future Library Engine.

## Phase register

| Phase | Purpose | Status | Gate |
| --- | --- | --- | --- |
| Phase 0 | IndexedDB, Worker, quota, persistence, cancellation capability probe | Pending | Gate 0 pending |
| Phase 1A | Durable schema and repository | Blocked by Gate 0 | — |
| Phase 1B | Adaptive resumable shadow sync | Blocked by Phase 1A | Gate 1 pending |
| Phase 2A | Coverage-aware local category browsing | Blocked by Gate 1 | — |
| Phase 2B | Local/hybrid global search | Blocked by Phase 2A | Gate 2 pending |
| Phase 3A | Namespaced canonical identity and availability links | Blocked by Gate 2 | — |
| Phase 3B | People graph and Known For navigation | Blocked by Phase 3A | Gate 3 pending |
| Phase 4A | Language, quality, and version grouping | Blocked by Gate 3 | — |
| Phase 4B | Advanced filters, collections, and diagnostics | Blocked by Phase 4A | — |
| Phase 5 | webOS service versus optional Nova Hub discovery | Deferred | Separate approval |

## Phase entry template

Copy this section for every phase.

```md
## YYYY-MM-DD — Phase X started

### Scope

- Plan phase:
- Explicit exclusions:
- Baseline commit/working-tree reference:
- Feature flag/rollback boundary:

### Implementation

- Files added:
- Files modified:
- Migrations:
- Tests added:

### Automated verification

| Command | Result | Notes |
| --- | --- | --- |
| `rtk npm test` | | |
| `rtk npm run build` | | |
| `rtk git diff --check` | | |

### Device verification

- Target:
- Package version:
- Scenario:
- Sanitized measurements:
- Persistence/relaunch result:
- Playback/cancellation result:

### Security and privacy review

- Credentials absent from DB:
- Credentials absent from traces/logs:
- Raw private catalog data absent from reports:
- Profile isolation verified:

### Deviations

- None, or list each deviation and rationale.

### Risks and follow-up

- Open risk:
- Deferred work:

### Rollback

- Procedure:
- Tested:
- User data preserved:

### Decision

- Phase status: `accepted` / `rejected` / `pending`
- Gate status: `accepted` / `rejected` / `pending` / `not applicable`
- Approved next phase:
```

## Phase 0 pending checklist

- [ ] Record test/build baseline.
- [ ] Implement disposable probe database only.
- [ ] Probe main-thread IndexedDB CRUD.
- [ ] Probe classic packaged Worker creation and messaging.
- [ ] Probe Worker URL resolution under `file://`.
- [ ] Probe Worker fetch without leaking credentials.
- [ ] Probe worker-side IndexedDB.
- [ ] Probe Worker parsing with main-thread IndexedDB fallback.
- [ ] Measure 10k compact records.
- [ ] Measure 50k compact records.
- [ ] Measure 100k only if prior tiers are stable.
- [ ] Compare write batch sizes.
- [ ] Measure indexes and cursor iteration.
- [ ] Close/relaunch and verify persistence.
- [ ] Verify cancellation during playback.
- [ ] Capture storage quota/persistence feature support.
- [ ] Delete the disposable probe database.
- [ ] Record sanitized report.
- [ ] Select `worker-idb`, `worker-main-idb`, `cooperative-main`, or `no-go`.
- [ ] Accept or reject Gate 0.

## 2026-07-30 — Pre-implementation architecture reassessment

### Scope

- Plan phase: documentation review before Phase 0.
- Explicit exclusions: no capability probe, IndexedDB catalog, Worker, synchronization engine, schema, or UI implementation.
- Review method: five independent audits covering IndexedDB/local-first design, webOS/Vite compatibility, provider synchronization, identity/search/privacy, and phase delivery/verification.
- Plan reviewed: `implementation_plan.md`.
- Phase status after review: Library Engine implementation remains not started.
- Gate status after review: Gate 0 remains pending.

### Reproducible baseline snapshot

- `HEAD`: `e22a2d98d83b0d04ea81ce3e002208e2a9e418bf`
- Branch: `master`
- Upstream comparison: `origin/master...HEAD = 0 behind / 9 ahead`
- Node: `v22.14.0`
- npm: `11.2.0`
- webOS CLI: `ares-install` is available on `PATH`.
- Working tree at review time: 17 modified tracked files and 21 untracked files.
- Planning artifacts: `implementation_plan.md` and `LIBRARY_ENGINE_STATUS.md` are untracked.
- Reproducibility decision: Phase 0 must not begin until a sanitized checkpoint commit is created, or an equivalent retained patch plus untracked-file SHA-256 manifest is recorded.
- This entry does not archive secret-bearing local files, credentials, provider URLs, private catalog data, or exported traces.

Sanitized tracked-change inventory:

```text
.gitignore
README.md
TV_UX_REGRESSION_CHECKLIST.md
metadata-proxy/README.md
metadata-proxy/worker.ts
package-lock.json
package.json
src/main.ts
src/metadata-client.test.ts
src/metadata-client.ts
src/storage.ts
src/style.css
src/types.ts
src/xtream-client.test.ts
src/xtream-client.ts
tsconfig.json
vite.config.ts
```

Sanitized untracked-path inventory:

```text
.kilo/plans/1785251792216-continue-watching-remove.md
LIBRARY_ENGINE_STATUS.md
PERFORMANCE_CAPTURE.md
implementation_plan.md
metadata-proxy/.dev.vars.example
metadata-proxy/DEPLOYMENT_STATUS.local.txt
metadata-proxy/worker.test.ts
metadata-proxy/wrangler.toml
src/content-rating.test.ts
src/content-rating.ts
src/frame-navigation.test.ts
src/frame-navigation.ts
src/lru-ttl-cache.test.ts
src/lru-ttl-cache.ts
src/performance-trace.test.ts
src/performance-trace.ts
src/provider-metadata.test.ts
src/search-catalog-queue.test.ts
src/search-catalog-queue.ts
src/spatial-layout-cache.test.ts
src/spatial-layout-cache.ts
```

### Accepted plan amendments

1. **Immutable revisions and active pointers**
   - Provider/catalog rows are revision-owned.
   - UI reads resolve `ActiveScopeRecord`; staging never overwrites active data.
   - Activation updates pointer, coverage proof, revision metadata, and checkpoint in one short transaction.

2. **Single-writer safety**
   - A profile-scoped expiring lease prevents overlapping runners/controllers.
   - Lease exclusion, expiry, renewal, and takeover require tests.

3. **Explicit completion proof**
   - Transport completion, parser EOF, decoder flush, top-level closure, accepted/invalid/rejected counts, timeout, and cancellation are recorded separately.
   - Coverage-affecting rejection prevents authoritative coverage and deletion.

4. **Correct non-paginated recovery**
   - Standard Xtream requests resume only at sync-unit boundaries.
   - Interrupted responses restart from byte zero in a fresh revision.
   - `processedRecords` is telemetry, not a provider resume cursor.

5. **Independent coverage dimensions**
   - Completeness, freshness, last-attempt outcome, and deletion proof are separate.
   - A failed refresh does not erase a previously complete active snapshot.

6. **Scope-safe deletion**
   - Category absence cannot prove provider-level removal.
   - Tombstones require comparable complete section passes, later confirmation, grace, and protected favorite/resume handling.

7. **Quota-safe staging and migration**
   - Capacity planning accounts for active-plus-staging peak storage.
   - Active revisions cannot be pruned before replacement.
   - IndexedDB upgrades perform schema work only; large backfills are resumable post-open jobs.
   - Feature-flag rollback is not treated as a database downgrade.

8. **Decisive Gate 0**
   - Main fetch, Worker fetch/CORS, Worker IndexedDB, main IndexedDB, Worker-to-main writes, cooperative scheduling, persistence, cancellation, and transaction recovery are measured independently.
   - Runner selection uses an explicit decision table.

9. **Safe classic Worker packaging**
   - The existing app remains a single-entry ES2015 IIFE.
   - Probe Worker output uses a separate no-code-splitting Vite build with a deterministic classic-script filename.
   - Module, Blob/data URL, and unsafe multi-entry IIFE assumptions are excluded.

10. **Stable canonical identity**
    - Canonical title/person keys are opaque Nova Play IDs.
    - External IDs are entity-safe and namespaced.
    - Private provider/manual evidence remains profile-scoped.

11. **Bounded search**
    - Index loading is cursor/page based with explicit document/token/prefix/byte limits.
    - Overflow uses persisted paged search rather than silently dropping authoritative results.

12. **Demand-driven enrichment**
    - Metadata work is prioritized, budgeted, cancellable, and never an automatic private full-catalog upload.

13. **Fresh-session execution protocol**
    - Every future phase verifies prerequisites, records baseline state, runs pre/post checks, implements only its scope, tests rollback, appends evidence, and stops at its gate.

### Automated verification completed before final document checks

| Command | Result | Notes |
| --- | --- | --- |
| `rtk npm test` | Passed | 18 test files, 124 tests |
| `rtk npm run build` | Passed | Existing Dash.js CommonJS-in-ESM warning only |
| Final structural/diff/status checks | Pending | Recorded in a follow-up entry after both documents are finalized |

### Security and privacy review

- No production Library Engine code or durable database was created.
- No credentials, provider URLs, private titles, people, queries, or raw catalog data were added to the planning artifacts.
- Secret-bearing/local deployment file contents were not inspected or copied into this record.
- Only sanitized file paths, aggregate counts, architecture decisions, and test/build outcomes were recorded.

### Decision

- Architecture reassessment: accepted.
- Documentation amendment: accepted pending final structural/diff verification.
- Phase 0: not started.
- Gate 0: pending.

## 2026-07-30 — Architecture amendment verification

This append-only entry completes the verification that was pending in the preceding reassessment entry.

### Verification results

| Check | Result | Evidence |
| --- | --- | --- |
| Required top-level plan sections | Passed | All eight sections occur exactly once and in the required order |
| Implementation phase headings | Passed | 10 |
| Future-session phase prompts | Passed | 10 |
| Markdown code fences | Passed | Even/balanced counts in both planning artifacts |
| Superseded contract scan | Passed | No legacy `CoverageState`, external-derived canonical-key helpers, full-array search-index builder, or ambiguous `ExternalIdNamespace` remains |
| `rtk npm test` | Passed | 18 test files, 124 tests |
| `rtk npm run build` | Passed | Existing non-blocking Dash.js CommonJS-in-ESM warning only |
| `rtk git diff --check` | Passed | No whitespace errors |
| Scoped implementation-artifact status | Passed | Only `implementation_plan.md` and `LIBRARY_ENGINE_STATUS.md`; no `src/library`, Worker config, or production Library Engine files exist |

### Final decision

- Architecture reassessment: accepted.
- Documentation amendment: verified and accepted.
- Production Library Engine implementation: not started.
- Phase 0: not started.
- Gate 0: pending.
- Remaining pre-Phase-0 prerequisite: preserve a reproducible sanitized planning baseline by checkpoint commit or the documented patch/hash alternative.

## 2026-07-30 — All-phase closure and Plan 1.0 freeze preparation

This entry supersedes only the earlier conclusion that documentation closure was complete. The earlier measurements and accepted foundational amendments remain valid.

### Scope and result

- Reviewed and closed Phases 0, 1A, 1B, 2A, 2B, 3A, 3B, 4A, 4B, and Phase 5 discovery.
- Added complete cross-phase contracts, physical store/index ownership, operational invariants, measurable Gates 2–4, Phase 5 ADR-005, governance, change control, and self-contained phase prompts.
- No capability probe, IndexedDB catalog, Worker, sync engine, local read cutover, identity graph, advanced UX, service, or Hub implementation was created.
- Library Engine production state remains: not started.
- Gate 0 remains: pending.

### Closed architecture findings

- Every planned phase now has explicit prerequisites, owned files/stores, contracts, exclusions, tests, rollback, status output, and stop condition.
- Phase 2 has snapshot-consistent opaque cursors, deterministic sort/count semantics, bounded hybrid sessions, a complete routing table, and quantitative Gate 2 evidence.
- Phase 3 has opaque canonical identity, typed external namespaces, provenance, candidate/override/redirect lifecycle, merge/split rules, fixed matcher thresholds, enrichment budgets, and quantitative Gate 3 evidence.
- Phase 4 has schema-versioned preferences, safe PIN migration, parental enforcement boundaries, deterministic version policy, protected user-state projection, episode/collection semantics, diagnostics privacy, and quantitative Gate 4 evidence.
- Phase 5 is decision-only ADR-005 with evidence triggers, authority/conflict rules, LAN threat model, protocol compatibility, operations/rollback criteria, and a hard implementation stop.
- Decision, assumption, risk, deferred, calibration, and change-control registers are frozen in `implementation_plan.md`.
- Device-dependent numerical calibration is allowed only through dated evidence; correctness, privacy, identity, coverage, deletion, paging, authority, and rollback semantics cannot be silently changed.

### Freeze procedure

- Freeze version: `Library Engine Plan 1.0`.
- Authoritative artifacts:
  - `implementation_plan.md`
  - `LIBRARY_ENGINE_STATUS.md`
  - `LIBRARY_ENGINE_PLAN_FREEZE.sha256`
- The manifest is generated only after final document verification and contains the exact plan/status SHA-256 values plus baseline repository metadata.
- Any later plan amendment increments the freeze version, appends status evidence, preserves the superseded manifest, and reruns the full freeze checklist.

### Decision

- All-phase architecture closure: accepted pending final automated validation and manifest generation.
- Production implementation: not started.

## 2026-07-31 — Phase 0 capability probe implementation

### Scope

- Plan phase: Phase 0 capability probe only.
- Baseline commit: `fccb4f2bcbaff0f3a7071c4d490498c1cc028d70`.
- Implemented scope: disposable main-thread IndexedDB CRUD/index/cursor probe, classic Worker probe entry and deterministic IIFE build, storage API reporting, explicit persistence readback, cooperative-main recommendation, and a development-only probe API.
- Explicit exclusions: durable catalog schema, catalog repository, provider acquisition/synchronization, local browse/search cutover, provider credentials/fetch probing, and production UI behavior changes.
- Gate status: pending physical OLED G1 evidence.

### Implementation

- Added `src/library/capability-types.ts`, `src/library/idb-probe.ts`, `src/library/capability-probe.ts`, and `src/library/capability-probe-worker.ts`.
- Added `vite.worker.config.ts` so the classic Worker is emitted deterministically as `webos-app/library-capability-worker.js`.
- Added `scripts/library-capability-report.md` with the sanitized device measurement and cleanup procedure.
- Added the probe Worker to the build chain and added `fake-indexeddb` only as a development dependency for deterministic Node tests.
- Exposed `window.__NOVA_LIBRARY_PROBE__` only in development or an explicit `VITE_ENABLE_LIBRARY_PROBE=true` build.
- No provider URL, credentials, private title, search query, or raw provider payload is accepted or retained by the probe.

### Automated verification

| Command | Result | Notes |
| --- | --- | --- |
| `rtk npm test -- src/library/capability-probe.test.ts` | Passed | 6 tests: schema/index/cursor operations, cancellation, cleanup, relaunch readback, Worker round trip, and recommendation failure path. |
| `rtk npm test` | Passed | 25 files, 183 tests. Expected mocked upstream 503 diagnostic lines remain in metadata Worker tests. |
| `rtk npm run build` | Passed | App plus `library-capability-worker.js` built successfully; existing Dash.js CommonJS-in-ESM warning remains non-blocking. |

### Device verification

- Target: `lg-oled-g1`.
- Status: not yet run.
- Required evidence: packaged `file://` Worker URL resolution, Worker startup/messaging, Worker IndexedDB, main-thread persistence across true relaunch, quota APIs, cancellation/recovery, playback impact, 10k/50k/100k synthetic-record tiers, and final disposable DB deletion.
- Runbook: `scripts/library-capability-report.md`.

### Security and privacy review

- The probe creates only a separately named disposable database containing synthetic records.
- The probe does not use the provider broker, provider transport, profiles, provider URLs, or credentials.
- Fixture and report guidance explicitly prohibit private catalog data, credentials, and raw payloads.

### Risks and follow-up

- Gate 0 cannot be accepted from Node/fake IndexedDB tests; the physical OLED G1 evidence is mandatory.
- Worker fetch is intentionally not implemented in this probe because real provider networking is denied by default and must remain independently evaluated.
- Phase 1A durable schema/repository remains blocked until Gate 0 is accepted.

### Rollback

- Remove the new probe-only files, Worker build script/configuration, probe API wiring, and development-only dependency.
- The probe uses no production catalog database and does not alter profiles, settings, favorites, or resume history.
- Rollback test: not required before the physical probe; no durable user/catalog data has been created.

### Decision

- Phase 0 automated implementation: complete.
- Phase 0 physical-device verification: pending.
- Gate 0: pending.
- Approved next implementation phase: none until Gate 0 physical evidence is accepted.

## 2026-08-01 — Phase 0 webOS runtime probe evidence

### Runtime and package verification

- The explicitly probe-enabled package installed and launched successfully through the `lg-oled-g1` target alias.
- The initial capability query was accidentally routed to the default emulator. A follow-up explicit query against `lg-oled-g1` confirmed the physical target: `OLED55G1RLA`, webOS SDK `6.5.3`, firmware `03.53.45`.
- The installed probe was exercised through the explicit `lg-oled-g1` target. The physical-device evidence below is therefore valid as partial Gate 0 evidence, but does not yet cover every required scenario.
- The packaged page loaded from its installed `file://` location and exposed `window.__NOVA_LIBRARY_PROBE__`.
- `webos-app/library-capability-worker.js` was emitted and packaged as one deterministic IIFE file. The runtime reported `typeof Worker === 'undefined'`, so Worker construction, URL resolution, messaging, fetch, worker-side IndexedDB, and worker-to-main fallback remain unverified.

### Sanitized main-thread IndexedDB evidence

- Main-thread IndexedDB creation, CRUD, index lookup, compound-key lookup, and cursor iteration succeeded.
- A 10,000-record marker survived an explicit app close/relaunch and was read before rewriting: `persistsAcrossRelaunch = yes`.
- `navigator.storage.estimate()` was available with approximately 400 MB quota; `navigator.storage.persist()` was available but returned `false`.
- The corrected probe now yields after each write unit and supports cancellation.
- A cancellation run rejected its next 500-record write unit as `cancelled` in approximately 0.34 ms; no later read/index/cursor stage was performed.
- Cleanup API invocation completed without an error result.

### Measured observations

| Scenario | Result | Notes |
| --- | --- | --- |
| 100 records, 10-record units | Successful | Write p95 approximately 32.9 ms; read approximately 28.3 ms; index approximately 10.8 ms; cursor approximately 32.9 ms. |
| 10,000 records, original aggregate implementation | Successful but unsuitable | Aggregate writes took approximately 10.7–11.3 s; this exposed that the first probe implementation was measuring one large call rather than bounded cooperative units. |
| 50,000 records, original aggregate implementation | Successful but unsuitable | Aggregate write approximately 62.9 s, read approximately 10.1 s, cursor approximately 9.8 s. These numbers are retained as a warning, not as an acceptable runner budget. |
| 10,000 records, 250-record yielded units | Successful but over budget | Early units reached approximately 967 ms and later units approximately 160–200 ms; still too large for an interactive main-thread runner. |
| Classic Worker | Unavailable | The runtime exposed no `Worker` global despite the packaged deterministic worker asset. |

### Decision

- Runner recommendation from the demonstrated capability set: `cooperative-main` only.
- Current safe observed write-unit scale: 10 compact records; larger measured units exceed the interactive budget.
- Gate 0: **pending**, not accepted.
- Blocking evidence: this physical-target session still lacks 10k/50k/100k measurements using safe units, playback-startup impact, transaction-recovery after termination, and all Worker paths remain incomplete.
- Phase 1A durable schema/repository remains blocked.

## 2026-08-01 — Gate 0 decision: no-go on the current physical target

### Additional physical-target evidence

- Confirmed target identity: `OLED55G1RLA`, webOS SDK `6.5.3`, firmware `03.53.45`.
- A fully yielded 10,000-record run using 10-record write transactions completed without provider traffic, preserving main-thread IndexedDB correctness.
- The measured p95 write unit was approximately **114.7 ms**, with isolated units substantially higher. The final 10,000-record read, index lookup, and cursor scan were approximately 2.67 s, 0.63 s, and 2.41 s respectively.
- This exceeds the plan’s interactive main-thread scheduling expectations before playback impact is considered.
- Classic Worker capability remains unavailable in this physical runtime, so neither `worker-idb` nor `worker-main-idb` is viable.
- Cancellation rejected the current write unit promptly and cleanup completed, but this does not offset the sustained main-thread timing failure.

### Gate decision

- Selected runner: `no-go`.
- Gate 0: **rejected** for a durable local-first catalog on the current physical webOS runtime.
- Rationale: persistent main-thread IndexedDB is functional, but no Worker runtime is available and cooperative main-thread write/query work does not meet the plan’s UI/playback safety requirement.
- Required action before reconsideration: obtain new target/runtime evidence showing an acceptable worker path or materially improved bounded main-thread timing with playback-startup measurements.
- Per the plan’s gate rule, do not implement the durable catalog schema, synchronization, or local-read cutover on this target.

## 2026-08-01 — Gate 0 reconsideration: flat category snapshots on OLED55G1RLA

This entry supersedes the preceding no-go **only for the measured flat-snapshot access model**. It does not restore Worker availability, normalize provider data into rows, or permit provider payload/state to become authoritative.

### Scope

- Target: physical `OLED55G1RLA`, webOS SDK `6.5.3`, firmware `03.53.45`.
- Package: explicitly probe-enabled `com.arash.novaplay` package installed through the `lg-oled-g1` device alias.
- Store shape: disposable IndexedDB database with one serialized category snapshot per record, each containing 300 sanitized synthetic normalized items.
- Measured access shape: write 200 snapshot records of approximately 51,021 bytes each; render-path read is exactly one `get()` followed by one `JSON.parse()`.
- Explicit exclusions: normalized per-item IndexedDB rows, full cursor scans during rendering, Worker paths, provider requests, persistent user authority, and production catalog/schema implementation.

### Additional implementation evidence

- Added `src/library/flat-snapshot-probe.ts` and `src/library/flat-snapshot-probe.test.ts`.
- The probe records separate serialization, IndexedDB put, post-put event-loop-turn, yielded-unit, one-record retrieval, JSON parse, cancellation, and crash-recovery measurements.
- Each snapshot write and its run checkpoint commit in the same short transaction. The recovery report accepts only a contiguous sequence of valid complete snapshots matching the committed checkpoint.
- Player startup instrumentation arms before a real resumed item is opened and completes only at the existing real `confirmPlaybackStarted()` signal.
- The physical probe remains synthetic and disposable; it does not include private catalog titles, provider URLs, credentials, or provider payloads.

### Physical flat-snapshot measurements

| Scenario | Result | Sanitized measurement |
| --- | --- | --- |
| 200 snapshots, approximately 51 KB each | Successful | All 200 writes completed; 200 valid retained snapshots; run marked complete. |
| Category render read | Successful | One-record retrieval approximately 8.7 ms; `JSON.parse()` approximately 1.6 ms for 300 items. |
| Put steady state | Successful | Initial flat run p95 put approximately 34.8 ms after the first five units. A repeat run measured p95 put approximately 38.5 ms after warm-up. |
| Direct post-put event-loop turn | Successful | p95 approximately 14.6 ms; worst approximately 37.5 ms over the 200-snapshot run. |
| Serialization | Successful | p95 approximately 14.2 ms; worst approximately 37.0 ms. |
| Worst whole cooperative unit | Observed, not used as the stall metric | Whole-unit wall time included awaited IndexedDB completion and platform scheduling; isolated outliers reached approximately 0.55–0.65 s. The directly scheduled post-put event-loop turn stayed below the 50 ms ingestion stall budget. |
| Explicit cancellation | Successful | Cancellation after approximately 0.9 s retained 15 valid snapshots, with no invalid or partial record and a `writing` checkpoint. |
| Abrupt app termination | Successful | Closing during a 1,000-snapshot run retained 169 valid, contiguous snapshots; recovery reported `writing`, no invalid snapshots, and atomicity preserved. |
| Real resumed playback, idle baseline | Successful | Existing player reached `confirmPlaybackStarted()` in approximately 2557.8 ms. |
| Real resumed playback, 1,000 snapshots pending | Successful | Existing player reached `confirmPlaybackStarted()` in approximately 2683.2 ms while snapshot writes continued. Delta approximately 125.4 ms, or approximately 4.9%, below the plan's provisional 10% ceiling. |
| Worker path | Unavailable | `typeof Worker === 'undefined'`; `worker-idb` and `worker-main-idb` remain unavailable. |

### Provider-traffic regression evidence

- Reloading the installed app produced only static document, stylesheet, script, and image activity; no `Fetch` or `XHR` provider request was observed.
- Opening Global Search and typing a local query produced no `Fetch` or `XHR` provider request.
- A physical home/browse interaction observation produced no provider `Fetch` request and no `get_short_epg` request. This is consistent with the explicit-render-only Now/Next design; automated static regressions continue to prohibit `prefetchNowNext` and remote global search.
- `rtk npm test` passed: 26 files, 188 tests. The expected mock 503 diagnostics in metadata Worker tests remain non-failures.
- `rtk npm exec tsc -- --noEmit` passed.
- The probe-enabled package rebuilt and installed successfully. The existing Dash.js CommonJS-in-ESM build warning remains non-blocking.

### Storage and authority constraints

- Main-thread IndexedDB remains durable across a true relaunch, but `navigator.storage.persist()` returned `false`.
- The catalog is therefore an evictable, rebuildable cache only.
- Profiles, credentials, settings, favorites, and resume history remain outside the catalog cache and retain their existing authority boundaries.
- Flat snapshots must remain category-scoped and be read only as one bounded snapshot at a time. No render path may reintroduce a whole-catalog cursor scan or per-item normalized-row fan-out.

### Decision

- Selected runner: `cooperative-main`.
- Gate 0: **accepted for the flat, category-snapshot catalog cache design on this exact OLED55G1RLA runtime**.
- Rejected runners remain: `worker-idb` and `worker-main-idb`.
- Superseded conclusion: the prior `no-go` was based on a 10,000-row normalized-record probe shape that is not the selected catalog access model.
- Calibrated initial constraints:
  - one snapshot per category;
  - approximately 300 compact items and approximately 50 KB per snapshot in the measured initial shape;
  - one snapshot write transaction per cooperative unit;
  - yield between units;
  - direct post-put event-loop turn must remain at or below the accepted 50 ms ingestion budget;
  - category first render must continue to use one bounded read plus parse;
  - playback startup regression must remain at or below 10% of the idle baseline;
  - incomplete/interrupted runs remain non-authoritative and rebuildable.
- Approved next phase: Phase 1A, provided its implementation is amended to use the accepted flat, rebuildable category-snapshot cache model rather than the previously rejected normalized-row storage shape.

## 2026-08-01 — Phase 1A flat durable schema and repository started

### Scope

- Plan phase: Phase 1A only.
- Baseline: commit `fccb4f2bcbaff0f3a7071c4d490498c1cc028d70` plus the retained working tree that passed the Gate 0 reconsideration checks.
- Selected runner: `cooperative-main`.
- Implemented target: an evictable, profile-isolated catalog cache in `nova-play-library`, with exactly `meta`, `manifests`, `snapshots`, `searchShards`, `details`, and `epg` object stores.
- Explicit exclusions: provider requests, acquisition, synchronization, UI read cutover, revisions or active pointers, leases or fencing, availability overlays, hybrid read sessions, section passes, tombstones, canonical identity, people or credits, version groups, collections, trigram indexes, and changes to profiles, credentials, settings, favorites, or resume state.
- Stop condition: Phase 1A acceptance. Phase 1B acquisition remains out of scope.

### Calibrated implementation limits

- Yield after every snapshot put and issue no more than one put per event-loop turn.
- Abort a cooperative write loop when playback begins.
- Shard a category before either 1,500 items or 256 KB would be exceeded.
- Build compact whole-profile search shards during normalization, with at most 5,000 tuples per shard.
- Treat missing databases, records, and partially evicted category shards as unavailable cache data rather than authoritative empty results.
- Keep cache data rebuildable because the target returned `false` from `navigator.storage.persist()`.

### Architecture amendment

This Phase 1A supersedes the frozen plan's normalized-row and revision-activation design only for the production catalog-cache schema approved by the accepted flat-snapshot Gate 0 evidence. Per-category single-record replacement is the atomic authority boundary. A metadata sync-in-progress marker and stale-run timestamp are sufficient for later synchronization coordination. The older revision, activation, lease, overlay, tombstone, and normalized membership machinery is not part of this implementation.

### Initial decision

- Phase status: `pending`.
- Gate status: `not applicable`.
- Approved next phase: none until Phase 1A automated and physical-device evidence is accepted.

## 2026-08-01 — Phase 1A implementation checkpoint

### Implementation

- Added `src/library/catalog-repository.ts`:
  - exactly six stores in `nova-play-library`: `meta`, `manifests`, `snapshots`, `searchShards`, `details`, and `epg`;
  - profile-scoped compound keys, flat JSON category snapshots, bounded whole-profile search tuples, TTL details/EPG, and a stale-run sync marker;
  - category snapshots are capped at 1,500 items or 256 KiB, use one cooperative write transaction per unit, yield between units, and are marked unavailable before replacement;
  - missing/invalid snapshots and evicted search shards degrade to non-authoritative unavailable-cache results;
  - snapshot/search in-memory caches are profile- and database-scoped and clear on profile changes;
  - cache normalization uses the exported storage whitelist and removes direct playback sources before persistence.
- Added `src/library/catalog-repository.test.ts`, covering fresh schema, profile isolation, oversized sharding, partial eviction, TTL, search parity, absent IndexedDB, playback cancellation, relaunch/deletion, stale-run takeover, cache scope, search eviction, profile deletion, and direct-source exclusion.
- Exported the existing `toStoredStream` whitelist and `isStreamItem` validator from `src/storage.ts`.
- Extended the disposable flat-snapshot probe with configurable target payload size and a 256 KiB / 1,500-item test shape.
- Wired the accepted playback-start boundary to cancel cooperative cache writes; no browse, category-load, global-search, or renderer read path was redirected to the cache.

### Automated verification

| Command | Result | Notes |
| --- | --- | --- |
| `rtk npm test` | Passed | 27 files, 202 tests. Existing mocked upstream 503 diagnostics remain expected test output. |
| `rtk npm exec tsc -- --noEmit` | Passed | No TypeScript diagnostics. |
| `rtk npm run build` | Passed | Existing Dash.js CommonJS-in-ESM warning remains the only build warning. |
| `rtk git diff --check` | Passed | No whitespace errors. |
| Probe-enabled `npm run package:webos` | Passed | Produced sanitized local package `com.arash.novaplay_1.0.3_all.ipk`. |

### Security and privacy review

- No provider request, acquisition loop, broker behavior, or local browse/search read path was added or changed for Phase 1A.
- The existing static provider-boundary test remains green: runtime `XtreamClient` construction remains confined to the broker.
- Profiles, credentials, settings, favorites, and resume history remain outside this database and are not written by the repository.
- Direct playback sources are excluded from cached stream and VOD detail records. No private catalog value or exported device trace is recorded in this status file.

### Device verification

- Target: `OLED55G1RLA` configured as `lg-oled-g1`.
- Status: pending because `ares-install -d lg-oled-g1` timed out while connecting to the configured device endpoint.
- Not yet measured: 256 KiB shard read, 200-snapshot cooperative write loop, playback-startup delta, relaunch/search/browse provider-traffic regression.
- No provider request was intentionally made while attempting the package deployment.

### Decision

- Phase status: `pending`.
- Gate status: `pending`.
- Blocking condition: physical target must be reachable for the mandatory Phase 1A device pass.
- Approved next phase: none; Phase 1B remains out of scope.

## 2026-08-01 — Phase 1A physical deployment retry

- Rebuilt the probe-enabled package after the final Phase 1A repository/privacy changes.
- Retried `ares-install -d lg-oled-g1 packages\com.arash.novaplay_1.0.3_all.ipk`.
- Result: the configured OLED55G1RLA endpoint again timed out before installation.
- No physical runtime measurement, relaunch, playback-delta, or provider-traffic result can be claimed from this retry.
- Phase 1A remains `pending`; Gate acceptance remains blocked until the target device is reachable.

## 2026-08-01 — Phase 1A physical acceptance on OLED55G1RLA

### Deployment and runtime

- Target confirmed: `OLED55G1RLA`, webOS SDK `6.5.3`, firmware `03.53.45`.
- Repackaged as `com.arash.novaplay` version `1.0.4` after the TV retained the earlier 1.0.3 asset set despite a same-version reinstall.
- Installed, launched, and inspected the probe-enabled package successfully.
- The production app remains on its existing UI read paths. The device probe used only synthetic, disposable IndexedDB records and did not acquire provider catalog data.

### Physical measurements

| Scenario | Result | Sanitized measurement |
| --- | --- | --- |
| Maximum shard read shape | Passed | One approximately 260,671-byte snapshot with 1,500 synthetic items: IndexedDB `get()` 17.385 ms; `JSON.parse()` 16.180 ms; combined 33.565 ms, below the 75 ms cap. |
| Maximum shard write | Passed | One approximately 260,671-byte snapshot: put 41.215 ms; directly scheduled post-put event-loop turn 2.195 ms. |
| 200 cooperative snapshots | Passed | 200 × approximately 51,021-byte/300-item snapshots completed in 7,725.57 ms; recovery retained all 200 contiguous snapshots and reported atomicity preserved. |
| 200-snapshot steady put | Passed | Steady-state p95 put 34.870 ms; all-write p95 put 34.345 ms. One asynchronous put-completion outlier reached 1,068.40 ms, but it did not correspond to an event-loop stall. |
| 200-snapshot event-loop budget | Passed | Direct post-put event-loop p95 5.520 ms; worst 23.520 ms. Cooperative p95 pre-yield slice 47.795 ms. Every write used one record transaction and yielded before the next unit. |
| Idle real resumed playback | Passed | Existing `confirmPlaybackStarted()` signal: 2,833.595 ms. |
| Real playback with 1,000 writes pending | Passed | Playback ready in 2,288.090 ms while 1,000 snapshots continued and recovered atomically. The measured delta was -545.505 ms (-19.25%); this is not treated as an improvement claim, but it is below the accepted 10% regression ceiling. |
| Concurrent write workload | Passed | 1,000 writes completed in 53,683.17 ms; p95 put 61.080 ms; direct post-put event-loop p95 6.645 ms, worst 36.945 ms; no cancellation and complete atomic recovery. |

### Provider-traffic regression evidence

- App reload emitted only local `Document`, `Stylesheet`, and `Script` resources plus existing external artwork `Image` resources. It emitted no provider `Fetch` or `XHR`.
- Opening Global Search, entering a query, and invoking the local-search action emitted zero `Fetch`/`XHR` requests.
- A Home action emitted zero `Fetch`/`XHR` requests.
- These observations re-confirm the prior local-only startup/search behavior. The artwork requests are not IPTV-provider requests and were pre-existing UI behavior.

### Deviations and calibrated constants

- The 256 KiB target generated a 260,671-byte payload because synthetic item framing is calculated per item; it remained within the 262,144-byte maximum and is the relevant bounded read/parse size.
- The concurrent 1,000-write run's 61.080 ms put p95 exceeded the earlier 34.8–38.5 ms steady-state put reference. This is recorded as fresh device evidence rather than silently changing that design budget; its directly measured post-put event-loop p95 remained 6.645 ms and playback did not regress.
- Per the physical evidence, Phase 1B must retain:
  - at most one snapshot write transaction per event-loop turn;
  - a cooperative yield after every snapshot;
  - immediate write-loop cancellation at playback start;
  - category shard caps of 1,500 items and 256 KiB;
  - direct post-put event-loop p95 at or below 50 ms;
  - category reads limited to one bounded `get()` plus one parse;
  - cache-only authority and missing-record degradation semantics.
- The isolated asynchronous IndexedDB-put wall-time outlier is recorded but is not a main-thread stall metric; the directly scheduled event-loop-turn measurements remain the accepted scheduling evidence.

### Final verification and rollback

- Automated evidence remains the completed `rtk npm test` (202 tests), `rtk npm exec tsc -- --noEmit`, `rtk npm run build`, and `rtk git diff --check` checks recorded above.
- Rollback boundary: do not instantiate or route UI reads through `IndexedDbCatalogRepository`; deleting `nova-play-library` removes only rebuildable cache records. Existing `localStorage` profiles, credentials, settings, favorites, and resume records remain untouched.
- No provider acquisition or Phase 1B synchronization was started.

### Decision

- Phase 1A: **accepted**.
- Phase 1A gate: **accepted** for the flat, evictable, profile-isolated six-store cache on this exact target.
- Phase 1B is now eligible only as a separately authorized task. It has not been started.

## 2026-08-01 — Phase 1B implementation and fixture verification

### Scope

- Implemented Phase 1B provider acquisition and synchronization only.
- Explicitly excluded: Phase 2A UI cache-read cutover, catalog renderer changes, query-triggered acquisition, any normalized item-row store, extra IndexedDB stores, and real provider traffic during development verification.
- The six-store flat cache remains the only durable catalog storage shape. Profiles, credentials, settings, favorites, and resume state remain authoritative in `localStorage`.

### Implementation

- Added `CatalogSyncCoordinator`, which acquires catalog data only through `ProviderBroker` background-lane methods.
- A normal scheduled catalog run issues exactly six serial requests:
  1. `get_live_categories`, `get_vod_categories`, `get_series_categories`;
  2. one brace-aware incremental whole-section scan for each of live, VOD, and series.
- Whole-section scans reuse `XtreamClient`’s streamed brace-aware parser and require a complete, closed top-level array. They do not call `JSON.parse()` over a whole catalog response.
- Parsed normalized items are partitioned into per-category buckets. Snapshot publication starts only after the entire section scan succeeds; truncated, aborted, malformed, or failed scans preserve the previously published category snapshots and coverage.
- Added atomic category-generation publication via manifest `shardBase` pointers. A failed cooperative replacement leaves the previous generation reachable; old generation cleanup is yielded and stops safely for playback/cancellation.
- Persisted per-section sync state in `meta.sync.sections`: coverage, whole-section failure count, next category cursor, and attempt/success/failure timestamps.
- A failed whole-section scan records a checkpoint. On the next due run only, that section consumes one request for its persisted category slice; the cursor advances after success and resumes on later due runs. There is no same-run category crawl or automatic retry.
- Applied a 24-hour success cooldown and 6-hour exponential failure cooldown capped at 24 hours. Existing broker daily budget/refusal persistence remains the provider-wide enforcement mechanism.
- Added a background idle scheduler and probe-only manual control under `window.__NOVA_LIBRARY_PROBE__.catalogSync`. Playback start, profile change, app hide, page hide, and profile-add flows cancel scheduled/active catalog synchronization.
- Confirmed that `main.ts` has no `readCategoryShard()` or catalog `search()` call: Phase 1B does not change any UI read path.

### Automated verification

| Command | Result | Notes |
| --- | --- | --- |
| `rtk npx tsc --noEmit` | Passed | No TypeScript errors. |
| `rtk npm test -- --run src/library/catalog-sync.test.ts src/library/catalog-repository.test.ts src/xtream-client.test.ts` | Passed | 44 tests. |
| `rtk npm test -- --run src/local-first-regression.test.ts src/provider-boundary.test.ts src/library/catalog-sync.test.ts` | Passed | 13 tests. |
| `rtk npm test` | Passed | 28 files, 216 tests. Mocked metadata upstream-503 diagnostic lines are expected test output. |
| `rtk npm run build` | Passed | Existing non-blocking Dash.js CommonJS-in-ESM warning remains. |
| `rtk npm run package:webos` | Passed | Produced `packages/com.arash.novaplay_1.0.5_all.ipk`. |

### Fixture coverage

- Complete catalog path: exactly six serial background requests; maximum in-flight request count is one.
- Refusal path: first refusal stops queued catalog work without an additional request.
- Persistence path: relaunch during cooldown sends zero requests.
- Failure path: failed whole-section refresh and truncated streamed response preserve the already published snapshot and its coverage.
- Fallback path: a persisted category cursor advances one slice per scheduled run and resumes correctly.
- Failure-ceiling path: seven scheduled failure runs each remain at the six-request ceiling.
- Parser path: a full streamed section emits incrementally without retaining a result array; a truncated root array rejects instead of being accepted as complete.
- Read-path guard: local search remains local and Phase 2A cache reads are still absent from UI routing.

### Physical Gate 1 status

- No Phase 1B real-provider request was made while implementing, testing, building, or packaging this phase.
- Gate 1 remains pending a controlled opt-in device run using the 1.0.5 package.
- Required device evidence before any Phase 2A decision:
  - inspect persisted provider-access/refusal state before the run;
  - execute one controlled sync attempt only;
  - stop and capture only sanitized typed diagnostics on 401, 403, 429, or `Retry-After`;
  - verify reload, Home, and local Global Search provider traffic after the run;
  - collect at least five paired playback-start samples for each arm under real synchronization workload, report median, p95, and spread for both arms;
  - interpret any negative playback delta as noise, never as an improvement.

### Device preflight

- Installed and launched the explicitly probe-enabled `com.arash.novaplay` 1.0.5 package on `OLED55G1RLA` (webOS SDK 6.5.3, firmware 03.53.45).
- The development probe API was present in the packaged app.
- Before attempting any Phase 1B acquisition, persisted provider-access state was inspected. The active UTC-day record already had a request count of 6 and no active refusal block.
- The scheduled Phase 1B coordinator remained subject to the existing broker's persisted ceiling. No additional provider request was emitted during this verification session; the already exhausted daily budget prevented acquisition rather than using a denied request as a substitute for a controlled live run.
- A controlled live sync and paired playback measurement must wait until the persisted daily request budget resets or is legitimately reset by profile/account lifecycle, then repeat the stated preflight.

### Decision

- Phase 1B code implementation and fixture verification: complete.
- Physical Gate 1: pending; deferred by the already exhausted persisted daily provider budget.
- Phase 2A UI read cutover: not started and not authorized by this entry.

## 2026-08-02 — Phase 1B provider-budget correction and controlled Gate 1 evidence

### Preflight diagnosis and correction

The earlier 1.0.5 preflight conclusion that the controlled sync had to wait for a budget reset was incorrect. The observed persisted record used the legacy shared-counter format:

```json
{
  "1785247784972": {
    "day": "2026-08-01",
    "requestCount": 6,
    "block": null,
    "failureCount": 0,
    "nextAttemptAt": null,
    "updatedAt": 1785585298351
  }
}
```

- It had no `windowStartAt`, `interactiveRequestCount`, or `syncRequestCount`.
- Source inspection confirmed that the prior broker debited this single `requestCount` for validation, category/stream browsing, details, EPG, and background acquisition alike.
- The old count of six was therefore evidence of a shared interactive/provider ceiling, not evidence that six catalog-sync requests had already been made.
- This was fixed rather than deferred:
  - persisted state now records an explicit UTC `windowStartAt`, plus independent `interactiveRequestCount` and `syncRequestCount`;
  - legacy `requestCount` migrates to interactive use only; legacy sync use is zero because it cannot be proven from the old format;
  - the background acquisition lane has its own six-request daily budget;
  - user-initiated traffic uses a separate 24-request interactive allowance;
  - both classes remain serialized by the same broker and a persisted refusal or Retry-After remains absolute across both;
  - UTC-window rollover is injected-clock tested at the exact boundary, persists across relaunch, and does not grant additional allowance after wall-clock rollback;
  - probe-only reset clears only both counters. It retains the refusal block, Retry-After deadline, failure state, and cooldown metadata.

### Verification of the correction

- Automated checks after the accounting change:
  - `rtk npx tsc --noEmit`: passed.
  - targeted broker/storage/catalog tests: passed, 23 tests.
  - full test suite: passed, 28 files and 224 tests.
  - `rtk git diff --check`: passed.
- Regression coverage verifies:
  - normal login, three section manifests, three category opens, and VOD/series details consume interactive allowance but leave all six sync requests available;
  - exact rollover, relaunch, and rollback safety;
  - interactive exhaustion still permits due sync;
  - sync exhaustion does not prevent locally generated playback URLs;
  - refusal state survives relaunch and probe reset;
  - budget-debit traces contain only aggregate counters, priority, and budget class, with no URL, credential, request parameters, or catalog data.
- The final probe-enabled 1.0.6 package was rebuilt and reinstalled after the final sanitized section-failure trace addition. The only build warning was the pre-existing Dash.js CommonJS-in-ESM warning.

### Device preflight and controlled acquisition

- Target: `OLED55G1RLA`, webOS SDK `6.5.3`, firmware `03.53.45`, device alias `lg-oled-g1`.
- Package: probe-enabled `com.arash.novaplay` 1.0.6.
- Probe presence and the `catalogSync.inspectBudget`, `resetBudget`, and flat-snapshot playback controls were confirmed after the final 1.0.6 reinstall.
- Corrected persisted state before reset was:
  - `windowStartAt`: `1785542400000`;
  - `windowEndsAt` and `nextResetAt`: `1785628800000`;
  - reset rule: current UTC window remains active;
  - interactive: 6 used of 24;
  - sync: 0 used of 6;
  - refusal block: null.
- Probe reset then produced interactive 0 of 24 and sync 0 of 6, with the refusal block still null. This confirmed the reset control did not change a clear/refusal state.

One controlled due sync was made after clearing only the stale catalog-coordinator cooldown in DevTools test setup. That setup did not alter either provider budget or the provider refusal state.

- The broker emitted exactly six `provider-budget-debit` events, each with `priority=background` and `budget=sync`.
- The sync counter progressed exactly from 1 through 6; the final budget snapshot was interactive 0 of 24, sync 6 of 6, and refusal block null.
- The six provider operations were three category manifests followed by three section scans. All observed response headers were HTTP 200.
- Every next debit occurred only after the prior request end event. The observed maximum in-flight provider request count was one.
- No `xtream-http-failure`, `provider-refusal-recorded`, or provider-block trace event occurred; therefore there was no 403/429 diagnostic to capture.
- The run returned `failed` after exactly six requests:
  - the live checkpointed category slice completed;
  - the VOD checkpointed category slice and Series whole-section scan reported `scan-failed`, both with `refused=false`;
  - both corresponding provider scans had already produced successful HTTP 200/end evidence, so the failure was not a provider refusal or a seventh request;
  - the package used for this one allowed live acquisition did not yet classify post-scan section failures. The final 1.0.6 package now emits the sanitized `catalog-sync-section-failed` classification (`provider`, `library-write`, or `unknown`, without exception message or catalog data), but it was not live-exercised because that would require a forbidden second provider acquisition.
- The persistent sync state recorded a failed run and a future cooldown deadline. An immediate second `catalogSync.run()` returned `cooldown` with `requestCount=0`; no further provider request was issued.

### Reload, Home, Search, and playback observations

- A physical Home action emitted zero provider-network trace events.
- A physical Global Search open, local query submission, and result view emitted zero provider-network trace events.
- A physical reload was observed with six static/resource requests and zero requests to the provider API endpoint.
- One real resumed-playback baseline sample completed at `3038.435 ms`.
- No catalog-sync workload playback arm was run after the controlled acquisition because the sync budget was exhausted and a further provider acquisition would violate the one-controlled-sync Gate 1 condition.
- Consequently, there are not five paired samples for either arm. No median, p95, spread, or comparative delta is claimed. The single baseline is retained only as an incomplete observation and is not used to claim an improvement or regression.

### Security and privacy review

- This record contains no provider URL, credential, private catalog title, search query, raw payload, or exported device trace.
- Device evidence is limited to counters, generic operation classes, response status, request sequencing, aggregate timing, and sanitized failure classification.
- The final section-failure trace deliberately records type/classification only; it excludes exception messages because they can contain provider payload fragments.

### Decision

- Split budget accounting and legacy migration: **accepted**.
- Controlled request-count, serialization, refusal-clear preflight, cooldown-zero-request behavior, and reload/Home/Search provider-traffic checks: **accepted**.
- Physical catalog write reliability: **pending** because the controlled run had two non-refusal post-scan failures whose exact final-package classification has not been live-captured.
- Playback Gate 1 evidence: **pending** because only one baseline exists; five paired baseline/workload samples with median, p95, and spread are still required.
- Physical Gate 1: **pending**.
- Phase 2A UI cache-read cutover: **not started, not authorized**. Stop here until Gate 1 is completed with a separately approved, budget-safe device procedure.

## 2026-08-02 — Gate 1 failure diagnosis, cache inspection, offline replay, and synthetic-workload playback evidence

### Finding moved to the top

Gate 1 remains **rejected/pending** because the controlled run reported failures for two sections after successful HTTP 200 section responses. The strict complete-array refusal policy remains correct: incomplete data must not be declared authoritative. The unresolved cause matters because it determines whether checkpointed fallback is a remedy or whether catalog synchronization is not viable.

The no-provider-traffic investigation below materially narrows the fault:

- The original controlled-run trace recorded HTTP status, request/end ordering, and `matchCount`, but did **not** record bytes received, parsed-record count, terminal top-level-array state, scan-timeout state, or exact validation condition.
- Therefore the original live trace cannot identify a parser validation condition. This telemetry absence is itself a Gate 1 finding.
- However, the persisted cache proves that neither affected section was rejected before all scan output was discarded:
  - VOD has one active snapshot containing 164 items after the reported failed category-slice attempt.
  - Series has 231 active snapshots containing 44,679 items and is marked coverage `complete`, despite its persisted fallback checkpoint also recording a whole-section failure.
- Those persisted outputs are incompatible with a pure strict-parser rejection before publication. They narrow the actual failure to a **post-scan bookkeeping path** after successful scan/publish work: snapshot completion cleanup, manifest reread, or sync-state update. The pre-instrumentation run cannot distinguish those three stages.
- This is not yet an accepted result: the coordinator must not schedule unnecessary fallback work after a section has already published complete snapshots.

### Existing controlled-run trace, reconstructed without new provider traffic

The stored sanitized trace from the one controlled run showed:

| Section operation | HTTP status | Header-to-end observation | Match count | Terminal fields available then |
| --- | ---: | ---: | ---: | --- |
| VOD fallback category slice | 200 | headers in approximately 306 ms; request ended in approximately 558 ms | 164 | No bytes, parsed count, array-close state, timeout marker, or validation reason |
| Series whole-section scan | 200 | headers in approximately 482 ms; request ended in approximately 37.61 s | 44,679 | No bytes, parsed count, array-close state, timeout marker, or validation reason |

Both request-end events had `aborted=false`. No refusal, `xtream-http-failure`, provider block, or Retry-After was recorded. This rules out a 403/429 outcome and does not support a timeout during provider I/O.

The final source now adds a sanitized `xtream-catalog-scan-terminal` event for every strict scan with only:

- HTTP status;
- header and total elapsed time;
- received byte count;
- parsed-record count;
- top-level-array closed boolean;
- timeout boolean;
- terminal ProviderError kind;
- exact parser validation condition when applicable.

It excludes URL, credentials, request parameters, titles, payload text, and response content. The coordinator also now records a sanitized failure stage: `provider-scan`, `snapshot-publish`, `manifest-read`, or `sync-state`. These additions deliberately were **not** live-exercised because that would require a prohibited second provider acquisition.

### Persisted IndexedDB inspection

A probe-only `catalogSync.inspectState()` was added and run against the existing device state. It performs IndexedDB reads only and issues zero provider requests.

| Section | Coverage | Manifest categories | Active snapshots | Active items | Checkpoint |
| --- | --- | ---: | ---: | ---: | --- |
| Live | partial | 822 | 823 | 53,866 | whole-section failures 1; cursor 1; last success present |
| VOD | partial | 362 | 1 | 164 | whole-section failures 1; cursor 0; no recorded success |
| Series | complete | 231 | 231 | 44,679 | whole-section failures 1; cursor 0; no recorded success |

Additional persisted state:

- `inProgress=false`;
- global sync `failureCount=3`;
- `nextDueAt=1785706901432`;
- sync budget remains 6/6 and interactive allowance remains 0/24;
- provider refusal block remains null.

This is the core device result:

1. Live is not known complete, but it retains substantial published cache data and has advanced its fallback cursor once.
2. VOD has published a 164-item active snapshot despite being recorded as a failed fallback section.
3. Series has a complete active snapshot set with 44,679 items despite being recorded as a failed whole-section fallback candidate.

The failure cooldown is the current exponential cap: failure count 3 produces 24 hours, not the 24-hour success cooldown. The next scheduled run will follow persisted checkpoint state: one category slice each for Live, VOD, and Series, not a fresh whole scan for those checkpointed sections. That behavior is read from persisted state, not inferred only from source.

### Offline strict-scan replay

No live provider request was made. `XtreamClient` regression coverage now uses offline response fixtures to replay:

1. a complete object with an unclosed top-level array;
2. a mid-stream transport interruption after a parsed object;
3. an unclosed object;
4. an oversized bounded response.

The sanitized terminal classifications are verified as:

| Fixture | Result |
| --- | --- |
| Unclosed top-level array | `invalid-response`, `root-not-closed` |
| Mid-stream abort after parsed object | `network`, no parser-validation condition |
| Unclosed object | `invalid-response`, `object-not-closed` |
| Oversized response | `too-large`, no parser-validation condition |

The test also asserts that the terminal evidence contains no profile server URL, username, or password. Targeted TypeScript and tests passed: 38 tests across scan, coordinator, and probe suites.

### Completion-time estimate; no budget change made

The persisted fallback cursors imply the following best-case remaining category-slice work if every subsequent slice succeeds:

- Live: 821 remaining category slices before its next whole-section confirmation attempt.
- VOD: 362 remaining category slices before confirmation.
- Series: 231 remaining category slices before confirmation.
- Total remaining slice operations: 1,414, plus whole-section confirmation attempts.

Under the current fixed six-request run shape, each due run spends three manifest requests and only one slice request per section. With the current capped failure cooldown, that means approximately one slice per affected section per day.

**Best-case completion is therefore approximately 822 further due runs/days (about 2.25 years) before Live can complete its fallback cycle and receive a whole-section confirmation.** VOD and Series can reach their confirmation points earlier, around days 363 and 232 respectively, assuming no repeated post-scan failure.

This is an estimate from persisted category counts and cursor positions, not a request to modify the budget.

For comparison only: a separately approved serial, refusal-respecting 15–20 request/day policy is materially different from the historical burst amplification pattern that issued many requests per refusal and triggered whole-library scans from interaction. It could lower the theoretical lower bound to months if it deliberately allocated most additional slots to checkpointed category slices, but it would require explicit scheduling and policy changes. No such change was made here.

### Playback evidence using the actual competing workload

No provider sync was started. The workload arm uses the existing physical Phase 1A cooperative snapshot writer: 200 snapshots of approximately 51 KiB and 300 items each. This is the relevant main-thread pressure competing with playback startup.

| Arm | Five physical resumed-playback samples (ms) | Median | Nearest-rank p95 | Min–max spread |
| --- | --- | ---: | ---: | ---: |
| Baseline | 2367.505, 2517.095, 2809.605, 3921.740, 3302.840 | 2809.605 | 3921.740 | 1554.235 |
| Concurrent 200-snapshot workload | 2367.520, 2298.740, 2714.025, 2623.230, 2264.980 | 2367.520 | 2714.025 | 449.045 |

Each workload run completed all 200 cooperative writes and was not cancelled. Observed workload put p95 values ranged from approximately 43.725 ms to 62.840 ms; worst individual asynchronous put completions ranged from approximately 156 ms to 1,060 ms.

The median workload-minus-baseline delta is **-442.085 ms (-15.74%)**. This negative delta is treated as measurement noise, not an improvement claim. The workload arm is less variable in this sample, but this does not cure the catalog-state inconsistency described above.

### Decision

- Budget-accounting correction: **accepted**.
- Strict-array design: **accepted**. It correctly rejects incomplete responses in offline replay and does not publish truncated input as authoritative.
- Physical controlled acquisition request count/serialization/refusal behavior: **accepted**.
- Reload, Home, and Global Search provider-traffic regression: **accepted**.
- Synthetic cooperative-write playback evidence: **accepted for the measured workload only**; no negative delta is treated as an improvement.
- Catalog synchronization correctness: **rejected/pending**:
  - live state is partial;
  - VOD/Series show post-publication bookkeeping inconsistency;
  - the original trace lacks the terminal scan and coordinator-stage fields required to distinguish the exact post-scan fault;
  - the persisted fallback schedule has an approximately 822-day best-case completion horizon at the unchanged current policy.
- Gate 1: **rejected/pending**. Do not begin Phase 2A. Do not issue any further provider request until a separately approved diagnosis/fix plan addresses post-scan bookkeeping and the resulting fallback completion trade-off.

### Subsequent zero-provider source diagnosis and corrective change

After the persisted-state inspection, the repository code exposed a concrete webOS-sensitive post-publication fault candidate:

- `updateSyncState()` opened an IndexedDB readwrite transaction, awaited `store.get()`, then called `store.put()` after the await.
- Older webOS IndexedDB implementations can auto-commit a transaction between tasks once its request queue is empty. In that case the later `store.put()` fails because the transaction is inactive.
- This exactly matches the device state: successful snapshot/manifest publication followed by missing `lastSuccessAt` and a section failure checkpoint. It also explains why the same race can succeed for one section and fail for another.

`updateSyncState()` has now been changed so the read, state transformation, and `store.put()` happen in the original `get()` success callback, before the transaction is eligible to auto-commit. A new deterministic repository regression test proves that the sync state, failure count, per-section checkpoint, and timestamps survive the read-modify-write.

This is the most likely root cause, not retroactive live proof: the installed package that ran the single controlled acquisition predated the scan-terminal and failure-stage telemetry. No second provider sync was issued to respect the stop condition.

### Final Gate 1 decision

- Gate 1: **rejected** for the current device evidence.
- Reason: the only controlled sync left internally inconsistent post-publication state, so category coverage cannot yet be relied on for a Phase 2A UI read cutover.
- Corrective source changes and offline regression evidence are complete, but require a separately approved, budget-safe physical verification run before this Gate can be reconsidered.
- Phase 2A: **not started and not authorized**.
- No further provider request was issued during this diagnosis, cache inspection, fixture replay, source correction, or synthetic playback measurement.

### Final offline verification after corrective change

- `rtk npx tsc --noEmit`: passed with no TypeScript diagnostics.
- `rtk npm test -- --run src/library/catalog-repository.test.ts src/library/catalog-sync.test.ts`: passed, 26 tests.
- `rtk npm test -- --run`: passed, 28 files and 226 tests. Expected mocked metadata-upstream 503 diagnostic output remains non-failing test output.
- `rtk git diff --check`: passed with no whitespace errors.
- These checks validate the source correction and offline regression suite only. The corrected source has not been installed or physically verified on the TV, no additional provider request was issued, Gate 1 remains rejected, and Phase 2A remains blocked.

## 2026-08-02 — Approved corrected-code Gate 1 verification run

### Offline proof before physical traffic

- The repository test suite now drives a realistic offline whole-section fixture through the real `ProviderBroker`, `CatalogSyncCoordinator`, and `IndexedDbCatalogRepository`: 30,000 VOD items across 300 categories.
- A deterministic IndexedDB auto-commit harness makes a legacy `await get()` then `put()` metadata update fail after VOD snapshots and manifest publication, reproducing the prior post-publication inconsistency.
- The callback-contained corrected metadata writes complete the same fixture in six serial requests with complete coverage, all 300 category snapshots, 30,000 items, zero whole-section failures, and zero checkpoint cursors.
- To remove the same lifecycle risk from the other metadata read-modify-write operations, `putMeta`, `tryBeginSync`, and `finishSync` now also keep their read/transform/write work inside the original request callback.
- Offline verification passed: `rtk npx tsc --noEmit`; targeted repository test (18 tests); full suite (28 files, 227 tests). No fixture can contact a provider.

### Controlled device procedure

- Rebuilt and installed probe-enabled `com.arash.novaplay` 1.0.6 containing the corrected repository code and terminal scan/failure-stage telemetry.
- Before the run, the persisted broker state was interactive 0/24, sync 0/6, with no refusal block. The probe reset was invoked while both counts were already zero; it did not change an allowance, limit, or refusal state.
- The explicitly probe-only `resetForWholeSectionProbe()` then deleted only the rebuildable profile catalog cache, clearing its cooldown and fallback checkpoint. It preserved broker budget/refusal state, profiles, settings, favorites, and resume history.
- The cleared cache was confirmed to have no manifests, snapshots, items, checkpoints, or next due time before starting the one approved run.

### Per-section terminal diagnosis

The run stopped after five serial provider requests because the VOD category-manifest request returned HTTP 500. No second provider run was made.

| Section | Manifest result | Scan terminal evidence | Snapshot/coverage result | Persisted checkpoint |
| --- | --- | --- | --- | --- |
| Live | HTTP 200 | HTTP 200; 18,620,682 bytes; 18,910 ms; 53,913 records; top-level array closed; no timeout; no validation rejection | 824 active snapshots; 53,913 items; coverage `complete` | whole-section failures 1; cursor 0; no success timestamp |
| VOD | HTTP 500 | No scan was issued because category acquisition failed; bytes, records, closure, timeout, and validation condition are therefore absent | 0 snapshots; 0 items; coverage `none` | whole-section failures 0; cursor 0; category attempt/failure timestamps recorded |
| Series | HTTP 200 | HTTP 200; 51,499,350 bytes; 45,517 ms; 44,679 records; top-level array closed; no timeout; no validation rejection | 231 active snapshots; 44,679 items; coverage `complete` | whole-section failures 1; cursor 0; no success timestamp |

- Live and Series both passed strict streamed parsing completely. Their failures occurred only after those successful terminal scans, at coordinator stage `snapshot-publish`.
- The sanitized failure classification for both is `failureSource=unknown`, `exceptionType=ReferenceError`, `refused=false`. The exception message was intentionally not persisted because error messages can contain provider-derived text.
- Therefore the auto-commit race is a demonstrated legacy failure mode and the corrected code passes its production-scale offline pairing, but it is **not the complete physical root cause**: the corrected package still produced a post-scan snapshot-publication `ReferenceError`.
- The terminal telemetry establishes that the physical Live and Series failures were neither truncation, top-level-array validation rejection, transport failure, nor timeout. The exact browser identifier/message for the write-stage `ReferenceError` was not captured by the privacy-safe trace surface; this is now the remaining diagnosis gap.
- The broker made exactly five serial background/sync debits. Each subsequent debit followed the prior request end; no refusal or Retry-After occurred. The final persisted budget was interactive 0/24 and sync 5/6. The unchanged six-request ceiling was neither raised nor exhausted by the run.

### Cooldown and stop condition

- The failed run persisted `failureCount=1` and `nextDueAt=1785698058817`, the six-hour failure cooldown.
- An immediate probe `catalogSync.run()` returned `cooldown`, `requestCount=0`, with zero new provider-budget debits and zero new network events. This is the required no-second-request evidence.
- No later provider request was issued.

### Final Gate 1 decision after corrected-code run

- Gate 1: **rejected**.
- The provider itself also returned one VOD category-manifest HTTP 500, preventing a six-request/all-three-section success result.
- More importantly, Live and Series reproduced a post-scan `snapshot-publish` failure after complete HTTP-200 streamed inputs under the corrected transaction implementation. The source correction is therefore insufficient as a physical explanation.
- The six-request/day budget remains unchanged and is not implicated by this result. The fallback completion estimate remains a symptom of unresolved whole-section reliability, not a reason to raise the ceiling.
- Phase 2A remains **not started and not authorized**. Per the approved decision rule, do not re-run provider acquisition until a separately approved diagnosis plan captures the remaining write-stage fault without weakening privacy or cache-authority guarantees.

## 2026-08-02 — Post-ReferenceError offline hardening and blocked approved verification

### Offline diagnosis and safeguards

- The requested bare-global audit was completed against both source and the built webOS IIFE. The prohibited identifiers are absent from the bundle: `structuredClone`, `reportError`, `AggregateError`, `WeakRef`, `FinalizationRegistry`, `AbortSignal.timeout`, and `Array.fromAsync`.
- `crypto.randomUUID` remains guarded by an optional property check and is not a bare-global `ReferenceError` candidate in the published snapshot path.
- TypeScript now targets ES2015 output with an ES2020/DOM library ceiling. The build runs a permanent IIFE compatibility check that fails if any prohibited post-ES2015 global appears.
- The catalog coordinator now records a payload-free publication sub-stage and, only when `VITE_ENABLE_LIBRARY_PROBE=true`, bounded/redacted application-fault type, message, and up to three file/line/column frames. Provider/network failures remain message-free.
- The offline production-scale regression continues to prove corrected publication and metadata update behavior for 30,000 items across 300 categories, using six serial broker requests with complete coverage and no fallback checkpoints.

### Cooperative-write and cancellation proof

- The flat-snapshot probe now reports cancellation acknowledgement time and exposes a payload-free commit callback for deterministic test control.
- The app-wide active probe controller is cancelled synchronously at real playback start, so a running probe cannot continue competing with player initialization.
- Offline `fake-indexeddb` verification completed 1,055 cooperative snapshots (8 synthetic items and an approximately 2 KiB payload per snapshot), retained all 1,055 valid contiguous snapshots, and marked the run complete atomically.
- A separate playback-start cancellation test aborted immediately after the second committed unit. It retained exactly two valid committed snapshots, left the interrupted run non-authoritative, and asserted cancellation acknowledgement at or below 250 ms.
- These are offline/runtime-model checks, not physical OLED timing claims.

### Automated verification

| Command | Result | Notes |
| --- | --- | --- |
| `rtk npx tsc --noEmit` | passed | No TypeScript diagnostics. |
| `rtk npm test -- --run` | passed | 28 files, 230 tests; includes the 30k publication fixture and 1,055-snapshot proof. |
| `rtk npm run build` | passed | Normal IIFE build and prohibited-global check passed; known Dash.js CommonJS-in-ESM warning remains non-blocking. |
| `rtk git diff --check` | passed | No whitespace errors. |
| `rtk npx vite build --mode probe-build` | passed | Explicit probe-enabled IIFE built successfully. |
| `rtk node scripts/check-webos-bundle.mjs` | passed | Probe-enabled IIFE also contains none of the prohibited globals. |

### Approved device-run preparation and stop condition

- A probe-enabled `com.arash.novaplay_1.0.6_all.ipk` package was produced successfully after the offline proof.
- Installation to `lg-oled-g1` was then attempted once. `ares-install` timed out before installing the package.
- The updated probe API was therefore not deployed, stale Live/Series checkpoints were not cleared, and no catalog sync was started.
- This failed installation sent no provider request and did not alter the six-request background budget, provider refusal state, or existing cooldown.
- No physical-device telemetry, no six-request Gate 1 acquisition, and no cooldown follow-up can be claimed from this attempt.

### Decision

- Offline compatibility, observability, production-scale publication, and cooperative-write/cancellation evidence: **accepted**.
- Stale-checkpoint clearing and the one approved physical verification run: **blocked** by the device connection timeout.
- Gate 1: **rejected/pending** until the probe-enabled package can be installed and the previously approved single serial run completes with all three sections authoritative and no failed checkpoint/cursor.
- Phase 2A remains **not started and not authorized**.

## 2026-08-02 — Probe deployment and zero-request checkpoint clearing

### Deployment and probe connection

- The previously packaged probe-enabled `com.arash.novaplay_1.0.6_all.ipk` installed successfully on `lg-oled-g1` and launched successfully.
- A CDP/DevTools connection to the installed `file://` app was established. `typeof window.__NOVA_LIBRARY_PROBE__` returned `object`, confirming the probe-enabled build is active.
- No provider request was made while installing, launching, connecting DevTools, inspecting state, or cancelling the scheduled coordinator.

### Persisted state before mutation

- The broker reported interactive `0/24`, sync `5/6`, and no refusal block.
- The current UTC sync window remains active with exactly one remaining sync debit. The pre-approved normal verification requires up to six serial requests, so it was not started under this insufficient budget.
- The coordinator reported no active run, a persisted failure cooldown, and stale failure checkpoints for Live and Series. Existing cached data remained: Live coverage `complete` with 53,913 items; Series coverage `complete` with 44,679 items; VOD coverage `none`.

### Local checkpoint clearing

- `catalogSync.cancel()` was called before the local operation.
- `clearFailedCheckpointsForProbe()` returned `true`.
- The operation cleared the stale scheduler/cooldown state and global failure count, reset existing section failure counters/cursors to zero, and did not alter cached snapshot contents.
- The broker state immediately before and after was unchanged: interactive `0/24`, sync `5/6`, no refusal block. No provider network activity or provider-budget debit occurred.

### Stop condition

- No probe budget reset was invoked. The six-request ceiling was neither raised nor bypassed.
- The exact one approved physical verification run remains deferred until the next UTC sync-budget window provides all six debits, unless the user explicitly authorizes a different budget procedure.
- Gate 1 remains **rejected/pending**. Phase 2A remains **not started and not authorized**.

## 2026-08-02 — ReferenceError root cause, bundle boundary correction, and zero-provider physical publication proof

### Error identification

- The probe-only internal-fault policy was used to exercise the actual `replaceSectionSnapshots()` publication path with three synthetic VOD categories of 24 items each. The probe constructs no `ProviderBroker` or `XtreamClient` and issues no provider request.
- The original physical diagnostic package captured the previously sanitized fault as:
  - `ReferenceError: Cannot access 'i' before initialization`;
  - publication stages reached `snapshot-plan`, `snapshot-write`, `manifest-build`, `manifest-put`, and `cleanup`, but not `complete`.
- Source-map resolution of the first captured frame identified `node_modules/dashjs/dist/modern/esm/dash.all.min.js`, not the catalog repository, broker, transport, or client.
- The permanent relative-import graph gate was added and passed. It reported no runtime cycles, ruling out the proposed `provider-broker.ts` ↔ `xtream-client.ts` temporal-dead-zone hypothesis.
- After Dash.js isolation, the synthetic physical path surfaced a second independently mapped TDZ from `node_modules/hls.js/dist/hls.mjs`. The final residual physical TDZ mapped into the minified application IIFE's coroutine-local publication bindings.
- The failure was therefore not a missing `structuredClone`/new-global issue, provider failure, provider budget issue, or a relative source import cycle.

### Corrective implementation

- Added probe-only safe internal diagnostics:
  - provider/network errors remain fully sanitized;
  - probe-enabled builds may expose bounded local application fault type, message, and up to three safe file/line/column frames;
  - URL-like and credential-assignment fragments are redacted.
- Added the synthetic no-provider `publication.run()` probe and regression test. It verifies the exact repository path reaches all six stages:
  `snapshot-plan`, `snapshot-write`, `manifest-build`, `manifest-put`, `cleanup`, and `complete`.
- Isolated all browser media engines from the application IIFE:
  - Dash.js uses the separately packaged legacy UMD `dash.all.min.js`;
  - Hls.js uses separately packaged `hls.min.js`;
  - MPEG-TS uses separately packaged `mpegts.js`;
  - `src/dash-player.ts` and `src/media-engines.ts` access only typed globals exposed by those scripts.
- The output `index.html` loads those assets before `app.js`. The Vite build copies each asset reproducibly from `node_modules`.
- The build now rejects any Dash.js, Hls.js, or MPEG-TS module detected inside the application IIFE and the output checker verifies all three standalone assets, their ordering, their expected global markers, and the generated build metadata.
- The initial media isolation removed the library-origin TDZs but did not eliminate the final TDZ in the minified app IIFE. The remaining physical fault was resolved by retaining the ES2015 application IIFE **unminified** (`build.minify = false`). This avoids the legacy webOS Chromium minifier/runtime interaction while preserving the ES2015 syntax target. Media-engine UMD assets remain their upstream minified distributions.
- The whole-section synthetic publication path also no longer carries unused `onSnapshotPut` timing callback bindings. Production sync instrumentation still exists where it is consumed; the no-provider whole-section publication probe uses only publication-stage callbacks.

### Automated and bundle evidence

| Command | Result | Notes |
| --- | --- | --- |
| `rtk npx tsc --noEmit` | Passed | No TypeScript diagnostics. |
| `rtk npx vitest run src/library/publication-probe.test.ts src/library/catalog-repository.test.ts src/library/flat-snapshot-probe.test.ts` | Passed | 26 tests, including the 30,000-item/300-category fixture and 1,055-snapshot atomicity proof. |
| `rtk npm test -- --run` | Passed | 31 files, 235 tests. Expected mocked metadata upstream-503 output remains non-failing. |
| `rtk npm run build` | Passed | 33 runtime source modules have no relative import cycle. The bundle guard verified the ES2015 app IIFE has no prohibited globals and all three media engines are standalone assets. |
| Probe-enabled `npm run package:webos` | Passed | Produced `com.arash.novaplay_1.0.12_all.ipk`. |

### Physical corrected-bundle proof

- Target: `OLED55G1RLA`, alias `lg-oled-g1`, webOS SDK 6.5.3.
- Installed and launched probe-enabled package `com.arash.novaplay` version `1.0.12`.
- CDP executed `catalogSync.cancel()` followed by `window.__NOVA_LIBRARY_PROBE__.publication.run({ categoryCount: 3, itemsPerCategory: 24 })`.
- Result:
  - `success=true`;
  - `publishedCategoryCount=3`;
  - publication stages: `snapshot-plan`, `snapshot-write`, `manifest-build`, `manifest-put`, `cleanup`, `complete`;
  - no `fault` field.
- This proof executed the physical packaged IIFE and the real local repository publication path. It did not construct a provider client or use provider/network traffic.
- The subsequent broker inspection reported `interactive 0/24`, `sync 6/6`, and `block=null` in the active UTC window. The publication proof used no provider debit; no budget reset, ceiling change, or refusal-state mutation was performed.

### Source-control and gate decision

- Baseline corrective-work checkpoint before this change set: `05ca1e2` (`feat: add local catalog cache and sync foundation`).
- The physical ReferenceError diagnosis and corrective bundle work are committed in `790d70e` (`fix: isolate webos publication runtime faults`).
- Gate 1 remains **rejected/pending**: this entry proves the local post-scan publication path, not all-three-section authoritative provider synchronization.
- Phase 2A remains **not started and not authorized**.
- The next provider action remains exactly one separately approved serial Gate 1 sync in a future UTC window with all six sync debits available. No provider request is authorized before that condition is met.

## 2026-08-02 — Sync-debit diagnosis, bounded playback verification, and compatibility guidance correction

### Unexplained sync-debit diagnosis and correction

- The apparent unexplained transition from sync `5/6` to `6/6` was traced to the automatic catalog scheduler. On launch/relaunch, a due coordinator run was scheduled after its 10-second idle delay. With only one sync debit remaining, it issued the first category-manifest request, consumed that final debit, and could not complete the remaining five fixed request slots.
- This was a real provider request caused by the scheduled partial run; it was not caused by the local publication probe, device installation, DevTools inspection, counter inspection, or any budget reset.
- The corrective policy is now explicit:
  - `CatalogSyncCoordinator` asks the real broker for a six-slot preflight before beginning a normal scheduled run.
  - A run with fewer than all six available sync debits returns `deferred`, has `requestCount=0`, and does not create a sync lease, mutate catalog state, or issue provider traffic.
  - Broker accounting now debits only at the actual `XtreamClient` transport-handoff boundary. A pre-aborted request, a persisted refusal, an exhausted budget, or a synchronous transport setup failure consumes no debit.
- Regressions cover pre-aborted work, blocked work, cooled-down coordinator work, transport failure before a request handoff, a five-of-six partial preflight, and a full completed run followed by a zero-request cooldown call.
- Automated evidence after this correction:
  - targeted broker/coordinator/client suite: 48 tests passed;
  - full suite: 31 files, 239 tests passed;
  - build/package checks: 33 runtime source modules have no relative import cycles; the ES2015 IIFE and standalone-media bundle checks passed.
- Probe-enabled package `com.arash.novaplay` `1.0.13` was installed on `OLED55G1RLA`. With the persisted counter at interactive `2/24`, sync `6/6`, and no refusal block, the probe cleared only stale local scheduler/checkpoint state and invoked a due run:
  - result: `deferred`, `requestCount=0`, and `nextDueAt` equal to the next UTC boundary;
  - counters before/after: unchanged at interactive `2/24`, sync `6/6`, block `null`;
  - no provider request, provider-budget debit, ceiling change, or refusal-state mutation occurred.
- This physically proves that a future relaunch cannot spend a lone final sync debit on an incomplete scheduled run.

### Playback verification scope and evidence

- Playback checks used only reversible local probe fixtures built from an already cached live item. The fixture changed only the in-memory persisted container-extension label for the selected local test, never recorded a provider URL/title in this report, and was restored afterward. No catalog-sync debit or provider acquisition was used.
- Existing native VOD/episode playback remained operational on the physical TV:
  - video reached `readyState=4` with a visible `1280×720` track and no media error;
  - pause held position exactly over the sampled interval;
  - resume advanced approximately 1.209 seconds over the next sample interval;
  - a 20-second seek landed at the exact requested position with no media error.
- HLS fallback was exercised with a deliberate first native-attempt error against the local HLS-labelled fixture:
  - the fallback reached a `blob:` MediaSource pipeline with a visible `1920×1080` track, advancing playback time, no media error, and hidden diagnostics;
  - this confirms the standalone Hls.js global, construction path, engine switch, and HLS playback path operate on the physical package.
- MPEG-TS capability is present on the device (`mseLivePlayback=true`), and a TS-labelled fixture played natively with a visible `1920×1080` track. A deliberate failure surfaced the `MPEG-TS · network` fallback diagnostic.
  - The external MPEG-TS engine constructor was not observed before the provider stream's later network failure, so this is **not** a physical pass for the MPEG-TS wrapper itself.
- No safe cached DASH/MPD candidate was available, and no hydrated multi-channel live queue was available without issuing an additional interactive catalog request. DASH wrapper playback and in-app channel switching are therefore **unverified**, not passed.
- The normal fallback chain, seek, pause, and resume have physical evidence above. HLS engine-switch evidence is accepted only for the tested fixture. DASH, MPEG-TS-wrapper, and channel-switch evidence remain open requirements for a future safe playback procedure.

### Startup observation

- A single physical navigation-timing sample from the standalone-media probe build recorded `domContentLoaded=936 ms` and `load=957 ms`.
- The initial Home render is synchronous in the application IIFE and was present by the completed load sample. This is recorded as the current single-sample time-to-stable-Home observation, not as a before/after performance comparison.
- The previously measured pre-boundary baseline is not available in the same instrumentation shape. Deferring unused media engines remains an available future optimization if a representative multi-sample regression is material; it was not implemented here.

### Corrected Dash.js/minifier guidance

- Historical entries that described the Dash.js `[COMMONJS_VARIABLE_IN_ESM]`/CommonJS-in-ESM warning as “non-blocking” are superseded. It was the diagnostic fingerprint of the physical temporal-dead-zone defect: the transformed Dash.js ESM initializer produced `ReferenceError: Cannot access 'i' before initialization` on the target webOS Chromium runtime.
- Do not dismiss that warning if the Dash.js module is ever reintroduced into the application IIFE. Treat it as a release blocker requiring physical legacy-webOS verification.
- The corrective boundary remains: Dash.js, Hls.js, and MPEG-TS load as separately packaged UMD scripts before the app IIFE; the build rejects their inclusion in `app.js`.
- **Known unresolved compatibility issue:** enabling minification for the ES2015 application IIFE recreates a physical TDZ failure in transformed coroutine-local publication code. The exact old-Chromium/minifier interaction remains unidentified. The tested workaround is `build.minify = false`; it preserves the ES2015 target and keeps upstream media UMD assets minified. Do not re-enable IIFE minification without a new physical synthetic-publication proof.

### Decision

- Debit diagnosis and no-partial-run enforcement: **accepted**.
- Physical HLS wrapper fallback, native seek/pause/resume, and local counter preflight evidence: **accepted within the stated test scope**.
- DASH wrapper, MPEG-TS wrapper, and live channel-switch verification: **pending**; no unverified engine may be claimed as passing.
- Gate 1: **rejected/pending**. The future approved serial provider sync still requires all six sync debits available, Live/VOD/Series authoritative completion, no failed checkpoint/cursor, and no snapshot-publication fault.
- Phase 2A remains **not started and not authorized**.

### Normal-package deployment closure

- The temporary probe-only build setting was removed after the bounded physical evidence was captured.
- A normal, non-probe `com.arash.novaplay` `1.0.13` package was rebuilt with the same ES2015 app/IIFE and standalone-media boundary checks, installed, and launched on `OLED55G1RLA`.
- Physical CDP verification returned `typeof window.__NOVA_LIBRARY_PROBE__ === "undefined"`.
- The development/probe surface is therefore absent from the installed normal package. The package remains on the corrected no-partial-run and standalone-media implementation.

## 2026-08-03 — Explicit Gate 1 arming, request-count reconciliation, and independent media-engine proof

### Gate 1 scheduler control

- The launch-time and deferred-boundary scheduler path that caused the earlier final-debit loss is now removed from normal operation:
  - application bootstrap no longer calls `scheduleCatalogSync()`;
  - profile activation and player exit no longer schedule a run;
  - `runCatalogSync()` no longer re-arms itself at `nextDueAt`;
  - the normal Settings view now exposes the explicit **Refresh downloaded library** action.
- A Gate 1 refresh therefore begins only after capture is already attached and an operator explicitly invokes the refresh action. Leaving the app running across a UTC rollover cannot autonomously consume a fresh six-request sync window.
- The old internal scheduling helper remains probe-only support; it is not called by normal application lifecycle paths.
- `catalogSyncRearmDelay()` imposes a 1,000 ms minimum retry delay for a due, past-due, or invalid deferred deadline. This prevents a zero-delay retry loop from repeatedly invoking the broker preflight and persisting state at the same instant.
- Regression coverage verifies a future deadline is preserved and that due/past/invalid deadlines receive the minimum delay. Source-level local-first regression coverage also rejects reintroduction of startup, profile-activation, or player-exit scheduling.

### Attempted versus issued/debited accounting

- `CatalogSyncResult.requestCount` is now explicitly the coordinator **attempted** count.
- `CatalogSyncResult.issuedRequestCount` is the broker-observed transport-handoff count for the run, or `null` for non-broker fixture providers that cannot observe handoffs.
- Each section carries the same two values as `attemptedRequestCount` and `issuedRequestCount`. Gate reporting must capture both values and the persisted sync-budget delta; they are separate evidence fields rather than interchangeable proof.
- The broker now retains an in-process issued counter that increments only beside the existing transport-handoff debit. A real completed run tested through the broker reported six attempts, six issued/debited requests, and two attempts/two issued requests for each of Live, VOD, and Series.
- A synchronous pre-handoff transport failure test reported three coordinator attempts, zero issued/debited requests, and zero persisted sync-budget use. This is the expected legitimate divergence: the coordinator tried each manifest call, but no provider request crossed the transport boundary.
- The fixed six-slot normal-run preflight remains deliberately conservative for checkpointed category-slice work. Computing a smaller future preflight from planned resume work is recorded as a later multi-day acquisition improvement, not part of this Gate 1 change.

### Physical normal-package and engine verification

- Normal package `com.arash.novaplay` `1.0.14` was built and installed on `OLED55G1RLA` with the standalone Dash.js/Hls.js/MPEG-TS boundary checks passing.
- Physical CDP inspection of the normal package confirmed:
  - `window.__NOVA_LIBRARY_PROBE__` is `undefined`;
  - the separately packaged Dash.js, MPEG-TS, and Hls.js globals resolve;
  - after launch and idle observation, persisted sync usage remained at its prior exhausted value of `6/6`; no automatic catalog run was armed or issued.
- DASH wrapper verification used a public, non-provider static H.264/AAC conformance MPD:
  - the Dash.js UMD global resolved as a function and constructed a player;
  - `STREAM_INITIALIZED` fired with no DASH error;
  - the visible MediaSource-backed track reached `320×180`, playback was unpaused, and time advanced to 5.8 seconds during the sample.
- MPEG-TS wrapper verification used a public, non-provider H.264/AAC TS fixture:
  - the MPEG-TS UMD global resolved and `createPlayer()` constructed successfully;
  - media information reported both video and audio with `avc1.64001f` and `mp4a.40.2`;
  - the MediaSource-backed video reached `readyState=4`, a visible `1280×720` track, and 10.02 seconds of playback with no engine error.
- Both temporary CDP fixture elements and player instances were destroyed and removed after their samples. These playback checks used no IPTV provider request and no catalog-sync budget.
- This supersedes the previous “wrapper unverified” status for DASH and MPEG-TS. In-app live channel switching remains deferred until after a successful Gate 1 download populates local live entries.

### Validation and decision

- Automated validation after these changes: full suite passed — 32 files and 243 tests.
- Production package validation passed:
  - TypeScript completed with no errors;
  - 34 runtime source modules have no relative import cycles;
  - standalone-media bundle checks passed;
  - normal `app.js` is 466.16 kB (103.45 kB gzip), with no prohibited post-ES2015 globals or media-engine imports in the app IIFE.
- Gate 1 prerequisites are now satisfied except for the separate future-window provider operation:
  1. wait for a fresh UTC sync window with `0/6` used and no refusal block;
  2. attach CDP/trace capture and record broker/storage baseline before any manual refresh;
  3. invoke exactly one manual **Refresh downloaded library** run;
  4. record per-section attempted, issued/debited, status, bytes, elapsed, parsed records, snapshots, item counts, coverage, checkpoints/cursors, and final persisted budget delta;
  5. confirm a follow-up call returns cooldown with zero attempted and zero issued requests.
- Gate 1 remains **pending**, not accepted. Phase 2A remains **blocked** until the one authorized serial run completes Live, VOD, and Series authoritatively with no residual failed checkpoint/cursor or snapshot-publication fault.

## 2026-08-03 — Single manual Gate 1 run: bounded VOD response rejected

### Controlled procedure and preflight

- Installed normal package `com.arash.novaplay` `1.0.15`, which contains the explicit manual-refresh control and sanitized per-section result tracing. The normal package continued to expose no library-probe surface.
- The app was closed through the UTC boundary and then launched only after the new window began. CDP capture and the existing performance trace were enabled before the operator navigated to Settings.
- Fresh-window preflight recorded:
  - sync budget `0/6` used;
  - no persisted refusal block;
  - current stored UTC window start matched the current UTC boundary;
  - the explicit **Refresh downloaded library** control was present.
- The trace was cleared immediately before invoking that control. Exactly one manual refresh was invoked. No provider-budget reset, limit change, checkpoint clearing, or auxiliary provider request occurred.

### Serialized provider and coordinator evidence

- The broker recorded exactly six background/sync handoff debits, progressing from `1/6` through `6/6`; no budget rejection, refusal recording, or provider block occurred.
- Each request was serialized. The three category manifests were followed by one whole-section scan for Live, VOD, and Series.
- Sanitized scan-terminal measurements:

| Section | HTTP | Header elapsed | Total elapsed | Bytes | Parsed records | Array closed | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Live | 200 | 274 ms | 13,156 ms | 18,070,388 | 52,209 | yes | complete |
| VOD | 200 | 5,061 ms | 58,795 ms | 67,122,387 | 164,074 | no — bounded read cancelled | failed: `too-large` |
| Series | 200 | 471 ms | 35,972 ms | 51,506,944 | 44,684 | yes | complete |

- VOD exceeded the configured strict catalog response ceiling of 64 MiB by a small amount. The client correctly aborted the bounded read, classified the condition as `too-large`, and did not publish a partial VOD catalog. This is a provider-payload-size limit, not a refusal, timeout, parser-closure acceptance, or local publication failure.
- Coordinator result:
  - `status=failed`;
  - attempted requests `6`;
  - issued/debited requests `6`;
  - Live: whole-section success, attempted `2`, issued `2`;
  - VOD: whole-section `scan-failed`, attempted `2`, issued `2`;
  - Series: whole-section success, attempted `2`, issued `2`.
- The persisted broker state after the run was interactive `4/24`, sync `6/6`, with no refusal block. The interactive count is reported separately and is not part of Gate 1 sync accounting.

### Published-state and cooldown evidence

- Persisted catalog state after the run:
  - Live: coverage `complete`; 823 manifest categories; 825 active snapshots; 52,209 items; checkpoint failure count `0`; success timestamp present.
  - Series: coverage `complete`; 231 manifest categories; 231 active snapshots; 44,684 items; checkpoint failure count `0`; success timestamp present.
  - VOD: coverage `none`; 362 manifest categories; zero active snapshots/items; checkpoint failure count `1`; no success timestamp.
  - Global sync state: `inProgress=false`, `failureCount=1`, and a six-hour failure cooldown deadline.
- The one permitted follow-up manual invocation returned `cooldown` with attempted requests `0` and issued requests `0`. The persisted sync counter remained `6/6`; no extra provider debit occurred.

### Decision and next step

- Request accounting, serialization, fixed-six preflight, issued-versus-attempted reconciliation, section-level tracing, and zero-request cooldown behavior are **accepted**.
- Gate 1 is **rejected**. Live and Series are authoritative, but VOD is not authoritative because its whole-section response exceeded the established 64 MiB safety ceiling.
- Phase 2A remains **blocked**. Do not treat the two successful sections as an accepted all-library cutover.
- The next task is not another provider run. It requires a separately approved bounded VOD acquisition design that preserves strict completeness, bounded memory/work, cache authority, and the no-partial-publication rule (for example, a proven section-safe continuation strategy or a sufficiently bounded provider-supported acquisition path). No budget increase or repeated same-window run is authorized by this result.

## 2026-08-03 — Authorized VOD measurement, bounded publication, and Live/Series local-read implementation

### Supersession and authorization

- This entry records the subsequently authorized same-day VOD-only iteration. It supersedes the preceding prohibition on a same-day retry, but only for the controlled single-section measurement described below.
- The provider refusal boundary remains absolute: a 401, 403, 429, or Retry-After would have ended the day without a counter reset or retry. No such response or block occurred.
- The probe-only counter reset was used only after confirming the persisted provider block was null. It reset interactive and sync counters; it did not clear a refusal block, Retry-After, catalog state, or cooldown metadata.

### Physical VOD measurement

- A probe-enabled `com.arash.novaplay` `1.0.17` measurement package was installed on `OLED55G1RLA` through `lg-oled-g1`. The probe surface was used solely for budget inspection/reset; the physical acquisition itself was invoked through the rendered Settings control **Measure VOD download**.
- Pre-run provider state was:
  - interactive `5/24`;
  - sync `6/6`;
  - refusal block `null`.
- The reset result and immediate re-inspection were:
  - interactive `0/24`;
  - sync `0/6`;
  - refusal block still `null`.
- CDP capture and the normal performance trace were enabled and cleared before the single manual VOD action. The control was confirmed present before it was invoked exactly once.
- The action used a one-request VOD-only plan based on the existing successful VOD category manifest. It did not request Live categories/streams, Series categories/streams, or the VOD category manifest.
- Sanitized provider and completion evidence:
  - HTTP `200`;
  - header elapsed `4,767 ms`;
  - total elapsed `71,541 ms`;
  - received `79,696,256` bytes;
  - parsed `194,302` records;
  - strict top-level array closure `true`;
  - no timeout;
  - no failure classification;
  - coordinator attempted requests `1`;
  - broker issued/debited requests `1`;
  - final sync budget `1/6`;
  - refusal block `null`.
- The completed VOD section published 363 manifest categories, 430 active snapshots, and 194,302 active items. Global sync failure count reset to zero and the ordinary success cooldown was persisted.
- The device exposes a fixed placeholder `performance.memory.usedJSHeapSize` of `10,000,000`, unchanged at initial, sampled peak, and final observation. It is not a usable heap measurement. No heap-growth claim is made. The measured catalog completed without an observed app crash, provider error, or parse/publication failure.

### Production response bound

- The temporary 192 MiB discovery ceiling is not retained as the production setting.
- The normal VOD sync scan now uses a bounded 96 MiB limit (`100,663,296` bytes):
  - the measured complete response is `79,696,256` bytes;
  - the selected production bound leaves `20,967,040` bytes of headroom;
  - it remains strictly bounded and is substantially below the temporary 192 MiB discovery ceiling.
- Live and Series retain their existing default bounded response behavior. No provider limit or broker budget ceiling was increased.

### Incremental publication and restart safety

- Whole-section ingestion now applies backpressure from the snapshot publisher to the incremental parser.
- For a section without authoritative complete coverage, parser-confirmed records are accumulated in bounded 128-item category batches and persisted as explicit `partial` category generations.
- Partial generations are deliberately unavailable to normal browse/search reads. Only a closed top-level provider array promotes every category generation to `complete` in a final manifest transition.
- A malformed, timed-out, cancelled, oversized, or interrupted response therefore:
  - retains only parser-confirmed partial snapshots;
  - leaves the section non-authoritative for ordinary reads;
  - persists `partial` coverage and the first incomplete category cursor;
  - resumes recovery at that incomplete category in the later category-slice path;
  - never presents incomplete data as an empty catalog or as complete local search coverage.
- Regression coverage includes an interrupted VOD first scan that persists a partial batch, records a partial checkpoint at cursor zero, and resumes that first incomplete category rather than issuing another whole VOD scan. Repository coverage verifies partial snapshots cannot be read as complete until a strict closed-array promotion succeeds.

### Local read cutover scope

- Local-first category browse and global search now use only complete per-section IndexedDB snapshots:
  - Live and Series complete manifests are read through bounded category-shard reads;
  - global search queries each complete section locally and performs no provider search;
  - VOD explicitly renders **Library not downloaded yet** until it is complete, never **No results**.
- The local-read repository refuses an incomplete section, a partial category, an evicted snapshot, or an unavailable database as cache-unavailable rather than treating any of those states as an empty authoritative result.
- This is a narrow two-section local-read cutover. It does not approve a provider-backed metadata/details redesign, global Phase 2B acceptance, or any additional VOD provider request.

### Automated verification

| Command | Result | Notes |
| --- | --- | --- |
| `rtk npx tsc --noEmit` | Passed | No TypeScript diagnostics after the local-read and publication changes. |
| `rtk npm test -- --run src/library/catalog-repository.test.ts src/library/catalog-sync.test.ts src/local-first-regression.test.ts` | Passed | 39 tests; includes durable partial publication, incomplete-section resume, authoritative local reads, and no-provider browse/search routing. |
| Further package/device verification | Pending | Required after the final normal package is built; no additional provider acquisition is authorized for that verification. |

### Decision

- The VOD measurement is **accepted**: the prior failure was solely the self-imposed 64 MiB limit, not a provider refusal, timeout, parser failure, or rate limit.
- The 96 MiB production VOD bound is **accepted** for the measured provider response.
- Incremental partial publication is **implemented and fixture-verified**, pending final normal-package physical verification.
- Live/Series local-read cutover is **implemented and fixture-verified**, pending final normal-package physical verification.
- VOD is now complete from the one authorized measurement run; no further same-day VOD request is authorized by this entry.
- Gate 1 all-section completeness is now physically demonstrated, but the Gate/Phase 2A final decision remains **pending** until the final normal package verifies the local browse/search paths on the physical target without provider traffic.

## 2026-08-03 — Local-search compatibility diagnosis and corrective package

### Local-only physical diagnosis

- Normal package `1.0.21` was installed and inspected on the physical target. It exposed no library-probe API.
- A non-matching local global-search request made **zero** provider/network trace events, but incorrectly rendered every section as unavailable.
- Sanitized repository outcome tracing isolated the result to `snapshot-invalid`, not missing manifests, incomplete section coverage, absent snapshots, provider traffic, or response-size limits:
  - Live: expected `825` snapshot records; parsing stopped after `60` accepted records.
  - VOD: expected `430` snapshot records; parsing stopped before an accepted record.
  - Series: expected `231` snapshot records; parsing stopped after `52` accepted records.
- Independent device-side storage validation confirmed all current manifest-referenced snapshot records were present with matching active generations. No catalog titles, queries, payloads, credentials, or URLs were retained in this report.

### Root cause and correction

- Prior URL sanitization recursively removed any URL-like string from cached stream records. Some valid provider display names matched that broad URL-like pattern, causing legacy durable records to lack `name`.
- The strict local reader then treated any such record as a corrupt shard, which incorrectly made an otherwise complete section unavailable.
- The corrected repository behavior:
  - preserves required stream identity and display/search fields when producing new cached snapshots;
  - safely reads legacy records with missing display names as an `Untitled` local item while retaining the validated identity, section, and category fields;
  - continues to reject records lacking required identity/section/category invariants;
  - keeps direct playback URLs and nested URL-bearing optional metadata out of durable catalog snapshots.
- A regression test mutates a durable snapshot into this legacy sanitized shape and verifies both bounded category read and local search remain complete. This test does not weaken detection of malformed identity records.

### Verification and remaining physical step

| Command | Result | Notes |
| --- | --- | --- |
| `rtk npx tsc --noEmit` | Passed | No TypeScript diagnostics. |
| `rtk npm test -- --run src/library/catalog-repository.test.ts src/local-first-regression.test.ts` | Passed | 25 tests, including the new legacy-snapshot compatibility regression. |
| `rtk npm test` | Passed | 32 files, 249 tests. Existing mocked metadata-upstream `503` messages remain expected test diagnostics. |
| `rtk git diff --check` | Passed | No whitespace errors. |
| `rtk npm run package:webos` | Passed | Normal package `1.0.22` produced; TypeScript, import-cycle, webOS compatibility, and standalone-media checks passed. |

- `1.0.22` is the normal corrective package; it has not been physically installed because the physical target became unreachable after the preceding local-only diagnostic. Two install attempts and ICMP reachability checks timed out.
- No provider request, provider retry, provider reset, category refresh, section scan, or provider-backed search was performed after the successful VOD measurement.
- Required remaining verification once the target is reachable:
  1. install and launch normal package `1.0.22`;
  2. confirm the probe API remains absent;
  3. run a non-match local search and confirm each complete section reports authoritative availability and no-match state, with zero provider/network trace events;
  4. confirm one sanitized aggregate positive-result count locally, without recording title/query content;
  5. rerun category browse checks with zero provider/network trace events.

### Decision

- Local-search availability defect: **diagnosed and corrected**.
- Automated verification: **accepted**.
- Physical `1.0.22` local browse/search verification: **pending** because the target is currently unreachable.
- Gate 1 / Phase 2A acceptance remains **pending**. No additional provider acquisition is authorized.

## 2026-08-03 — Normal-package local-read verification on OLED55G1RLA

### Deployment and normal-package boundary

- After the physical target became reachable again, normal package `com.arash.novaplay` `1.0.22` was installed and launched on `OLED55G1RLA` through `lg-oled-g1`.
- CDP verified `typeof window.__NOVA_LIBRARY_PROBE__ === "undefined"`. The production package exposes no probe API.
- This verification used existing IndexedDB catalog state only. It did not invoke Refresh, Measure VOD download, category acquisition, a provider retry, a budget reset, or a provider-backed search.

### Authoritative local global search

- A deliberately non-matching local search completed with all three sections authoritative:
  - Live: expected/seen snapshots `825/825`;
  - VOD: expected/seen snapshots `430/430`;
  - Series: expected/seen snapshots `231/231`.
- The UI rendered each section as **No matching titles**, not **Library not downloaded yet**.
- Sanitized local full-section scan elapsed measurements were:
  - Live: `16,285.93 ms`;
  - VOD: `37,712.35 ms`;
  - Series: `13,753.96 ms`.
- A positive local search was then verified as an aggregate only:
  - `28` rendered local result cards;
  - all three sections again reported complete expected/seen snapshot coverage;
  - the unavailable copy was absent.
- Across the non-match and positive-search checks, performance tracing recorded zero `network` events. No title or query content is retained in this record.

### Local browse verification

- Live browse rendered `24` category cards, then `24` stream cards after opening a local category; provider/network events: `0`.
- Series browse rendered `24` category cards and `24` stream cards after opening a local category; provider/network events: `0`.
- VOD browse rendered `24` category cards and `24` stream cards after opening a local category; provider/network events: `0`.
- The VOD result confirms the completed measured VOD cache is now presented through the same authoritative local browse path. It does not perform a new provider VOD request.

### Decision

- Normal-package local browse and global search verification: **accepted**.
- Local-read availability correction: **physically accepted**.
- All three stored sections were physically read as complete with zero observed provider/network events during the verified local flows.
- Gate 1: **accepted**. The authoritative acquisition evidence, measured VOD bound, incremental-publication/restart behavior, and normal-package local-read verification are complete.
- Phase 2A local category browse cutover: **accepted** for Live, VOD, and Series.
- The verified global-search route is local-only and authoritative for the three complete sections. This does not independently accept any later hybrid-search, metadata, identity, or service phase.
- No additional provider acquisition is authorized by this verification.

## 2026-08-03 — Post-cutover local-search defect correction and extended local-read verification

### Settlement boundary

- Gate 1 and the Phase 2A all-section local-read cutover remain **accepted and settled**. This entry records only post-cutover local defects and their local-only remediation; it does not reopen the successful VOD acquisition, the accepted 96 MiB production bound, or the prior zero-provider browse/search result.
- No provider request, reset, acquisition, category refresh, or provider-backed search was issued during this work.

### Defect and derived-index implementation

- The accepted all-section local scan had a measured global-search baseline of `67,752 ms`. Its query path parsed all `1,486` current snapshot shards, so it was not shippable despite being provider-free.
- Search is now a versioned, derived local artifact:
  - `searchIndexMeta` requires `coverage=complete`, the current index format, and the exact active `SectionManifestRecord.updatedAt` generation before a section can be searched;
  - compact `searchIndexShards` are keyed by profile, section, generation, folded token prefix, and shard index;
  - each posting contains only the category/shard/item coordinates, snapshot generation, opaque stream key, and folded display value required for filtering/ranking;
  - query reads the rarest applicable two- or three-character folded prefix posting shards, applies the shared `foldText`, `queryTokens`, and `matchesQuery` logic, and resolves full snapshot records lazily only for visible results;
  - corrupted, missing, or stale derived data reports `index-unavailable`/`index-invalid`; a user query never starts a whole-catalog scan fallback;
  - progressive result callbacks emit after bounded match batches, allowing the rendered section to paint while remaining sections resolve.
- Ingestion rebuilds the affected section index only after strict snapshot publication. Startup/profile activation performs the local migration for legacy current snapshots.
- An already complete generation-matched index now returns its existing metadata without rebuilding. A regression corrupts the source snapshot after a successful build and proves that the current derived index is reused rather than rescanned; a later snapshot-generation change still invalidates it.
- The webOS migration was hardened after physical observation:
  - packed prefix shards replaced the rejected per-item IndexedDB index-write design;
  - up to 32 packed shard records are committed per transaction;
  - stale generation records are inert by key design and are not cursor-deleted before a rebuild;
  - empty pending-prefix buffers are excluded from forced draining.

### Physical migration and Untitled audit

- Normal package: `com.arash.novaplay` `1.0.22` on `OLED55G1RLA` / webOS `6.5.3`.
- A fresh serial local migration over the existing authoritative snapshots completed before the final reuse-enabled package was installed. Its observed completion sequence was approximately `5m17s` from launch to final section publication: Live approximately `49s`, VOD approximately `3m29s`, and Series approximately `59s`. This is migration cost only; it used no provider transport.
- The final package then relaunched against the same generation-matched metadata without rebuilding any index.
- `Untitled` values below are the conservative legacy data-loss measure: raw stored records whose `name` field was absent before the compatibility reader substituted readable `Untitled` text. They are not a count of literal provider titles named `Untitled`.

| Section | Authoritative items | Legacy missing-name / Untitled count | Share |
| --- | ---: | ---: | ---: |
| Live | 52,209 | 686 | 1.314% |
| VOD | 194,302 | 107 | 0.055% |
| Series | 44,684 | 4 | 0.009% |
| Total | 291,195 | 797 | 0.274% |

- All three index metadata records were physically complete and generation-matched to their active manifests. Aggregate posting counts were 266,810 (Live), 931,956 (VOD), and 182,012 (Series).
- The Live percentage is material enough to be reported as a legacy snapshot-quality limitation. No corrected re-acquisition was performed or authorized.

### Indexed local-search measurement

- Five physical all-section indexed local searches were measured without retaining query text or titles.
- The search result set was bounded to the existing 60-result per-section limit; progressive rendering displayed the initial visible cards while later section work continued.
- Aggregate measurements:

| Metric | Measurement | Comparison with 67,752 ms scan baseline |
| --- | ---: | ---: |
| Search completion p50 | 6,948 ms | 89.7% lower; 9.75× faster |
| Search completion p95 | 7,320 ms | 89.2% lower; 9.26× faster |
| First visible progressive result p50 | 504 ms | Below one second |
| First visible progressive result p95 | 624 ms | Below one second |

- CDP Network capture recorded zero network requests during each measured search. No search text, title, URL, provider payload, credential, or exported trace is retained here.

### Extended local browse verification

The final normal package was verified using only the existing local catalog, local favorites, and browser/device-local state. CDP Network capture recorded **zero network requests** throughout the final sequence.

| Local interaction | Sanitized evidence | Latency |
| --- | --- | ---: |
| Open VOD category library | First local 24-category page rendered | 193 ms |
| Page beyond the first VOD category page | Page 2 of 16 rendered | 194 ms |
| Open largest VOD category | 6,423 local items across 6 bounded snapshots; first local 24-card page rendered | 2,716 ms |
| Sort the large category | Sort transitioned to A–Z | 574 ms |
| Toggle a favorite | Local favorite state updated | 167 ms |
| Back navigation | Returned to the VOD category page | 302 ms |
| Open Favorites | Local Favorites view rendered with saved cards | 373 ms |

- A pre-final verification exposed one non-provider image request when Favorites rendered remote artwork. Local catalog/search/favorites presentation now suppresses remote artwork URLs and uses the existing text/monogram placeholder instead. The final repeated sequence above had zero CDP network events, including Favorites.
- This guard affects only local library presentation (`catalog` and `search`); detail/playback flows retain their existing explicitly selected-media behavior.

### Automated verification

| Command | Result | Notes |
| --- | --- | --- |
| `rtk npx tsc --noEmit` | Passed | No TypeScript diagnostics. |
| `rtk npx vitest run src/library/catalog-repository.test.ts src/library/catalog-sync.test.ts` | Passed | 37 tests, including current-generation index reuse. |
| `rtk npm test` | Passed | 32 files, 250 tests. Mocked metadata-upstream 503 output remains expected test diagnostics. |
| `rtk npm run package:webos` | Passed | Normal `1.0.22` package; import-cycle, ES2015, standalone-media, and webOS bundle checks passed. |
| `rtk git diff --check` | Passed | No whitespace errors. |

### Files changed

- `src/library/catalog-repository.ts`
- `src/library/catalog-repository.test.ts`
- `src/library/catalog-sync.ts`
- `src/main.ts`
- `LIBRARY_ENGINE_STATUS.md`

### Rollback and decision

- The index is rebuildable from authoritative snapshots. Removing index metadata/shards, or rolling back to the prior package, never deletes catalog snapshots, profiles, favorites, or resume state. Until a valid current index exists, search truthfully reports unavailable rather than falling back to the rejected full scan.
- The local artwork guard rolls back independently by restoring presentation of remote artwork; the final zero-network local-flow requirement is the reason it remains enabled.
- Post-cutover search defect: **corrected and physically accepted**.
- Untitled audit: **recorded**; no re-acquisition authorized.
- Extended local browse verification: **accepted**.
- Gate 1 and Phase 2A: **remain accepted**.

## 2026-08-04 — Post-cutover search coverage and local-read performance defects

### Settlement boundary

- Gate 1 and Phase 2A remain accepted and settled.
- This entry records local implementation and verification only. No provider acquisition, category refresh, provider-backed search, budget reset, or re-acquisition was triggered during the migration, measurement, or TV checks.

### Defect 1: non-Latin title indexing

- **Regression:** v1 prefix creation used the ASCII-only `/[a-z0-9]{2,}/g` whitelist while full-scan matching accepted arbitrary scripts. A Cyrillic, Arabic, CJK, or other non-Latin title could therefore be browsable but absent from indexed search.
- **Correction:** `src/search.ts` now owns shared `searchTokens()`: explicit Latin-diacritic folding followed by Unicode letter/number token extraction (`/[\p{L}\p{N}]+/gu`). `queryTokens()` and repository index construction both derive from it, preventing index/query tokenizer drift. Prefix slicing uses `Array.from()` and is code-point based.
- `SEARCH_INDEX_FORMAT_VERSION` is now **3**. Physical v2 testing established that storing every one-, two-, and three-character prefix had an unacceptable VOD migration/storage footprint. The v3 index stores one compact two- or three-character leading prefix per token, remains generation-bound and rebuildable from authoritative local snapshots, and migrated locally on `lg-oled-g1` without a provider request.
- **Known limitation:** global search intentionally retains `MIN_GLOBAL_SEARCH_LENGTH = 2`; one-character queries, including a one-character CJK query, return no v3 index result. This preserves the bounded v3 migration footprint.

#### Pre-migration v1 zero-prefix audit

| Section | Items | v1 zero-prefix items | Share |
| --- | ---: | ---: | ---: |
| Live | 52,209 | 1 | 0.0019% |
| VOD | 194,302 | 13 | 0.0067% |
| Series | 44,684 | 0 | 0.0000% |
| **Total** | **291,195** | **14** | **0.0048%** |

- The counts were read from the physical device's stored local snapshots using the retired v1 tokenizer before the v3 writer replaced its shards. `SearchIndexMetaRecord.preMigrationZeroPrefixCount` retains this impact for migration/audit tracing.

#### Regression coverage

- `src/search.test.ts` verifies punctuation-separated Unicode tokens and preservation of Cyrillic, Arabic, and CJK content.
- `src/library/catalog-repository.test.ts` verifies Cyrillic, Arabic, and CJK retrieval through the v3 index, checks the synthetic v1 zero-prefix impact, and records the one-character CJK limitation.
- A separate regression covers result reconstruction across multiple authoritative snapshot shards in posting order.

### Defect 2: serial IndexedDB search/category reads

- `readSearchIndexPostings()` uses one readonly transaction and a bounded shard cursor rather than one transaction per posting shard.
- `readSearchIndexPostingStreams()` validates matched postings, queues all visible authoritative snapshot-shard reads synchronously in **one** readonly transaction, awaits them only after scheduling, parses each shard once, and reconstructs validated posting order. It replaces serial per-card snapshot resolution.
- Complete-category reads use one bounded snapshot cursor transaction. `readCompleteCategoryPage()` returns only the visible page; normal category open and paging use it, while local filtering/sorting explicitly invokes the full-materialization path only when necessary.
- The implementation schedules IndexedDB requests before awaiting, avoiding the webOS transaction auto-commit failure mode. Tests cover a 3,100-item page read (items 48–71 for page 3) and multi-shard search resolution.

### Scheduled writer and Live-count boundary

- Ordinary scheduled sync uses the same `CatalogSyncCoordinator` repository publication/writer path as the corrected local migration; no separate legacy scheduled index writer was found.
- Live acquisition reported 53,913 records while the audited stored Live snapshot has 52,209. The application code does not establish that this 1,704-record delta was caused by local parse, deduplication, or persistence loss. It is recorded as an upstream/acquisition-snapshot delta unless a response-level acquisition comparison proves a local transformation cause.

### Physical local-only verification on `lg-oled-g1`

#### Search and category measurements

Five semantically equivalent `the` searches were measured after deployment. First-visible timing is approximate because it used 10 ms polling.

| Flow | Previous accepted baseline | Post-fix physical result | Status |
| --- | ---: | ---: | --- |
| Search completion p50 | 6,948 ms | 2,401.810 ms | **Meets** baseline |
| Search completion p95 | 7,320 ms | 2,793.980 ms | **Meets** baseline |
| First visible result p50 | 504 ms | 804.205 ms | **Does not meet** baseline |
| First visible result p95 | 624 ms | 1,040.975 ms | **Does not meet** baseline |
| Largest VOD category open | 2,716 ms | 405.32 ms | **Meets** baseline |

- Completion samples (ms): 2,793.980; 2,401.810; 2,183.400; 2,302.130; 2,470.220.
- First-visible samples (ms): 1,040.975; 804.205; 624.270; 769.455; 851.480.
- The largest local VOD category was `865` (`|DE| FILME 1990-2023`), with 6,423 items. Its default visible page rendered 24 cards in 405.32 ms without provider traffic.
- The corrected batched authoritative-result resolver replaced the pre-batched completion sample of 7,138.91 ms. Search completion is now accepted against the prior threshold; first-visible responsiveness remains an open performance item.

#### Progressive D-pad and safe OK-equivalent verification

- A clean physical query cycle cleared old cards, submitted a fresh `the~~` query, waited for an actual incremental result, focused `live:stream:1538804`, and dispatched `ArrowDown`.
- Focus moved to the connected `live:stream:902907` stream-selection button, remained the **same connected DOM node** after final status (`180 local results`), and did not fall back to the search input or a stale wrapper.
- A capturing, prevented click was then dispatched to that focused node. It observed `{ action: 'select-stream', streamKey: 'live:stream:902907' }`; playback/navigation was intentionally prevented. This confirms the OK-equivalent target matches the highlighted result.
- The correction is to keep final global-search status rendering incremental (`fullResults: false`) rather than replacing all result wrappers after the final section completes. This resolves the previously observed physical focus-loss regression.

### Automated verification

| Command | Result | Notes |
| --- | --- | --- |
| `rtk npm exec tsc -- --noEmit` | Passed | No TypeScript diagnostics. |
| `rtk npm test` | Passed | 32 files, 255 tests. Expected mocked upstream 503 diagnostics remain in metadata-worker tests. |
| `rtk npm run package:webos` | Passed | Final package build produced `com.arash.novaplay_1.0.22_all.ipk`; TypeScript, import-cycle, ES2015, standalone-media, worker, and webOS package checks passed. |
| `rtk git diff --check` | Passed | Final report has no whitespace errors; temporary CDP helpers were removed before the check. |

### Decision

- Non-Latin indexed-search coverage and transaction-bounded search/category reads are corrected, covered by regression tests, and deployed through the normal local writer path.
- The v1 zero-prefix audit is complete: 14 of 291,195 items (0.0048%).
- One-character global search is a documented v3 limitation, deliberately retained to keep the local migration/storage cost bounded.
- Search completion and largest-category-open acceptance baselines are met; first-visible p50/p95 are not met and remain explicitly open.
- D-pad progression and safe OK-equivalent targeting are physically accepted on `lg-oled-g1`.
- Gate 1 and Phase 2A remain accepted. This post-cutover work performed local-only migration and verification; it does not authorize provider re-acquisition.

## 2026-08-04 — Local Guide, durable interactive cache, and eviction-recovery follow-up

### Implemented local-read boundaries

- The Guide now reads its Live category selector, selected-category channel page, category changes, and page navigation through `IndexedDbCatalogRepository.readCompleteSectionCategories()` and `readCompleteCategoryPage()`. It no longer calls the provider's Live category or stream-list endpoints. Programme data remains the only Guide-related provider surface on a cache miss.
- Details are now profile-scoped durable read-through records: Series and VOD details are read first from IndexedDB and cached for 12 hours after an interactive miss. Detail cache writing uses the existing URL sanitization path, so direct/playback URLs and URL-like durable metadata are excluded; playback URLs remain generated only at play time.
- Programme cache records are now independently keyed by profile, stream, and projection kind:
  - `now-next`: five-minute TTL;
  - schedule: fifteen-minute TTL;
  - catch-up schedule: fifteen-minute TTL.
  The database schema advances to version 5 solely to recreate this disposable EPG cache store with the additional key field. `Date` programme boundaries are retained during sanitization.
- Account validation has no module-scope or launch-time call. Login, profile switching, and the explicit Refresh account action remain the only validation paths. The latest successful `AccountSummary` is persisted in local catalog metadata and Home renders it with an `As of` timestamp without initiating validation.

### Storage pressure and recovery behavior

- Added deterministic rebuildable-cache pruning in this order: EPG records, details records, search-index metadata/shards (and retired search shards), then only snapshot shards not referenced by an active manifest.
- The active catalog manifests and their referenced snapshots are not pruned. Profiles, settings, favorites, and resume state remain outside this IndexedDB database in their existing localStorage ownership boundary.
- Missing catalog data continues to resolve to explicit downloaded-library-unavailable UI states rather than a false “No results” claim. Browse, Guide, and global search do not fall back to provider catalog reads.
- A development/probe-only `catalogSync.simulateEviction()` now deletes and reopens the library database while clearing in-memory projections. It does not call the provider and is intended to verify clean unavailable states before an explicit subsequent Refresh library rebuild.

### Automated verification

| Command | Result | Notes |
| --- | --- | --- |
| `rtk npm exec tsc -- --noEmit` | Passed | Final TypeScript validation after the follow-up implementation. |
| `rtk npm test` | Passed | 32 files, 259 tests; expected mocked metadata 503 diagnostics remain non-failing output. |
| `rtk npm run package:webos` | Passed | ES2015, import-cycle, standalone-media, worker, and package checks passed; produced `com.arash.novaplay_1.0.22_all.ipk`. |
| `rtk git diff --check` | Passed | No whitespace errors. |

Regression coverage now guards Guide local category/channel routing, durable detail/programme cache use, startup-validation exclusion, per-kind EPG TTL expiry, and rebuildable eviction without deletion of an active catalog.

### Physical verification status and controlled-traffic boundary

- Physical follow-up verification was attempted after packaging, but the target was unavailable:
  - `ares-install -r` reported `FAILED_REMOVE` while the existing app remained listed;
  - the subsequent `ares-launch` timed out connecting to `lg-oled-g1`.
- Therefore this entry does **not** claim device deployment, zero-network Guide evidence, eviction-recovery evidence, or measured ten-open/five-revisit request counts.
- No provider acquisition, detail, EPG, validation, or other provider request was intentionally invoked during this implementation session.
- The requested realistic details/EPG session count must be captured only after device connectivity returns and an explicit provider-active verification window is approved. The expected cache semantics are one request per unique expired item/projection, then zero repeat requests within its TTL; this is an implementation expectation, not a measured claim.
- The current application deliberately does not autonomously schedule daily provider acquisition at startup or while unattended. The existing probe scheduler can be armed only through the development API, and a real 24-hour end-to-end acquisition observation requires both an approved provider window and the future due boundary. It has not been armed or run here.

### Decision

- Local Guide catalog routing, durable interactive caches, explicit startup validation behavior, and eviction-safe storage ordering are implemented and automated-test accepted.
- Gate 1 and Phase 2A remain accepted.
- Physical device verification, provider-active request-count measurement, and a real unattended daily acquisition observation remain pending and are not authorized by this local-only implementation entry.

## 2026-08-04 — Device follow-up: local Guide, cache warming, eviction recovery, and storage headroom

### Scope

- Target: `OLED55G1RLA`, webOS SDK `6.5.3`, firmware `03.53.45`, device alias `lg-oled-g1`.
- Normal package boundary: `com.arash.novaplay_1.0.22_all.ipk`; the production build does not expose `window.__NOVA_LIBRARY_PROBE__`.
- A separately packaged, explicitly probe-enabled build was installed only to run the local eviction fault injection. The normal package was rebuilt, reinstalled, and relaunched before any provider-active observations.
- Sanitized aggregates only are recorded below. No provider URL, credential, catalog title, query text, raw payload, or exported trace is retained.

### Implementation completed in this follow-up

- Guide channel artwork now uses a local text placeholder when the local-only Guide would otherwise cause a remote artwork request. This closes the remaining non-provider network surface in the Guide flow.
- Added a storage headroom policy before catalog synchronization:
  - uses `navigator.storage.estimate()` when the runtime supplies usable quota/usage values;
  - otherwise uses a conservative 384 MiB fallback ceiling with a repository-derived profile-byte estimate;
  - reserves the greater of 32 MiB or ten percent of quota;
  - runs deterministic rebuildable eviction before any provider sync request when headroom is insufficient;
  - defers before provider work if headroom still cannot be established.
- The existing deterministic eviction order remains EPG, details, derived search records, then superseded snapshots only. Active catalog records and localStorage-owned profiles, settings, favorites, and resume state remain protected.
- Added repository byte estimation and a sync regression that confirms low-headroom maintenance removes only rebuildable records, preserves active catalog readability, and permits the six-request fixture sync afterwards.

### Automated verification completed during this follow-up

| Command | Result | Notes |
| --- | --- | --- |
| `rtk npm exec tsc -- --noEmit` | Passed | After storage-headroom implementation. |
| `rtk npm test -- src/library/catalog-sync.test.ts` | Passed | 16 tests, including deterministic low-headroom eviction-before-sync coverage. |
| Probe-enabled `rtk powershell -NoProfile -Command "$env:VITE_ENABLE_LIBRARY_PROBE='true'; npm run package:webos"` | Passed | Probe-only verification package built successfully. |
| Normal `rtk npm run package:webos` | Passed | Rebuilt the normal `1.0.22` package after the probe run. |

Final full-suite/package/diff checks remain recorded as pending at the end of this entry because the final status append and temporary-helper cleanup occur after these intermediate checks.

### Physical local Guide verification

A CDP Network capture was armed after the normal package was loaded. The Guide was opened from Home, switched to a different local category, and advanced to the next local page.

| Local action | Sanitized observed local result | Network events after capture |
| --- | --- | ---: |
| Open Guide | 823 local categories; 24 visible channel rows; local pager present | 0 |
| Change category | Different active local category and page/count state | 0 |
| Next page | Local page advanced with visible channel rows | 0 |

- This capture includes `Fetch`, `XHR`, and remote image/resource events after the capture started: all counts were zero.
- The Guide therefore has no observed provider category-list, stream-list, programme-prefetch, or remote-artwork request during these three local actions.
- This is a physical verification of the corrected normal package, not only a source-level guard.

### Physical eviction recovery verification

The probe-only build invoked `catalogSync.simulateEviction()` while the app was running, without provider traffic.

- The simulated deletion/reopen returned success with zero captured network events.
- The existing localStorage fingerprint was unchanged (eight localStorage entries before and after).
- Immediately after eviction:
  - opening local Live browse rendered the explicit downloaded-library-unavailable state;
  - local Global Search rendered the same unavailable state after a local query submission;
  - both screens included `Refresh library`;
  - neither screen rendered a false `No results` state or an application error;
  - all captured network-event counts were zero.
- The probe build was then closed and relaunched. The same browse/search unavailable-state checks again passed with zero network events and preserved localStorage state.
- The probe package was removed by reinstalling the normal production package before subsequent provider-active observations.

### Provider-active durable details measurement

The approved provider-active window measured one warmed Series-details session rather than attempting a historical package comparison:

| Session phase | Opens | Provider API requests | Result |
| --- | ---: | ---: | --- |
| Unique local Series detail opens | 10 | 10 | One read-through detail request per first cache miss. |
| Immediate revisits of five of those items | 5 | 0 | All five served from the 12-hour durable detail cache. |

- The first-open phase also emitted non-provider enrichment/artwork activity; the table counts only provider API requests.
- This demonstrates the requested realistic warmed-session reduction as `10 provider requests → 0 provider requests` across ten unique opens plus five immediate revisits.
- This is a same-session miss-versus-warmed measurement, not a claim about an unrecorded historical build.
- VOD and Series use the same profile/kind/id repository APIs and source-level regression coverage; this device sample used Series because the repaired local Series catalog was available.

### Programme-cache device result and limitation

- The selected Live channel's Now/Next request received HTTP 404 with HTML content. The UI correctly rendered no Now/Next data.
- An explicit Schedule action rendered the existing unavailable-schedule state. No successful programme payload was received, so neither a `now-next` nor a `schedule` record was written to the durable EPG store.
- The version-5 EPG store was physically inspected as keyed by `[profileId, streamId, kind]`; it contained zero records after this failed provider interaction.
- This is not treated as a cache write/read defect: the application intentionally writes durable programme records only after a successful programme response. A positive programme-cache warm-hit measurement remains pending until the provider exposes a successful programme response for an available local channel.

### Manual sync and cooldown observation

After full simulated eviction, one explicit normal-package `Refresh downloaded library` was started within the approved provider-active window.

- The run completed its local state transition with `inProgress=false`, `failureCount=1`, and a persisted failure-cooldown deadline.
- At completion, persisted catalog state reported complete Live and Series sections, while VOD remained partial with one recorded whole-section failure/cursor checkpoint.
- This did **not** satisfy the requested unattended all-three-section daily-sync acceptance condition. No claim is made that all three sections refreshed successfully or that a new search generation was successfully rebuilt for every section.
- The exact device request total for this refresh is not claimed: the initial capture helper awaited a transient toast and did not produce a finalized aggregate before the toast expired.
- An immediate explicit follow-up Refresh was physically captured after the persisted cooldown:
  - the UI rendered `Downloaded library is already up to date`;
  - provider request count was zero;
  - total post-action network-event count was zero.
- This confirms the immediate cooldown/zero-request behavior without spending an additional sync request.

### Startup validation and AccountSummary boundary

- Source and regression coverage continue to prove that `client.validate()` occurs only on login, explicit profile switch, or the explicit Refresh account action; no module/bootstrap/startup call remains.
- AccountSummary persistence/restoration and the Home `As of <local timestamp>` rendering remain implemented through `meta.account`.
- A new physical startup capture specifically proving the persisted `As of` line was not repeated in this follow-up. It remains source/regression-verified rather than newly device-verified.

### Scheduling-policy status

- Normal production startup, profile activation, and player exit still do not arm automatic provider acquisition.
- This preserves the previously accepted manual/observable acquisition policy.
- The requested true unattended due-boundary observation was not performed because enabling normal unattended provider acquisition would reverse that policy. The provider-active authorization used here does not silently change the normal scheduling policy.
- A probe-only scheduler exists for controlled work, but a future due-boundary observation requires an explicit scheduling-policy decision and a fresh budget-safe window.

### Decision

- Local Guide zero-network behavior: **physically accepted**.
- Probe-only full-eviction recovery while running and after relaunch: **physically accepted**.
- Storage-headroom policy and ordered rebuildable eviction: **implemented and fixture-test accepted**.
- Durable Series detail cache warm-hit behavior: **physically accepted** for the measured ten-open/five-revisit session.
- Positive durable Now/Next/Schedule cache behavior: **pending provider endpoint availability**; the observed programme response was HTTP 404 and was correctly not cached.
- Manual sync completion for all three sections and search-index regeneration: **pending/rejected for this observed run** because VOD remained partial.
- Immediate persisted cooldown with zero follow-up network requests: **physically accepted**.
- Unattended daily synchronization: **pending explicit policy decision and future due-boundary observation**.
- Gate 1 and Phase 2A retain their previously accepted status; this entry does not alter those decisions.

### Final validation closure

| Command | Result | Notes |
| --- | --- | --- |
| `rtk npm test` | Passed | 32 test files, 260 tests. Expected mocked metadata 503 diagnostics remain non-failing test output. |
| `rtk npm exec tsc -- --noEmit` | Passed | No TypeScript diagnostics. |
| `rtk npm run package:webos` | Passed | Normal `com.arash.novaplay_1.0.22_all.ipk` produced; 35 runtime modules passed import-cycle checks and ES2015/standalone-media checks passed. |
| `rtk git diff --check` | Passed | No whitespace errors. |

- Temporary CDP verification scripts were deleted before the final validation pass; no device helper artifact remains in `scripts/`.

## 2026-08-04 — Metadata restoration, background acquisition, TV-safe overlays, and sizing diagnosis

### Scope and implementation

This entry supersedes the prior manual-only acquisition policy for the explicitly authorized follow-up scope. Gate 1 and Phase 2A remain accepted; this work does not revise their historical acceptance.

- Metadata configuration is now loaded with Vite `loadEnv()` during config evaluation. The generated `build-info.json` is the package truth, and `package:webos` blocks packaging unless `metadataProxyConfigured` is `true`.
- The deployed metadata Worker was preflighted with a packaged-app CORS origin. Its preflight response accepted `Origin: null`.
- Incomplete catalogs now schedule the existing serial six-request sync plan after launch/profile activation/resume/player exit. A persistent indicator reports current section and acquired count while running, and reports incomplete/cooldown/failure state without claiming the library is current.
- An interrupted active lease is recovered after the 10-minute stale interval. The recovery test confirms a fresh lease is retained while an expired lease clears `inProgress`, clears the run ID, and makes work immediately due.
- Browse reads the complete durable catalog first. Only an incomplete browse section can make its existing brokered interactive categories/streams request. Guide remains complete-local-only.
- Global search remains local first. For an incomplete section it offers an explicit, section-scoped `Search <section> live` submission. It issues one brokered interactive request, never a three-section fan-out, and labels successful or unavailable live results truthfully.
- Catalog and search artwork are independently admitted with a 480px prefetch margin and concurrency of 3 on webOS / 6 elsewhere. Guide remains the sole surface with remote artwork suppression.
- The production Settings UI no longer renders the VOD-measurement control. The underlying targeted path remains available only behind the probe guard.
- Fixed TV overlays now use approximately 5% safe insets. Player toast placement reserves the player progress region.
- Video sizing capture is probe-only. It records engine, intrinsic and client video dimensions, computed fit, player box, and bounded resolution history; normal packages do not publish the probe global.

### Automated evidence

| Check | Result |
| --- | --- |
| Full test suite | Passed: 32 files, 263 tests. |
| Focused stale-lease, progress, and broker lane tests | Passed: 3 files, 59 tests. |
| TypeScript | Passed: `rtk npm exec tsc -- --noEmit`. |
| Normal package | Passed with metadata package gate, ES2015/standalone-media checks, and 35 runtime modules with no relative import cycles. |
| Diff whitespace check | Passed: `rtk git diff --check`. |
| Normal package probe boundary | Passed: packaged `app.js` contains no `__NOVA_LIBRARY_PROBE__` symbol. |

New direct regressions cover:
- stale lease recovery boundary behavior;
- progress events without changing the six-request plan;
- one live submitted search consuming interactive, not sync, budget;
- production removal/gating of the VOD-measurement control;
- source boundaries for local-first Guide and section-scoped live fallback.

### Physical-device evidence

The normal package and, briefly, a dedicated probe package were installed on the physical TV without uninstalling the app. The normal package was reinstalled after probe capture.

- **Metadata:** On the physical device, a movie and a series both emitted `enrichment-start` with `configured: true`, then completed title enrichment. Sanitized terminal aggregates were:
  - movie: 12 cast, 2 crew, 16 rating candidates;
  - series: 12 cast, 1 crew, 1 rating candidate.
  Both detail pages displayed TMDB attribution and multiple loaded cast portraits. Sample portrait intrinsic dimensions were approximately 185 by 277–278 pixels. This is device confirmation of configured metadata enrichment, not merely a build-file assertion.
- **Persistent acquisition state:** The device rendered the persistent background status while a section remained incomplete: `Downloaded library needs attention`, with the missing section and next-attempt state. This replaced the prior false “already up to date” cooldown wording. A submitted local search also exposed exactly one `Search Movies live` affordance for the incomplete section; its failed provider response remained visibly labeled `Live provider unavailable`, rather than returning an empty-library falsehood.
- **Artwork:** A physical local search rendered 24 retained result cards (12 title cards and 12 live cards) without reintroducing the old 60-card page. The title-card admission state was retained while cards stayed mounted. A statistically comparable historical before timing and a provider-successful live-search poster timing were not captured in this window, so no before/after millisecond claim is made. The required approximately-one-second visual-fill target remains pending a controlled repeat with provider artwork responses.
- **Safe area:** During actual playback at 1920 by 1079 CSS pixels, the player progress box was at x=120, y≈916.8, width=1680, height≈88.2. An active player toast occupied x≈1705.8, y≈825.8, width≈118.2, height≈56.2, ending at y≈882. This left approximately 35 pixels of separation before the progress region and stayed within the 5% edge inset. The toast did not overlap the player progress UI.
- **Video sizing:** Probe-only capture on the physical TV recorded the native engine transition from initial 0 by 0 intrinsic metadata to 1920 by 1072 at `resize`, `loadedmetadata`, and `playing`. The rendered video client box was also 1920 by 1072; computed `object-fit` was `contain`; the player container was 1920 by 1079. The resolution history did not show a stream resolution change after metadata became available. Diagnosis: the sampled stream is rendered at its decoded dimensions, with only a seven-pixel container-height difference; no video-fit CSS change is justified from this measurement.

### Physical limitations and follow-up

- The package gate and physical metadata trace are accepted. The configured build does not expose a metadata compile constant on `window`; the trace is the authoritative device-level evidence.
- The observed incomplete section entered a provider failure/cooldown state. The persistent state and truthful fallback UI are physically confirmed, while a clean three-section successful automatic run is not claimed from this provider window.
- Artwork timing remains pending controlled comparable baseline and provider-successful artwork responses. No unsupported before/after claim is recorded.
- Video CSS remains unchanged after measurement. A sizing correction requires a failing-stream capture showing a mismatch between intrinsic/client dimensions or an undesired fit mode.
- The normal production package was reinstalled after probe collection and physically confirmed to expose no library probe global.

### Decision

- Metadata package configuration and physical enrichment: **accepted**.
- Background incomplete-state persistence, truthful cooldown language, and section-scoped live fallback UI: **accepted for observed failure/cooldown state**.
- Full successful automatic acquisition across every section: **pending provider-successful repeat**.
- Safe-area overlay change: **physically accepted**.
- Probe-only video sizing instrumentation and no-change diagnosis for the sampled stream: **accepted**.
- Artwork-admission implementation: **accepted by code and device rendering evidence**; controlled before/after timing target: **pending**.
- Gate 1 and Phase 2A: **remain accepted**.

## 2026-08-04 — Verification-gap closure: artwork retention, background acquisition, and video sizing

This entry closes the three verification gaps left pending in the preceding
entry. It performed physical CDP measurement on `OLED55G1RLA` (`lg-oled-g1`,
webOS 6.5.3, Chromium 79) and the webOS emulator, using a probe-enabled build.
Two additional root-cause defects were found and fixed. Gate 1 and Phase 2A
remain accepted; this work does not revise their historical acceptance.

### Tooling and baseline

- Baseline before this work: uncommitted working tree on `master` after commit `6736872` (`fix: index local catalog search`).
- Physical driver: `ares-inspect` websocket + a small `ws`-based CDP client (`scripts/cdp-verify.mjs`) evaluating ES5-safe expressions (Chromium 79 rejects `??`, optional chaining, and the CSS `inset` shorthand).
- Probe package rebuilt with `VITE_ENABLE_LIBRARY_PROBE=true`; version bumped to `1.0.23` because a same-version reinstall can leave a stale IPK on the TV.
- No IPTV provider URL, credential, catalog title, or query text is recorded below; only sanitized aggregates.

### Item 1 — Artwork fix proven (root cause was persistence, not admission)

**Root cause (new finding).** Search/browse cards showed no images because
`toCachedStream()` (`src/library/catalog-repository.ts`) passed every cached
stream through `stripCachedUrls()`, which recursively deletes **any** URL-like
string. Provider artwork endpoints (`icon`, `cover`, `seriesCover`) are URL-like,
so they were stripped before snapshots were ever persisted. The 480 px prefetch
margin and concurrency values were never the problem — there was nothing to
paint. Device sampling of the existing durable cache confirmed **0% artwork
retention**:

| Section | Sampled shards | Sampled items | Items with any artwork |
| --- | ---: | ---: | ---: |
| Live | 8 | 631 | 0 |
| VOD | 8 | 1,024 | 0 |
| Series | 8 | 1,015 | 0 |

**Fix.** `toCachedStream()` now restores the whitelisted artwork fields
(`icon`/`cover`/`seriesCover`) after sanitization. The credentialed playback URL
(`directSource`) is still excluded by name, and the same artwork fields are
already persisted for favorites/resume via `toStoredStream`, so this is a
consistent, safe boundary. A new repository regression persists a stream with
real HTTP artwork URLs plus a credentialed `directSource` and asserts the
artwork survives while `directSource` does not.

**Physical admission-pipeline measurement.** Because the legacy on-device cache
carries no artwork and the day's provider budget was exhausted, real remote
poster URLs (`picsum.photos`, a public image host — **not** the IPTV provider,
so no provider request or budget use) were reversibly injected into the complete
Series snapshots (44,690 items / 480 shards), measured through the exact
production render → deferred-admission → decode path, then fully removed
(verified: 0 residual injected covers). Chromium-79 native `<video>`/image decode
on the physical panel.

| Flow | Metric | Result |
| --- | --- | ---: |
| Category open (7 distinct Series categories, 24 visible cards, cold distinct posters) | full-paint p50 | ~2,445 ms |
| " | full-paint range | 2,203–2,804 ms |
| " | first-visible-paint p50 | ~521 ms |
| Category open (same category, warm HTTP cache, 5 repeats) | full-paint steady-state | ~1,020–1,040 ms |
| " | first-visible-paint | ~335 ms |
| Global search → Series results | 60 poster cards rendered (was **0** before fix) | first visible page 24/24 painted in 2,491 ms; first-paint 306 ms |

- Cold full-paint is dominated by fetching 24 *distinct* posters at concurrency 3 over the panel's link; the warm-cache figure (~1.0 s) isolates admission+decode and meets the ~1 s target.
- **Progressive re-render survival:** 12 in-flight poster `<img>` nodes were tagged as the first search section committed; after all progressive section commits, **12/12 survived** as the same DOM nodes — progressive re-renders no longer discard in-flight image loads (keyed append/remove in `updateGlobalSearchSection`).
- **No 60-card decode stall:** paging a 1,144-item Series category, the concurrent deferred-load count never exceeded **3** (admission cap held); rAF frame delta p50 was 16.7 ms. webOS renders 24 cards/page and admits ≤3 decodes, so a 60-card mass decode is structurally impossible.

### Item 2 — Background acquisition mechanics proven on emulator; completion gated on storage/budget

The empty-library case was run on the webOS **emulator** (separate database), with the probe-enabled build, a fresh sync budget (probe reset while `block=null`, the precedented controlled procedure), and a fully evicted catalog cache (all sections `coverage: none`, 0 items).

- **Empty-library UI (truthful, no false "no results"):** Series browse of an empty section automatically fell back to **live provider results**; global search rendered **"Library not downloaded yet"** per section plus three **"Search <section> live"** affordances.
- **Live fallback lane + labelling:** invoking the Movies live-search fallback consumed **interactive** budget (1→2) and **left sync at 0/6**; the Movies group relabelled to **"Live provider search" / "Searching live provider…"** — served through the interactive lane and labelled live, not downloaded.
- **Automatic start (no user action):** after a plain reload the coordinator fired on launch with no click. On the emulator it then correctly **deferred** — see storage limit below.
- **Automatic acquisition running + progress:** with the emulator's artificial 29 MB quota overridden at the storage-estimate boundary (see below), a launch-triggered run acquired Live automatically; the persistent indicator showed **"Downloading Live TV — N items acquired"** and progressed live.
- **Progress survives navigation:** the indicator persisted and kept updating across Home → Settings → Search → Home (29,959 → 30,360 → 30,954 → 31,723 items) — it lives in the app shell.
- **Interrupt recovery (no "downloading forever"):** backgrounding the app mid-sync (`document.hidden` + `visibilitychange`) cancelled the run immediately; the indicator became **"Downloaded library paused — Downloading resumes when the app is active,"** `inProgress=false` (lease released), and the 12,672 already-published Live items were retained (not corrupted). On returning to foreground the indicator became **"Downloaded library is incomplete — Still missing: … Next attempt <time>"** — it states what is missing and when the next attempt occurs, and respects the persisted cooldown rather than looping.
- **Emulator storage limit (blocks completion there):** `navigator.storage.estimate()` reports a hard **29 MB quota** (~19 MB used) on the emulator. The storage-headroom preflight (required headroom 32 MB > total quota) therefore correctly **defers** every real acquisition — the app refuses a sync it cannot store and reports the incomplete state truthfully, instead of looping. The full six-request completion and the completion→local-only transition cannot be produced on the emulator for this reason. The physical TV reports a healthy **380 MB quota / 58 MB used / headroom allowed**, so it is the only viable completion target.

**Physical TV run — new VOD-ingestion crash found (rejected).** With user
authorization, a controlled six-debit run was attempted on the physical TV
(healthy 380 MB storage; probe budget reset while `block=null`, the precedented
controlled procedure; checkpoints cleared). The result did **not** complete and
surfaced a distinct, reproducible defect that is the most likely root cause of
the original "reported downloading indefinitely" complaint:

- **Live and Series scans succeed** and stay `complete`. Their sections were
  already `coverage: complete`, so the coordinator uses the non-incremental
  in-memory `buckets` path and publishes each section once at scan end.
- **The VOD whole-section scan reproducibly crashes/stalls the webOS runtime**
  at roughly 4,000–5,000 VOD items in. Across three attempts the DevTools/JS
  context died during the VOD scan (the webOS debug bridge itself dropped once),
  each time leaving a stale `inProgress=true` lease and VOD `partial`. The user
  independently observed the same: "in live the counter works and counts and
  right when it switches to VoD it gets stuck."
- **Root cause (code-level):** VOD's section is `coverage: partial` (it has never
  completed), so `incrementalPublication` is `true`
  (`catalog-sync.ts`). Every 128-item category flush
  (`PARTIAL_CATEGORY_FLUSH_ITEMS`) calls
  `IndexedDbCatalogRepository.appendPartialCategorySnapshot()`, which
  `await getManifest()` (reads the full 363-category VOD manifest), rebuilds the
  whole manifest via `upsertCategoryManifest`, and `putRecord('manifests', …)`
  rewrites the **entire manifest** — once per flush. For VOD's ~194,000 items
  that is ~1,500+ full-manifest read/rebuild/rewrite cycles interleaved with the
  active ~80 MB streamed parse. This heavy, redundant IndexedDB I/O under the
  webOS Chromium 79 runtime is the stall/crash vector. Live/Series never take
  this path, which is exactly why only VOD hangs, and it is consistent with the
  user's note that whole-catalog sync "was doing this faster" before the
  incremental partial-publication path was added (2026-08-03 entry).
- The `no-partial-run` preflight and truthful incomplete state were re-confirmed
  as positive behaviors on the physical TV: after the interrupted attempts left
  sync at `5/6`, a plain relaunch **deferred** (did not spend the lone debit) and
  the indicator read "Downloaded library is incomplete — Still missing: Movies.
  Next attempt …," not a false "downloading forever." The in-app 10-minute
  stale-lease recovery also fired automatically once and cleared an orphaned
  lease on-device.

**Item 2 completion status:** the six-request all-three-section completion and
the completion→local-only transition are **rejected/blocked** on this newly
found VOD-ingestion defect, not merely pending a window. The fix is a bounded
repository change (stop rewriting the full manifest on every partial flush —
e.g. defer/coalesce the manifest write, or persist shards during the scan and
update the manifest far less frequently) and must be verified by an actual VOD
completion on the physical TV in a fresh six-debit window. It was not attempted
in this session because the sync budget was already spent to `5/6` by the
diagnostic attempts and a fix cannot be marked accepted without a physical
completion measurement. Auto-start, progress, navigation-survival, live
fallback, and interrupt/stale-lease recovery are physically proven (emulator for
the empty-library flows; TV for stale-lease recovery and the no-partial-run
preflight).

### Item 3 — Video sizing: real failing case found, root-caused, fixed, and verified

The prior "no change justified" conclusion was based on a single working HD
stream. Multi-case measurement on the physical panel found a **genuinely failing
class** and its root cause.

**Root cause (new finding).** Chromium 79 (the webOS runtime) predates the CSS
`inset` shorthand (added in Chromium 87) and silently drops it. `.player-page`
used `inset: 0`, so the fixed player surface was never sized to the viewport;
the surface and `#video-player` collapsed toward the **video's intrinsic pixel
size**. HD 1920×1080 streams coincidentally filled the screen (intrinsic ≈
viewport), which is why the earlier single sample looked correct, but SD/varied
content rendered small. A neutral control confirmed the mechanism: a bare
`position:fixed; inset:0` element measured **height 0**, while explicit
`top/right/bottom/left:0` measured the full 1080. This is also the source of the
"1 px" surface discrepancy: it was never a safe-area artifact — measured
`env(safe-area-inset-*)` were all `0px` and the layout viewport is exactly
1920×1080. The surface read 1079 purely because the ignored `inset` left it
mis-sized.

**Before-fix measurements (bug reproduced), real `#video-player`, `object-fit: contain`:**

| Case | Engine | videoWidth×Height | client W×H (bug) | Correct? |
| --- | --- | --- | --- | --- |
| Cinemascope 2.24:1 | native HLS | 224×100 | 224×100 | No — collapsed to intrinsic |
| SD 16:9 (Elephants Dream) | native mp4 | 426×240 | 426×240 | No — collapsed |
| SD 16:9 (BigBuckBunny 360) | native mp4 | 640×360 | 640×360 | No — collapsed |
| HD 16:9 (provider live ×4) | native | 1920×1080 | 1920×1080 | Yes (coincidental) |
| HLS ABR mid-stream change | Hls.js | 768×432 → 1920×1080 | tracked intrinsic | element sized to intrinsic, not surface |
| Provider live TS | MPEG-TS (mpegts.js) | 1920×1080 | 1920×1080 | Yes (coincidental) |
| Player surface | — | — | 1920×**1079** | 1 px short |

Provider live channels (including French "LQ" channels) are transcoded to
square-pixel 16:9/540p, so no true 720×576-flagged-16:9 anamorphic stream exists
in this provider; the cinemascope 2.24:1 asset is the non-16:9/non-4:3 case.

**Fix.** All eight `inset: 0;` rules in `src/style.css` (player surface, poster
artwork/fallback, live channel fallback, detail backdrop and ::after, episode
image and fallback) were rewritten to explicit `top/right/bottom/left: 0` for
Chromium-79 compatibility. Rebuilt/installed as normal-boundary probe package
`1.0.23`; confirmed the runtime still lacks the `inset` shorthand.

**After-fix measurements (same panel, `object-fit: contain`):**

| Case | Engine | videoWidth×Height | client W×H | Displayed box | Correct? |
| --- | --- | --- | --- | --- | --- |
| Player surface | — | — | 1920×**1080** | — | 1 px resolved |
| Cinemascope 2.24:1 | native HLS | 224×100 | 1920×1080 | 1920×857, 223 px letterbox | Yes |
| SD 16:9 (Elephants Dream) | native mp4 | 426×240 | 1920×1080 | 1917×1080 | Yes |
| SD 16:9 (BigBuckBunny 360) | native mp4 | 640×360 | 1920×1080 | 1920×1080 | Yes |
| HLS ABR mid-stream change | Hls.js | 768×432 → 1920×1080 | 1920×1080 throughout | fills, then exact | Yes — late MSE intrinsic update handled |
| Provider live TS | MPEG-TS (mpegts.js) | mediaInfo 1920×1080 | 1920×1080 | 1920×1080 | Yes |
| Resume stream | native | 1280×720 | 1920×1080 | upscaled to fill | Yes (was 1280×720 before fix) |

- SD/varied content now scales up to fill the 1920×1080 surface with correct letterbox/pillarbox; the mid-stream Hls.js resolution change keeps the element at surface size across the switch.
- Safe-area overlay geometry re-checked on the corrected 1080 surface: player progress box at x=120, y≈917.8, width 1680, ending y=1006 — inside the 5 vh bottom inset with margin; no overlap.

### Automated verification

| Command | Result | Notes |
| --- | --- | --- |
| `npx tsc --noEmit` | Passed | After repository and CSS changes. |
| `npx vitest run` | Passed | 32 files, 264 tests (was 263; +1 artwork-retention regression). |
| `npm run build` | Passed | ES2015/import-cycle/standalone-media/webOS bundle checks passed. |
| `VITE_ENABLE_LIBRARY_PROBE=true npm run package:webos` | Passed | Produced `com.arash.novaplay_1.0.23_all.ipk`. |

### Files changed

- `src/library/catalog-repository.ts` — retain artwork URLs in `toCachedStream` (item 1 fix).
- `src/library/catalog-repository.test.ts` — artwork-retention regression (item 1).
- `src/style.css` — replace 8 `inset: 0` shorthands with Chromium-79-safe longhand (item 3 fix).
- `public/appinfo.json` — package version `1.0.23`.
- `LIBRARY_ENGINE_STATUS.md` — this entry.

The VOD-ingestion crash (item 2) is **diagnosis only** in this entry; no code
change was made because the fix must be verified by a physical VOD completion in
a fresh six-debit window, which was not available this session.

### Decision

- Item 1 (artwork): root cause was 0% artwork retention in `toCachedStream`; **fixed, regression-covered, and physically proven** — search/browse now render posters; admission cap (3) holds, no 60-card stall, in-flight loads survive progressive re-render. Warm-cache full-paint ~1.0 s meets target; cold full-paint is network-bound.
- Item 2 (background acquisition): auto-start, live progress, progress-survives-navigation, interactive-lane live fallback with truthful labelling, and interrupt→paused→cooldown recovery are **physically proven** (emulator for the empty-library flows; TV for stale-lease recovery and the no-partial-run preflight). The six-request completion and completion→local-only transition are **rejected/blocked** by a newly found VOD-ingestion defect: the incremental partial-publication path rewrites the full VOD manifest on every 128-item flush (~1,500+ full-manifest read/rebuild/rewrite cycles interleaved with the ~80 MB streamed parse), which reproducibly crashes/stalls the webOS runtime ~4–5k items into the VOD scan while Live and Series (non-incremental, complete) succeed. This is the most likely root of the original "downloading indefinitely" report. Fix is a bounded repository change (stop rewriting the whole manifest per partial flush) that must be verified by an actual physical VOD completion in a fresh six-debit window.
- Item 3 (video sizing): a genuinely failing class (SD/varied content collapsing to intrinsic size) was found and root-caused to Chromium 79 ignoring the CSS `inset` shorthand; **fixed and verified** across native, Hls.js (incl. mid-stream resolution change), and MPEG-TS, with correct fill/letterbox. The "1 px" surface discrepancy was the same defect, **not** a safe-area inset artifact, and is resolved (surface now exactly 1920×1080).
- Gate 1 and Phase 2A: **remain accepted**.

## 2026-08-04 — Partial-publication complexity fix, Chromium 79 CSS baseline sweep, and build-time baseline guard

This entry closes the manifest-complexity defect diagnosed in the preceding entry,
sweeps the stylesheet for the whole class of features the webOS runtime silently
drops, and adds a build-time guard for that class. It also records a **newly
found, reproducible renderer termination** that blocked the requested three-section
re-acquisition. Gate 1 and Phase 2A remain accepted; this work does not revise
their historical acceptance.

### Baseline and tooling

- Baseline: uncommitted working tree on `master` after commit `6736872`.
- Physical target: `OLED55G1RLA` (`lg-oled-g1`), webOS SDK `6.5.3`, firmware
  `03.53.45`, Chromium 79, layout viewport exactly 1920x1080.
- Driver: `ares-inspect` websocket plus a scratchpad CDP client. Two measurement
  traps were found and are recorded because they silently invalidate results:
  - Only one `ares-inspect` tunnel may be open. Stray tunnels accumulate and the
    page dies once several are attached.
  - `Emulation.setFocusEmulationEnabled` must be sent before any focus
    measurement. Under CDP the page is not the focused document, so `:focus` does
    not match even though `document.activeElement` is set, and every focus ring
    reads as absent. Transitions must also be suppressed, or a transitioned focus
    change reads as no change.
- No provider URL, credential, catalog title, or query text is recorded below.
- Packages: probe-enabled `1.0.25` for measurement, normal `1.0.26` shipped and
  confirmed to expose no `__NOVA_LIBRARY_PROBE__` symbol.

### Item 1a — partial-publication manifest cost is no longer quadratic

**Defect.** A section manifest is one record listing every category, so rewriting
it per flush costs O(flushes x categories). VOD (approximately 194,000 items over
363 categories, flushed every 128 items) read, rebuilt, and rewrote the whole
manifest approximately 1,500 times while its approximately 80 MB streamed parse
was still running.

**Fix.** `preparePartialSectionSnapshotRun()`, `appendPartialCategorySnapshot()`,
and `promotePartialSectionSnapshots()` are replaced by a single-use
`PartialSectionPublication`, opened through
`IndexedDbCatalogRepository.openPartialSectionPublication()`. Snapshot shards are
still written on every bounded flush — that is what keeps peak memory bounded —
but manifest mutation is buffered and written exactly **twice** per run: once to
detach the previous generation's pointers, once to commit the closed array.
Manifest cost is O(1) per section instead of O(flushes). The old per-flush entry
points are removed, so the quadratic path is no longer reachable.

Deferring the manifest loses nothing: a partial category is never readable (every
reader requires `complete` coverage), and an interrupted partial run always
restarts from byte zero, so the per-flush manifest entry was never a resume
cursor. Shards orphaned by an interrupted run are reclaimed by
`evictRebuildableData()`, which already deletes every snapshot row the active
manifest does not reference.

**Second defect fixed by the same change.** Promotion previously threw
`Cannot promote a section with unavailable category coverage` whenever the provider
stopped listing a category between runs: the run's reset set that entry to `none`,
nothing re-published it, and the section could never complete again. `commit()`
now commits such a category as complete with zero items, which is exactly what a
closed top-level array proves about it.

**Deliberate semantic change.** An interrupted partial run now leaves the manifest
at coverage `none` rather than `partial`. The streamed shards remain durable in the
`snapshots` store; only the pointer is deferred. Section-state recovery and the
category-slice resume cursor are unaffected because
`firstIncompleteCategoryCursor()` treats `none` and `partial` identically.

**Test.** `keeps partial-publication manifest writes proportional to categories,
not to flushes` instruments `IDBObjectStore.prototype.put` filtered to the
`manifests` store, so it measures real storage work rather than a counter the
production code keeps for the test's benefit. It publishes the same 12 categories
x 64 items twice, at flush sizes 64 and 4 — **16x the flush count over identical
input** — and asserts the manifest write count is *identical* across both, at or
below the category count, and strictly below the flush count.

### Item 1b — newly found renderer termination at the scan-to-publish transition

The requested single six-request three-section re-acquisition **did not complete**.
This is recorded as a rejected run with evidence, not as pending a window.

Two controlled attempts were made on the physical TV (healthy storage: 378 MB
quota, 95-103 MB used; `block = null`; checkpoints cleared; probe budget reset, the
precedented controlled procedure). Both ended with the renderer being terminated
and the page reloading:

| Attempt | Requests spent | Died at | Page `navigationStart` | Section state at death |
| --- | ---: | ---: | --- | --- |
| 1 | 4 of 6 | approximately 249 s | 14:37:42Z | Live scan complete, publishing |
| 2 | 4 of 6 | approximately 250 s | 14:50:39Z | Live scan complete, publishing |

- In both attempts the four spent requests were the three category requests plus
  the Live whole-section scan. Progress was healthy up to that point: 12,026 items
  at t=160 s and 33,017 items at t=207 s, extrapolating to Live's 53,876 items at
  roughly t=250 s — the instant of death in both runs.
- No JS exception was captured; the page simply went away, which is consistent
  with an OS-level renderer kill rather than JS heap exhaustion.
  `performance.memory` on this runtime reports a static 10 MB and is unusable for
  measurement.
- **The safety property held both times.** Live's previously published generation
  was preserved intact (it moved `complete` to `partial` only because the
  categories response added one new category; item count stayed 53,876), the stale
  lease was cleared automatically by the in-app 10-minute recovery, and the
  indicator reported the incomplete state truthfully rather than looping.
- The storage-headroom preflight takes approximately 150 s before the lease is
  taken, because `estimateProfileStorage()` cursor-scans every store. Zero requests
  spent early in a run therefore does not mean the run deferred.

**Zero-cost control.** The existing publication probe was driven at Live scale on
the same device — 823 categories x 66 items = 54,318 synthetic items through the
exact `replaceSectionSnapshots()` path, no provider traffic. It **completed** in
205 s with all six publish stages and no page loss. Whole-section publication at
Live scale is therefore viable on its own; the termination requires the real run's
additional resident state (streamed parse state and full-size items carrying the
restored artwork URLs).

**Bounded fix applied in response.** `replaceSectionSnapshots()` built *every*
category's shard payloads in its planning pass before writing any record, so the
whole section's payload set stayed live simultaneously, on top of the already
resident parsed items. It now serializes one category at a time, releases each
shard payload as soon as its record commits, and holds the write input rather than
its item array so the only post-validation read of `items` is the serializing one.
Cross-section validation deliberately stays in the up-front pass so a bad input
still fails before any record is written.

Regression: `serializes a whole-section publication one category at a time` records
the `snapshots`-store write count at each read of every category's `items`, and
asserts each category is read exactly twice — once by validation at zero writes,
once at serialization after exactly N prior writes — proving payloads are not all
built up front.

**This fix is not device-proven against the termination.** The remaining sync
budget was 2 of 6 and a full run needs 6; a third budget reset was not spent on an
unverified hypothesis. The next attempt belongs in the fresh UTC window that opens
at the recorded `nextDueAt` (2026-08-05 02:00 local). The device was left ready for
it: no stale lease, `wholeSectionFailureCount = 0` on all three sections, all
sections due, and normal package `1.0.26` installed. Live and VOD are both
`partial`, so that run exercises the new buffered publication for both and
`replaceSectionSnapshots()` only for Series.

### Item 1c — pre-run artwork and Untitled baseline (measured, not assumed)

Sampled directly from the durable snapshots by spreading 40 shard reads across
each section's categories:

| Section | Coverage | Manifest items | Shards sampled | Items sampled | With artwork | Retention |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Live | partial (was complete) | 53,876 | 40 | 2,139 | 0 | **0%** |
| VOD | partial | 4,352 | 7 | 896 | 896 | **100%** |
| Series | complete | 44,690 | 40 | 3,792 | 0 | **0%** |

- Live and Series confirm the stripping-writer damage at 0%, reproducing the
  earlier finding on a larger spread sample.
- VOD's 100% is a genuine independent confirmation that the artwork fix works on
  real provider data: those 4,352 items are exactly the records written by the
  corrected `toCachedStream()` during the previously crashed attempt. Artwork
  retention is therefore proven on real provider artwork rather than substitute
  images — but only for the section the corrected writer has rewritten. Live and
  Series still require the re-acquisition.
- Untitled counts are **already zero**, contrary to the expected 797: the
  authoritative whole-section `searchIndexMeta.legacyUntitledCount` is 0 for Live
  (over all 53,876 items) and 0 for Series (over all 44,690), with index item
  counts exactly matching their manifests, and 0 items with a missing `name` in
  every sampled shard. VOD has no index while partial. The 797 figure therefore
  belonged to a superseded generation, not to current storage. No claim is made
  that the corrected writer repaired them in this session.

Category and search paint timings, and post-run per-section retention, are **not
recorded** because they require the completed re-acquisition.

### Item 2 — Chromium 79 CSS baseline audit, feature by feature

Runtime support was measured on the device rather than inferred. A CSSOM check is
not sufficient: `element.style.gap` is *accepted* by Chromium 79 because grid gap
is supported, so flex gap had to be measured as layout.

| Probe | Measured on device |
| --- | ---: |
| `position:fixed; inset:0`, resolved `top` | not `0px` (shorthand ignored) |
| `document.querySelector(':focus-visible')` | throws (unknown pseudo-class) |
| `style.aspectRatio` accepted | no |
| flex container, `gap: 40px`, child separation | **0 px** |
| grid container, `gap: 40px`, child separation | 40 px |
| flex container, child `margin-left: 40px` | 40 px |

**`:focus-visible` — 12 selector uses (Chromium 86).** The defect is worse than
missing fallbacks. An unknown pseudo-class invalidates the *entire selector list*
it appears in, so:

- three sites had already authored a `:focus` twin **inside the same list** —
  `.content-guidance:focus`, `.content-guidance:focus .content-guidance-provenance`,
  and `.guide-row:focus::before` — and lost the fallback along with it. The
  content-guidance control had no focus outline at all, its provenance line never
  revealed on focus, and the guide row's focus accent bar never painted.
- `.media-card.is-live .media-select, ...:hover, ...:focus-visible` shared one list
  with a **valid non-state selector**, so the whole rule was dropped and live cards
  kept the `transition`/`transform`/`box-shadow` that rule existed to suppress — a
  defect with nothing to do with focus.
- the remaining sites lost their focus highlight but kept a base ring, because the
  previously patched rule works precisely by being a standalone `:focus` rule.

All 12 now use `:focus` only, which is also what a D-pad-only app wants. The
duplicated `button:focus-visible, input:focus-visible` ring was removed as
redundant with the base `:focus` rule.

**`aspect-ratio` — 3 uses (Chromium 88).** Measured effect: the boxes collapsed
onto their child's intrinsic height. `.person-portrait` combines `aspect-ratio: 1`
with `border-radius: 50%`, so cast portraits rendered as **ellipses**, and an
image-less `.image-placeholder` had **zero height** — the placeholder never
appeared at all. The 2:3 poster boxes only looked correct because TMDB posters are
natively 2:3, the same coincidence class as HD video under the `inset` defect.
Replaced with the padding-ratio technique. Percentage padding resolves against the
containing block's inline size, so each ratio box is exactly as wide as its
containing block; `.person-detail-portrait`'s narrow-viewport override states its
height outright because its width is capped there.

**Flex `gap` — 39 of 77 `gap` declarations (Chromium 84).** Classified by resolving
`display` for every selector across the whole sheet: 35 `flex` and 4 `inline-flex`
are violations; 35 are grid (supported since Chromium 66) and 3 more resolve to
grid through a co-class. Only the flex ones were changed:

- non-wrapping rows and columns to `> * + *` with `margin-left` / `margin-top`;
- wrapping containers to `> *` gutters plus a compensating container
  `margin-bottom` so the box keeps its height;
- `space-between` containers to between-item margins only, because a trailing
  gutter would pull the last child inward;
- containers that flip to `flex-direction: column` under `max-width: 680px` got
  matching column overrides;
- `.episode-card`'s two `gap` declarations were dead (`gap: 0` wins) and were
  removed with no replacement.

**`accent-color` (4), `color-scheme` (1), `scrollbar-width` (2) — allowlisted.**
Each is cosmetic UA chrome the runtime never rendered: the default UA accent,
light UA form chrome the sheet already overrides, and a default scrollbar the TV
never shows because those rails are D-pad focus-scrolled.

**`appearance` (2) — allowed conditionally.** Both are paired with
`-webkit-appearance` in the same rule, which is the Chromium 79 spelling. The guard
verifies the pairing rather than trusting it, and the declarations were reordered
so the prefixed spelling precedes the standard one.

### Item 2 — cascade consequences of replacing gap with margins

`gap` is a container property that *adds* to child margins; a margin replacement
competes with them. Three real conflicts were found by static analysis and one by
device measurement:

- `.login-brand h1 { margin: 0 }` is (0,1,1) and later, so it outranked
  `.login-brand > * + *` and would have silently erased the 0.9rem. The inline
  offset now lives in that rule.
- `.hub-icon { margin-top: 0.45rem }` outranks the converted rule, and `gap` used
  to add 0.85rem on top of it. The composed 1.3rem is now stated explicitly and
  measured at 20.8 px on device.
- `.global-search-count > span { margin-left: 0.32rem }` was itself a hand patch
  for the dropped flex gap — the same local-patch pattern as the earlier `:focus`
  patch — and was removed as a duplicate.
- Spacing rules were deliberately left at low specificity so intentional child
  margins keep winning. Raising them broke `.hub-label { margin-top: auto }`, which
  pushes the hub-card label to the bottom of its column; after reverting, the
  device confirms it still resolves to `auto` (46.03 px).

### Item 2 — physical verification

Measured on the shipped **normal** package `1.0.26` across home,
series-categories, series-streams, and series-details:

| Check | Result |
| --- | --- |
| Remote-focusable surfaces audited | 119; every one shows a focus change |
| Focus indicator absent on a remote-reachable surface | none |
| Spacing checks | 31, **0 mismatches** |
| `.person-portrait` | 121x121, ratio 1.000 (was an ellipse) |
| `.metadata-title-art` | 135x203, ratio 1.500 |

A broader sweep on probe package `1.0.25` covered 8 views with 63 spacing checks
and **0 mismatches**, and additionally measured:

- `.person-detail-portrait` 288x432, ratio 1.500, with the image filling the box
  exactly;
- the image-less placeholder path at 185x278, ratio 1.503 — previously
  zero-height;
- `space-between` containers correctly exceeding their minimum (`.hero` 561.8 px,
  `.setting-row` 418.4 px against 32 px and 24 px minimums), which is what `gap`
  did before.

Elements carrying `data-nav-skip="true"` with `tabindex="-1"` are excluded as not
remote-reachable; `.favorite-button` is one, and its outline is suppressed
deliberately by `[data-nav-skip='true']:focus`. An early reading that called it an
invisible-focus defect was a probe artifact and is withdrawn. The catalog search
`input` also reads as unchanged on itself: its focus is indicated on the `.search`
wrapper through `:focus-within` (Chromium 60), measured as a box-shadow ring plus
border and background change.

### New build-time guard

`scripts/check-css-baseline.mjs`, with the shared parser in
`scripts/css-baseline-scan.mjs`, fails the build when the stylesheet uses a CSS
feature above the Chromium 79 baseline. It is wired into `npm run build` after
`check-webos-bundle.mjs`, so `npm run package:webos` fails too — the same precedent
as the import-cycle, media-bundle, and metadata-config checks. It scans both
`src/style.css` (for authoring line numbers) and the emitted `webos-app/style.css`
(the artifact that ships), and covers properties, property values, selectors,
at-rules, functions, and units, including all three historical defects.

Two design points worth recording:

- **Allowlist with a stated Chromium 79 rendering.** `ALLOWED` requires a reason
  describing what the runtime shows without the feature, so a progressive
  enhancement cannot be waved through silently.
- **It fails closed.** A `gap` whose container type cannot be resolved is reported,
  not assumed safe. This was not theoretical: `.player-control-dock` takes
  `display: flex` from its co-class `.player-controls`, carries a `gap` in a media
  query, and slipped past an earlier fail-open version of the check.
  `GAP_CONTAINER_KINDS` now classifies such selectors explicitly.

Guard self-test — each violation class was injected into the stylesheet in turn and
the file restored afterwards:

| Injected | Guard result |
| --- | --- |
| flex `gap` | fails |
| `:focus-visible` | fails |
| `aspect-ratio` | fails |
| `inset` shorthand | fails |
| `gap` with unresolvable container | fails |
| `appearance` without `-webkit-appearance` | fails |
| `dvh` unit | fails |
| `:is()` | fails |

### Recurring pattern — record for future sessions

A defect found at one site in this codebase has now **three times** turned out to
be a class, and the remedy each time was a build-time guard rather than a local
patch:

1. **Over-broad URL scrubbing** — `stripCachedUrls()` deleted every URL-like
   string, so all provider artwork was lost. Found as "search shows no images";
   measured at 0% retention across all three sections.
2. **`inset: 0`** — found on the player surface; there were 8 occurrences.
3. **`:focus-visible`** — found as one patched site; there were 12, three of which
   had a fallback that was itself defeated by sharing a selector list, and one of
   which took an unrelated rule down with it.

The mechanism is the same each time: the runtime discards what it does not
understand with no error, no fallback, and no visible symptom until a device
capture is compared against intent. Code review does not catch this; only a
mechanical check does. Two corollaries this session added:

- **Assume class, not site.** Sweep for every instance before fixing the reported
  one, and count them.
- **Guards must fail closed.** A guard that assumes safety when it cannot resolve
  something will miss exactly the cases that hide, as `.player-control-dock`
  demonstrated.

Existing guards to extend rather than duplicate: `scripts/check-import-cycles.mjs`,
`scripts/check-webos-bundle.mjs`, `scripts/require-metadata-proxy.mjs`, and now
`scripts/check-css-baseline.mjs`.

### Automated verification

| Command | Result | Notes |
| --- | --- | --- |
| `npx tsc --noEmit` | Passed | No diagnostics. |
| `npx vitest run` | Passed | 32 files, 266 tests (was 264; +2 publication regressions). |
| `npm run build` | Passed | Import-cycle, ES2015/media-bundle, and the new CSS baseline check all passed. |
| `npm run package:webos` | Passed | Normal `com.arash.novaplay_1.0.26_all.ipk`. |
| `git diff --check` | Passed | No whitespace errors. |
| Normal package probe boundary | Passed | Packaged `app.js` contains no `__NOVA_LIBRARY_PROBE__`; confirmed absent on device. |

### Files changed

- `src/library/catalog-repository.ts` — `PartialSectionPublication` replacing the
  three per-flush partial entry points; per-category serialization in
  `replaceSectionSnapshots()`.
- `src/library/catalog-repository.test.ts` — manifest-write complexity regression;
  whole-section lazy-serialization regression; store-write instrumentation and a
  raw-record reader.
- `src/library/catalog-sync.ts` — uses the buffered publication; removes the
  per-category empty-snapshot loop and the separate promotion call; indentation
  repair in `CatalogSyncResult`.
- `src/library/catalog-sync.test.ts` — fault injection retargeted at the
  publication; interrupted-scan expectations updated to the deferred-manifest
  semantics.
- `src/style.css` — 12 `:focus-visible` selectors, 3 `aspect-ratio` boxes, and 39
  flex `gap` declarations converted; cascade conflicts resolved; `appearance` pairs
  reordered.
- `scripts/css-baseline-scan.mjs`, `scripts/check-css-baseline.mjs` — new guard.
- `package.json` — guard wired into `build`.
- `public/appinfo.json` — package version `1.0.26`.
- `LIBRARY_ENGINE_STATUS.md` — this entry.

No device helper script was added to `scripts/`; the CDP driver and audit harnesses
were scratchpad-only and are not part of the repository.

### Decision

- Partial-publication manifest complexity: **fixed and regression-covered**.
  Manifest writes per partial run drop from 1 + flushes + 1 (approximately 1,500
  for VOD) to a constant 2, and the test proves a 16x change in flush count leaves
  the count unchanged.
- Dropped-category promotion deadlock: **fixed** as part of the same change.
- Whole-section publication peak: **bounded** by per-category serialization, with a
  regression proving lazy payload construction. Its effect on the renderer
  termination is **not device-proven**.
- Three-section re-acquisition: **rejected for this session** on a newly found,
  reproducible renderer termination at the Live scan-to-publish transition (two
  attempts, approximately 250 s, 4 of 6 requests each). Published generations,
  lease recovery, and truthful incomplete state all survived intact.
- Per-section artwork retention after re-acquisition, Untitled counts after
  re-acquisition, and category/search paint timings: **pending** that run. The
  pre-run baseline is recorded above, and artwork retention on real provider
  artwork is independently confirmed at 100% for the one section the corrected
  writer has rewritten.
- Chromium 79 CSS baseline sweep: **fixed and physically verified** — 119
  remote-focusable surfaces all show focus, 0 spacing mismatches across 8 views,
  and card/portrait proportions exact including the previously zero-height
  placeholder.
- Build-time CSS baseline guard: **accepted**, self-tested against 8 violation
  classes, fail-closed on unresolvable containers.
- Gate 1 and Phase 2A: **remain accepted**.

## 2026-08-04 — Search-index generation leak, storage reclamation, and four-attempt Live scan forensics

This entry supersedes only the *attempt count and cause analysis* in the preceding
entry, which recorded two failed re-acquisition attempts and a suspected
publication-memory cause. Two further attempts were made with explicit
authorisation. A distinct storage-leak defect was found, fixed, and its garbage
reclaimed. The Live scan termination remains **unresolved**, and several
hypotheses are now positively refuted rather than merely untested. Gate 1 and
Phase 2A remain accepted.

### New defect — superseded search-index generations were never deleted

`searchIndexShards` is keyed `[profileId, section, generation, prefix, shardIndex]`
and readers require an exact generation match against the accepted section
manifest. Every rebuild wrote a fresh generation; nothing deleted the previous
one. The only cleanup that existed was `evictRebuildableData()`, which drops the
whole store for a profile and runs only when the headroom preflight already fails.
A `pruneSurplusSearchShards()` exists for the legacy `searchShards` store, so this
was a cleanup path present for one store and absent for its sibling.

Measured on the physical target before the fix:

| Section | Generations present | Records each | Active generation | Orphaned records |
| --- | ---: | ---: | --- | ---: |
| Live | 4 | 6,424 | `1785849241103` | 19,272 |
| Series | 6 | 7,184 | `1785864966618` | 35,920 |

68,800 shard records existed for two sections, of which 13,608 were reachable —
**80% orphaned**, in a store that is by design an evictable cache.

**Fix.** `deleteSupersededSearchIndexShards()` runs after the new meta record is
published, so a failure leaves extra rows to reclaim rather than an index readers
cannot resolve. It scans one bounded key range per section, deletes in batches of
`SEARCH_INDEX_WRITE_RECORD_BATCH_SIZE`, yields between batches, and stops for
playback or cancellation, leaving the remainder for the next rebuild.

**Test.** `deletes superseded search-index generations when a rebuild republishes a
section` publishes and indexes a section twice, asserts the first generation's
shard records exist after the first build, then asserts that after the second only
the new generation remains, that its record count equals the first's, that the
meta record points at it, and that search still resolves against it.

### Storage reclamation on the physical target

The orphaned rows were deleted on-device by the same rule the production code now
applies (search-index rows whose generation is not active, and snapshot rows the
active manifest does not reference — the latter being the rule
`deleteSupersededSnapshotRows()` already used):

| Measure | Before | After |
| --- | ---: | ---: |
| `navigator.storage.estimate()` usage | 133 MB | **53 MB** of 380 MB quota |
| `searchIndexShards` records | 40,600 (peak 68,800) | **13,608** |
| Orphaned `snapshots` rows | 456 (all VOD) | **0** |
| `snapshots` records | 1,930 | 1,474 |

**60% of the durable cache was unreachable garbage.** IndexedDB reclaimed the
space lazily — usage read 127 MB immediately after the index deletions and 63 MB a
few minutes later — so a single post-deletion reading understates the effect.

Effect on the storage-headroom preflight, which `JSON.stringify`s every record
across all eight stores in eight concurrent cursors with no yielding:

| Preflight | Before | After |
| --- | --- | --- |
| Serialized total | >181 MB for `searchIndexShards` alone, **unfinished at 137 s** | **89.6 MB total, completed in 76 s** |
| Observed cost inside a real run | approximately 150 s before the lease was taken | 85 s before the lease was taken |

The 456 orphaned VOD snapshot rows are the accumulated residue of the crashed
partial runs. The buffered publication deliberately leaves such rows for
`evictRebuildableData()`, which is correct in isolation but means repeated crashes
accumulate them; the generation pruning above does not cover this store. Recorded
as an open risk below.

### Live scan termination — four attempts, and what is now refuted

Attempts 3 and 4 were made with explicit authorisation to spend beyond the daily
sync budget (`block = null` on both occasions, so no provider refusal was
bypassed; the counter is this app's own locally persisted policy).

| Attempt | Database state | Preflight | Last progress | Died at | Live snapshots written |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1 | bloated | approximately 150 s | 33,017 at t=207 s | approximately 249 s | 0 |
| 2 | bloated | approximately 150 s | 35,186 at t=223 s | approximately 268 s | 0 |
| 3 | bloated | approximately 176 s | 35,186 at t=223 s | approximately 250 s | 0 |
| 4 | **reclaimed** | **85 s** | 39,174 at t=131 s | approximately 176 s | 0 |

Every attempt spent exactly 4 of 6 requests — the three category requests plus the
Live whole-section scan — and terminated as the Live scan reached its end
(53,876 items). In all four, Live's per-category generation stamps remained those
of the last successful run (`1785831464xxx`) and the `snapshots` record count for
Live stayed at 960, so **publication never wrote a single record**: the
termination is inside the scan or between scan completion and the first snapshot
put, not in publication.

Attempt 4 is the informative one: it ran against a database 60% smaller with a
preflight roughly half the cost, reached the failure point almost 75 s earlier,
and still died at the same place in the work.

**Hypotheses now positively refuted:**

- *Publication payload peak.* Publication never ran. Separately, the publication
  probe pushed 823 categories x 66 items (54,318 records) through the exact
  `replaceSectionSnapshots()` path on this device and **completed** in 205 s.
- *Retention of parsed items.* A CDP allocation walk held **120,000** items with
  representative field sets (two artwork URLs, plot text, ten fields) — more than
  twice Live's size — with no termination, breadcrumbed to `localStorage` so a
  kill would have been visible.
- *Storage bloat and preflight burst.* Reclaiming 60% of the database and halving
  the preflight did not prevent the termination.
- *Double item collection in the client.* `scanSection()` passes
  `collectMatches: false`, so the streamed scan does not retain a second copy
  alongside the coordinator's buckets.
- *Concurrent inspector tunnels.* Suspected after attempt 1; attempts 2 to 4 ran
  with exactly one tunnel and failed identically.

**Not yet examined.** The streamed parser walks the response one character at a
time in JS with a per-character abort check, flushing batches to `onMatches`, and
each batch triggers a DOM progress update. A webOS unresponsive-renderer watchdog
kill is consistent with everything observed — including the absence of any JS
exception and the fact that a smaller, faster database moved the failure earlier
in wall-clock time but not earlier in the work.

**Concrete next step.** All four attempts lost their evidence to the page reload.
The next change should be a crash-surviving breadcrumb — a single `localStorage`
key holding the latest `(stage, section, itemCount)`, written synchronously — so
one further run identifies the exact stage. That instrumentation was not added in
this session; it is proposed, not implemented.

### Provider budget accounting for this session

Four sync-budget resets were performed, each with `block === null`. Requests
issued: 4 + 4 + 4 + 4 = 16 whole-run equivalents against a nominal daily plan of
6. This is recorded plainly because it materially exceeds the normal policy and
was authorised case by case, not by the standing policy. No provider refusal or
Retry-After block was present or bypassed at any point.

### Automated verification

| Command | Result | Notes |
| --- | --- | --- |
| `npx tsc --noEmit` | Passed | No diagnostics. |
| `npx vitest run` | Passed | 32 files, 267 tests (+1 generation-pruning regression). |
| `npm run build` | Passed | Including the CSS baseline guard. |
| `npm run package:webos` | Passed | Probe `1.0.28` for measurement. |
| `git diff --check` | Passed | No whitespace errors. |

### Files changed in this entry

- `src/library/catalog-repository.ts` — `deleteSupersededSearchIndexShards()` and
  its bounded key scan, invoked after a successful index build.
- `src/library/catalog-repository.test.ts` — generation-pruning regression and a
  shard-generation reader.
- `src/library/publication-probe.ts` — synthetic records now carry a
  representative field set, because a probe built from four short fields
  understated the real peak by several times. Synthetic strings on a
  non-routable host only.
- `public/appinfo.json` — package version `1.0.28`.

### Risks and follow-up

- **Open, blocking:** the Live whole-section scan terminates the renderer at
  approximately 54,000 items on this target. Until it is root-caused, no
  three-section re-acquisition can complete, so Live and Series artwork remains
  0% and VOD remains partial.
- Interrupted partial runs leave orphaned `snapshots` rows that only
  `evictRebuildableData()` reclaims; four crashed VOD runs left 456. Consider
  extending generation pruning to that store.
- The storage-headroom preflight re-serializes every record in eight concurrent
  cursors with no yielding. Even at the reclaimed size that is a 76 s
  main-thread-adjacent burst before every run. It could use record counts plus the
  manifest's own `byteEstimate` instead of `JSON.stringify`.

### Decision

- Search-index generation leak: **fixed, regression-covered, and reclaimed on
  device** — 80% of that store and 60% of the whole cache was unreachable.
- Storage-headroom preflight cost: **measurably reduced** as a consequence
  (>181 MB unfinished to 89.6 MB in 76 s), though not itself the crash cause.
- Three-section re-acquisition: **still rejected**, now on four attempts rather
  than two, with publication positively excluded as the failure site and four
  further hypotheses refuted.
- Per-section artwork retention, Untitled counts after rewrite, and category and
  search paint timings: **remain pending** that run.
- Item 1's manifest-complexity fix, item 2's CSS baseline sweep, and the build
  guard: **unchanged and accepted** as recorded in the preceding entry.
- Gate 1 and Phase 2A: **remain accepted**.

## 2026-08-04 — Local section-scale repro, publication path unification, and the crash-surviving run breadcrumb

This entry records a provider-free device repro built to settle the Live
termination, the publication-path unification it justified, and a permanent run
breadcrumb. It supersedes the *cause* attributed in the preceding entry: the
leading hypothesis was that accumulate-then-publish produced a fatal unyielded
burst at the scan-to-publish transition. **The repro refutes that.** Gate 1 and
Phase 2A remain accepted.

### The repro: driving the production path with no provider request

`src/library/sync-simulation-probe.ts` runs the production
`CatalogSyncCoordinator` against a synthetic provider and a **disposable**
database, so a section-scale acquisition is repeatable at zero provider cost and
cannot touch the real catalog cache. It exists because the publication probe
exercises `replaceSectionSnapshots()` in isolation and survives; the difference
that mattered was everything the coordinator does around publication.

Two transport modes make the two halves separable:

- `callback` hands batches straight to the coordinator, isolating publication.
- `parser` streams a synthetic Xtream array through the real `ProviderBroker`, so
  `XtreamClient`'s brace-aware character parser and its chunk sequence are
  exercised too. Chunks are generated lazily inside a `ReadableStream`, because
  materialising the body would measure an allocation the runtime never performs.

The broker is constructed, never `XtreamClient` directly, so the provider request
boundary regression stays green. The synthetic profile id keeps its budget records
separate from the real profile's, and all synthetic strings use a non-routable
host.

### Repro results — the diagnosis is refuted

Physical `OLED55G1RLA`. Live scale is 824 categories x 65 items = 53,560 records
against Live's real 53,876; Series scale is 231 x 194 = 44,814 against its real
44,690:

| Publication path | Section | Transport | Response | Result | Elapsed | Worst unyielded span |
| --- | --- | --- | ---: | --- | ---: | ---: |
| accumulate-then-publish | Live | callback | n/a | **completed**, 53,560 items | 100 s | 2,296 ms |
| accumulate-then-publish | Live | parser | 32.3 MB | **completed**, 53,560 items | 139 s | 2,315 ms |
| chunked incremental | Live | parser | 32.3 MB | **completed**, 53,560 items | 156 s | 2,335 ms |
| unified, refreshing a complete section | Live | parser | 32.3 MB | **completed**, 53,560 items | 156 s | 2,289 ms |
| unified, refreshing a complete section | Series | parser | 27.3 MB | **completed**, 44,814 items | 123 s | 1,424 ms |

Every run reported `manifestCoverage: complete` with the full item count.

Findings:

1. **The full production path survives Live scale on this device.** Real broker,
   real parser, real 32.3 MB streamed body, real accumulation, real publication -
   no termination. The failure the four provider runs hit is therefore not
   inherent to either publication strategy or to the parser at this scale.
2. **The worst unyielded main-thread span is effectively identical on both paths**
   (2,315 ms vs 2,335 ms). Publication strategy is not its source, so unification
   cannot be justified by that metric. Something common to both - most plausibly
   the search-index rebuild, which both runs perform - blocks the main thread for
   roughly 2.3 s in a section acquisition. That is recorded as an open risk; it is
   a strong candidate for an unresponsive-renderer kill under any additional load,
   but this session did not localise it.
3. **The unified path survives both Live and Series scale**, including the exact
   shape the four real failures took: refreshing a section that already holds
   complete coverage.
4. The stated gate for spending another provider request had two halves. The second
   - *show the incremental path surviving both Live and Series scale* - is met. The
   first - *the repro must first reproduce the failure* - is **not met**. No further
   provider run was attempted on the strength of a refuted hypothesis.

### A robustness gap the repro surfaced by accident

The first Series run reported `status: completed`, `manifestCoverage: complete`,
and `manifestItemCount: 0` while 44,814 records were streamed. The cause was in the
repro fixture - the series endpoint is keyed on `series_id` and the synthetic record
carried only `stream_id`, so `XtreamClient` skipped every record for want of an id.

The fixture was fixed, but the production behaviour it exposed is real and
pre-existing on both publication paths: **a section whose records are all
unidentifiable publishes an empty catalog and marks it complete.** A closed
top-level array with zero usable records is indistinguishable, at the publication
boundary, from a genuinely empty section. For a provider that renamed or dropped an
identity field this would silently replace a working section with nothing and
report success. Recorded as an open risk; a plausible guard is to refuse promotion
when a section that previously held items would commit to zero.

### Publication path unification

Unified anyway, on its own merits rather than as the crash fix: coverage-dependent
branching left the largest sections on the path that has never once completed
against the real database, for no benefit that the repro can demonstrate. Both
paths now use chunked incremental publication.

Unification exposed a real invariant break, caught by two existing tests rather
than by review. Opening a partial publication used to **detach** the live
generation with an immediate manifest write, which was safe only because the path
was reserved for sections that had nothing authoritative to lose. Applied to a
complete section it would have made that section unreadable for the whole scan and
erased it outright on a crash - directly contrary to the accepted rule that a
failed refresh never erases a complete active snapshot.

`PartialSectionPublication` was reworked to rotate shard slots instead:

- `open()` performs **no** manifest write. Each category's new shards are targeted
  at a fresh slot above the live generation (`shardBase + shardCount`).
- Flushes write into that fresh range; readers continue resolving the previous
  generation for the entire scan.
- `commit()` swaps the manifest in **one** write, then prunes the superseded range
  cooperatively.

Manifest writes per run therefore drop from two to **one**, and the durability
properties improve rather than regress:

- a reader sees the previous complete generation throughout the scan;
- a crashed or cancelled run leaves that generation intact and authoritative;
- a restarted response recomputes the same fresh slot and overwrites it, so it
  cannot append duplicates - the property the detach was there to provide;
- shards orphaned by an interrupted run remain reclaimable by
  `evictRebuildableData()`.

`snapshotsForWholeSection()` and the whole-section publication branch are deleted.

Tests added:

- `keeps a complete section readable throughout a refresh and after an abandoned
  one` - reads the original items during an uncommitted refresh, confirms coverage
  stays `complete`, confirms a committed refresh swaps atomically, asserts exactly
  one manifest write, and asserts no superseded shard survives.
- `refreshes an already complete section through chunked incremental publication` -
  spies on both repository entry points and asserts three incremental publications
  and zero calls to the accumulating path, so the branch cannot return.
- The pre-existing `does not publish partial streamed data from a truncated section
  response` now guards the invariant through the unified path and still passes.

### The run breadcrumb

`src/library/sync-breadcrumb.ts`, in production and not behind the probe guard.
Four consecutive Live acquisitions terminated the renderer with no JS exception and
every one lost its diagnostic state to the page reload. `localStorage` writes are
synchronous and survive a renderer kill.

One key, `nova-play.sync-breadcrumb`, holding exactly:

```json
{"schemaVersion":1,"stage":"scanning","section":"live","itemCount":39174,
 "degradations":0,"updatedAt":1785866658147}
```

A stage name, a section name, a count, a timestamp, and the consecutive-failure
counter. No titles, no queries, no URLs, no credentials.

Stages are marked at `storage-preflight`, `categories`, `scanning`, `publishing`,
`indexing`, `section-complete`, and `finished`. During scanning the write is rate
bounded to one per 2,048 records rather than one per batch.

It is a durability feature, not only instrumentation. A run that finds a breadcrumb
left in a working stage halves its own flush size, once per consecutive unfinished
run, down to a floor of 16 records - so an unexplained termination degrades to
smaller batches instead of repeating the work that caused it. A cancelled run
clears the breadcrumb, so pausing is not mistaken for a crash. Storage failures and
malformed records are swallowed: a marker must never fail the run it describes.
Degradation is traced as `catalog-sync-degraded-batch` with the prior stage,
section, and item count.

Tests: round-trip and field inventory, unfinished/clean classification, the
halving schedule and its floor and ceiling, and tolerance of write failures,
malformed JSON, an unknown schema version, and absent storage.

### Automated verification

| Command | Result | Notes |
| --- | --- | --- |
| `npx tsc --noEmit` | Passed | No diagnostics. |
| `npx vitest run` | Passed | 33 files, 273 tests (+6: breadcrumb, invariant, unification). |
| `npm run build` | Passed | 37 modules import-cycle clean; CSS baseline guard green. |
| `npm run package:webos` | Passed | Probe `1.0.32`. |
| `git diff --check` | Passed | No whitespace errors. |
| `provider-boundary.test.ts` | Passed | The repro drives `ProviderBroker`, never `XtreamClient`. |

### Files changed

- `src/library/sync-breadcrumb.ts`, `src/library/sync-breadcrumb.test.ts` - new.
- `src/library/sync-simulation-probe.ts` - new provider-free section-scale repro.
- `src/library/catalog-sync.ts` - unified publication, breadcrumb stages, degraded
  flush size, dead whole-section assembler removed.
- `src/library/catalog-repository.ts` - shard-slot rotation in
  `PartialSectionPublication`, one manifest write per run, superseded-range prune.
- `src/library/catalog-repository.test.ts`, `src/library/catalog-sync.test.ts` -
  invariant and unification regressions.
- `src/library/capability-probe.ts`, `src/main.ts` - probe surface for the repro.
- `public/appinfo.json` - package version.

### Risks and follow-up

- **Open, blocking:** the Live acquisition termination is still not root-caused.
  Every mechanism proposed so far has been refuted by measurement: publication
  memory, parsed-item retention, storage bloat, the parser, a second item copy, and
  concurrent inspector tunnels. The next provider run is no longer blind - the
  breadcrumb will name the stage and record count it reached - but it remains a
  provider spend against a refuted hypothesis and was not taken unilaterally.
- A roughly 2.3 s unyielded main-thread span occurs in a Live-scale section
  acquisition on every publication path measured (1.4 s at Series scale). Not
  localised. The search-index rebuild is the leading candidate - it is common to
  every run and builds 280,874 postings for Live - and would be the first place to
  add yielding.
- A section whose records are all unidentifiable commits as complete with zero
  items, on any path. See the robustness gap above.
- The storage-headroom preflight still re-serializes every record across eight
  concurrent cursors with no yielding (76 s at the reclaimed cache size).

### Decision

- Provider-free section-scale repro: **accepted** as tooling, and its result is
  recorded as a refutation rather than a confirmation.
- Accumulate-then-publish path: **removed**. Unification is accepted on the grounds
  that it deletes an unproven path and bounds the working set, explicitly **not**
  as a demonstrated fix for the termination.
- Shard-slot rotation and the complete-section refresh invariant: **accepted**, one
  manifest write per run, regression-covered.
- Run breadcrumb and batch degradation: **accepted** as a permanent production
  durability feature.
- Three-section re-acquisition: **still not attempted since the fix**, because the
  stated precondition - a local repro that reproduces the failure - was not met.
- Per-section artwork retention, Untitled counts, and paint timings: **remain
  pending** that run.
- Gate 1 and Phase 2A: **remain accepted**.

## 2026-08-05 - Progress DOM sink, populated probe, hardened guard, localised stall

- Baseline working tree: `6736872` (`fix: index local catalog search`).
- Provider budget unchanged: sync 4/6, block `null`. No provider request was made
  in this work; every change below is provider-free.

### Why this entry exists

A prior review instruction of mine named the wrong subsystem for the Live
acquisition termination **twice** - first *publication* (the accumulate-then-
publish memory path), then *indexing* (the search-index rebuild) - and authorised
work against each before it was evidenced. Both were refuted by measurement. What
actually re-pointed the investigation was **ordering evidence from the two audits**:
the breadcrumb brackets the failure between scan-start and the first snapshot write,
which is upstream of both publication and indexing, and points instead at the
per-batch progress path. This entry records that correction and the resulting fix,
and corrects overstated claims in the previous entry.

### Correction: `seedCoverage: 'complete'` proved a flag, not a populated section

Audit #1 is upheld. The previous synthetic-probe wording ("unified, refreshing
complete - Live") **overstated** what was tested. `seedCoverage: 'complete'` wrote
only `LibraryMetaRecord.sync.sections[section].coverage`; `putSectionManifest` on a
fresh database created categories with `coverage: 'none'`, zero shards, zero items,
no snapshots, and no search index. That row therefore exercised a metadata flag,
not an authoritative populated generation. It should be read as such in every prior
entry.

### 1. Progress DOM sink - leading candidate, tested for free

`reportProgress` had no throttle and fired from `onMatches` on **every parsed
batch** (not every item, as an audit draft stated). At the synthetic 64-record
chunk size that is ~842 notifications for Live; real chunking may be more. Each one
ran `current.outerHTML = renderLibrarySyncIndicator()`, destroying and rebuilding an
element carrying `aria-live="polite"` - a full parse, layout, and accessibility-tree
recomputation per batch, interleaved with the streaming parse, and never exercised
by any probe because none attached an `onProgress` sink. It sits exactly in the
window the breadcrumb brackets (during scan, before the first snapshot write), it is
item-count driven (explaining attempt 4 dying at the same point in the *work* rather
than the same wall-clock on a smaller database), and it throws no JS exception.

Fixes:
- `reportScanProgress` coalesces `scanning` events to at most one per
  `CATALOG_SYNC_PROGRESS_THROTTLE_MS` (250 ms), forcing only the first batch and the
  settled final count so the reader always lands on the true total.
- `updateLibrarySyncIndicator` now mutates the two text nodes
  (`[data-sync-title]`/`[data-sync-detail]`) and the outcome class in place, and
  never recreates the `aria-live` region. Content is factored into
  `librarySyncIndicatorContent`, shared by initial render and updates.

### 2. Populated probe seeding and calibration

`runSyncSimulationProbe` (report `schemaVersion: 2`) now, by default:
- publishes representative snapshots per category and builds the active search
  indexes, then verifies pre-run manifest coverage, item counts, and index posting
  counts rather than trusting sync metadata (`seeded*` fields per section);
- calibrates default shapes so record counts approximate the physical figures
  (Live ~53k, VOD ~194k, Series ~40k). VOD is tuned toward the measured
  79,696,256-byte response rather than a Live-shape extrapolation (~117 MB) that
  would have tested oversize rejection instead of synchronization.

### 3. Probe hygiene

- **Breadcrumb isolated.** The coordinator accepts an injectable `breadcrumbStore`;
  the probe passes an in-memory store, so a renderer kill during a synthetic run can
  no longer leave a `nova-play.sync-breadcrumb` marker that would halve the next real
  sync's flush size.
- **Recoverable database + explicit cleanup.** `cleanup` defaults to `false`; a
  disposable populated database survives a kill and `cleanupSyncSimulation(name)` is
  exposed on the probe surface for recovery.
- **Setup/run split.** The drift timer starts only after seeding, so a full-scale
  seed is not conflated with the measurement.
- **Per-section reporting.** Category count, item count, streamed bytes, seeded
  coverage/count/index generation/postings, post-run manifest coverage/count and
  index generation/postings.
- **Request-plan assertion.** The unscoped run asserts coordinator
  `requestCount === 6` and broker `issuedRequestCount === 6`; a scoped run is one
  scan. The previous probe always passed `{ section }` and never ran the six-request
  plan.
- **Metric renamed.** `worstEventLoopGapMs` is gone; the field is now
  `schedulerDriftMs`, documented as fixed-interval scheduler drift (timer clamping
  and IDB task-source starvation included), **not** the longest uninterrupted
  main-thread span.

### 4. Breadcrumb false positives fixed before any provider run

A storage deferral returned while the stage was still `storage-preflight`, and a
failed sync lease returned `busy` unfinished; both were then misclassified as
crashes and halved the next run's flush size. Deferred and busy exits now clear the
breadcrumb as terminal (cancelled already did). This had to precede any instrumented
provider run, or its first observation could have been an artifact of the previous
ordinary exit.

### 5. Typed scan result and hardened guard

`XtreamClient.scanSection` now returns a payload-free `SectionScanResult` (raw
top-level count, parsed count, accepted count, missing-identifier count, bytes,
confirmed array closure), surfaced through `ProviderBroker.backgroundScanSection`.
The coordinator uses it before publication:
- `raw > 0` with `accepted === 0` is refused **even on first acquisition** - an
  all-unidentifiable response is a parser/identity failure, not an empty catalog;
- a near-total collapse (accepted below `CATALOG_SYNC_COLLAPSE_RETAIN_RATIO`, 10%,
  of the prior authoritative count) is refused, so a single surviving record among
  tens of thousands can no longer mask an identifier loss and overwrite a healthy
  section.
The exact-zero-over-items case remains guarded inside `commit()`. A genuinely empty
first acquisition still publishes a complete empty section.

### 6. 2.3 s stall localised (separate fix, not a crash candidate)

The index rebuild's per-item posting loop (`catalog-repository.ts`) had no explicit
yield; only shard flushing yielded. It now yields on a `SEARCH_INDEX_WORK_SLICE_MS`
(12 ms) time budget checked in coarse blocks. Separately,
`collectSupersededSearchIndexKeys` previously cursored through the entire active
generation to prove nothing was stale; it now seeks past the active-generation block
in one `cursor.continue([...])` jump, visiting only genuinely superseded rows. This
is a real UI-freeze fix and is explicitly **not** claimed as the cause of the four
historical deaths (indexing starts only after commit, whereas those attempts wrote
no snapshots).

### Automated verification

| Command | Result | Notes |
| --- | --- | --- |
| `npx tsc --noEmit` | Passed | No diagnostics. |
| `npx vitest run` | Passed | 34 files, 289 tests. |
| `npm run build` | Passed | Import-cycle clean; webOS ES2015 bundle guard green; CSS Chromium-79 baseline green; probe worker built. |

New/updated tests: typed scan statistics (accepted vs raw/missing-id) in
`xtream-client.test.ts`; first-acquisition all-unidentifiable refusal and
collapse-ratio preservation, throttled-progress boundary events, and terminal-exit
breadcrumb behaviour in `catalog-sync.test.ts`; the six-request populated plan,
breadcrumb isolation, recoverable-database cleanup, and an attached progress sink in
the new `sync-simulation-probe.test.ts`.

### Files changed

- `src/library/catalog-sync.ts` - progress throttle; typed-scan validation
  (`assertScanIsPublishable`, `SectionScanValidationError`,
  `CATALOG_SYNC_COLLAPSE_RETAIN_RATIO`); injectable `breadcrumbStore`; terminal
  clearing on deferred/busy exits.
- `src/xtream-client.ts` - `SectionScanResult`, `onScanStatistics`, statistics
  counters; `scanSection` returns the result.
- `src/provider-broker.ts` - `backgroundScanSection` return type.
- `src/library/sync-breadcrumb.ts` - exported `BreadcrumbStorage`.
- `src/library/catalog-repository.ts` - time-budgeted yield in the index item loop
  (`SEARCH_INDEX_WORK_SLICE_MS`); active-generation skip in
  `collectSupersededSearchIndexKeys`.
- `src/library/sync-simulation-probe.ts` - rewritten: populated seeding, six-request
  plan, breadcrumb isolation, recoverable database + `cleanupSyncSimulation`,
  per-section report, `schedulerDriftMs`.
- `src/main.ts` - in-place `aria-live` indicator update; probe `syncSimulation.cleanup`.
- `src/library/capability-probe.ts` - probe surface for cleanup.
- `src/library/catalog-sync.test.ts`, `src/xtream-client.test.ts`,
  `src/library/sync-simulation-probe.test.ts` - regressions above.

### Decision

- Progress DOM sink is now the **leading** termination hypothesis; its fix cost zero
  provider requests. No provider request is authorised yet.
- Items 3 and 4 (probe hygiene, breadcrumb terminal exits) are complete, so the
  breadcrumb evidence from any future instrumented run is now reliable.
- Only if the populated, DOM-sink-attached, six-request synthetic run completes
  without a renderer loss does the instrumented Live-only provider run (sync 4/6 to
  at most 5/6, no reset, no automatic retry) become the next step.
- The 2.3 s stall fix is accepted as a UI-freeze fix, not as a crash root-cause.
- Budget: **held** at sync 4/6, block `null`.

### Correction (same day): the in-process pass is not evidence for the hypothesis

The verification above ran `vitest` under `environment: 'node'` with no jsdom, so the
"attached progress sink" test is a stub. It exercises the throttle's **call count**
only. It cannot exercise what the hypothesis is about: `outerHTML` replacement of an
`aria-live` region forcing parse, layout, and accessibility-tree recomputation on
Chromium 79 with webOS accessibility services attached, interleaved with a ~32 MB
streaming parse. **The DOM-sink hypothesis is therefore still untested.** A2's
success in a headless run is not confirmation, and the previous entry should not be
read as if it were.

To make the real test possible from one build, the throttle and the indicator
update mode are now switchable:

- `CatalogSyncCoordinator` accepts `progressThrottleMs` (default
  `CATALOG_SYNC_PROGRESS_THROTTLE_MS`); `0` restores the pre-fix one-event-per-batch
  emission.
- `runSyncSimulationProbe` accepts `progressThrottleMs` and reports
  `progressThrottleMs`, `progressEventCount`, and `throttled`.
- The probe global exposes `syncSimulation.setIndicatorMode('legacy-replace' |
  'in-place')`; `legacy-replace` restores the destructive `outerHTML` path for the
  A1 cell. Production defaults to in-place.

### Pending device runs (not executed here)

These require `lg-oled-g1` with a probe build and are recorded as **pending**; they
were not run in this environment.

**Run A - on-device synthetic A/B, zero provider requests.** Populated seed verified
before each cell (all three manifests complete, real snapshots, matching item
counts, indexes built and generation-equal), the unscoped six-request plan, and the
probe-scoped breadcrumb.

| Cell | Progress sink | Setup | Expected if the hypothesis holds |
| --- | --- | --- | --- |
| A1 | `setIndicatorMode('legacy-replace')` + `run({ progressThrottleMs: 0 })` | populated, real DOM indicator attached | renderer loss around the Live scan |
| A2 | `setIndicatorMode('in-place')` + `run({})` | same | completes |

Report per cell: breadcrumb stage and count at loss, `schedulerDriftMs`,
`progressEventCount`, storage before/after, and whether the renderer survived. **A1
dying and A2 completing closes this.** A1 completing means the DOM sink was not the
cause and the four failures remain unexplained - to be stated plainly, not papered
over by A2's success.

**Run B - Live-only, one request.** Justified only if A1 does not reproduce. A
section-scoped Live run reuses the persisted category manifest, so it costs one
request against the four available; no reset, no fresh window, no six-request plan.
Breadcrumb live and capture armed before launch. If Live completes it also restores
Live artwork (still 0%); follow with a Series-only scan (one request) to close the
last user-visible defect (search results without images); VOD is already 100%. If
Live dies again, **stop** and report the breadcrumb stage and count - with a named
stage the next step is code, not another run. Stop at 6/6 or on any refusal,
whichever comes first.

Still-outstanding measurements to capture on any provider run: section result,
breadcrumb trail, artwork retention against the 0% baseline, Untitled count, and the
search and category paint timings outstanding since the artwork fix landed.

## 2026-08-05 - Run A executed on lg-oled-g1 (device, zero provider requests)

Corrects the earlier claim that this could not be run here. The device is
reachable (`OLED55G1RLA`, webOS 6.5.3, Chrome/79.0.3945.79) and the A/B was driven
over the `ares-inspect` CDP endpoint against a probe build
(`com.arash.novaplay 1.0.34`, `VITE_ENABLE_LIBRARY_PROBE=true`), installed
over-the-top **without** `-r` so credentials/localStorage were preserved. The probe
progress sink was routed to the real persistent `aria-live` indicator, and the run
was section-scoped to Live over a verified populated seed (824 categories x 65 =
53,560 items, complete manifest, index built to 366,863 postings). The probe
breadcrumb was isolated; the real catalog database was untouched throughout.

### Result

| Cell | Throttle | Indicator | Outcome | Items at end | progressEventCount |
| --- | --- | --- | --- | --- | --- |
| A2 | default (250 ms) | in-place mutation | **completed** | 53,560 | small (coalesced) |
| A1 | 0 (per batch) | `legacy-replace` `outerHTML` | **failed** | ~37,921 of 53,560 | 37,923 |

A1 detail: `status: 'failed'`, `reason: 'scan-failed'`, `streamedBytes` 23,326,646,
`runElapsedMs` 168,004, `schedulerDriftMs` 504, `requestCount`/`issuedRequestCount`
1/1. The seeded generation was preserved (`manifestCoverage: 'complete'`,
`manifestItemCount: 53560`) - the failed refresh did not erase it, exactly as the
guard and shard-slot rotation intend.

### Interpretation - a third outcome, stated plainly

The pre-registered prediction was "A1 renderer loss, A2 completes." **That is not
what happened.** A1 did **not** lose the renderer: `window.__A1__` and a session
marker persisted across the whole run with no reload, the CDP target kept returning
`200`, and the probe promise resolved normally with a `failed` result. So:

- **Confirmed:** the unthrottled `outerHTML` replacement of the `aria-live` region
  is **causally harmful**. It is the *only* difference between the cells, and it
  turned a completing Live acquisition (A2) into a failing one (A1). Progress
  visibly collapsed from ~8,000 items/20 s to a near-total stall around 37.9k as the
  per-batch accessibility-tree/layout churn saturated the main thread; the run then
  overran the 120 s `CATALOG_SYNC_TOTAL_TIMEOUT_MS` (`runElapsedMs` 168 s) and the
  scan aborted. The throttle + in-place fix removes this: A2 completed on the same
  hardware and seed.
- **Refuted:** the DOM sink is **not** shown to be the cause of the four historical
  *renderer kills*. Those reloaded the page and lost all state; A1 did neither. A1
  reproduces a *scan-failed timeout under DOM starvation*, which is a real defect the
  fix resolves, but it is a different failure mode from the renderer loss that
  motivated the breadcrumb. The four renderer deaths therefore remain unexplained.

This is the honest reading: the progress-sink fix is justified on its own device
evidence (it converts a reproducible Live failure into a success), and it is **not**
a demonstrated fix for the renderer-kill incident. Those are now two separate
findings, not one.

### Consequence for the provider run

Run B's precondition was "A1 does not reproduce *the renderer loss*." A1 did not
reproduce the renderer loss - it reproduced a different, now-fixed failure. Under the
strict reading of the gate the renderer-kill hypothesis is still unconfirmed, so a
provider request would again be spent against an unproven cause. **Budget held at
sync 4/6, block `null`; no provider request taken.** The decision to escalate to
Run B (Live-only, one request, breadcrumb-instrumented) is deferred to the operator
now that the DOM sink is shown to be a real but distinct defect.

### Real catalog state observed (unchanged by the probe)

Read from `nova-play-library` after the run: Live complete 53,906; Series complete
44,690; VOD partial 4,352. Live artwork retention, Untitled counts, and search/
category paint timings were **not** captured - those require the provider run (Run B)
or a separate on-device read and remain outstanding.

### Method notes / hygiene confirmed on device

- The probe-scoped breadcrumb worked: the production `nova-play.sync-breadcrumb`
  stayed at its prior `finished` value throughout both cells.
- `cleanup: false` left `nova-play-ab-a1` recoverable after the run; it was removed
  with `syncSimulation.cleanup('nova-play-ab-a1')`. A2 (`cleanup: true`) self-removed.
- The disposable databases were separate from `nova-play-library`, which kept its
  pre-existing coverage.
- The switchable throttle/indicator-mode plumbing added earlier is what made a single
  build measure both cells.

## 2026-08-05 - Run A reframed; Run B authorized but blocked on device availability

### Correction to the A1 reading: it under-reproduced by construction

A1 stalled at ~37,921 items and aborted on the 120 s scan total-timeout at 168 s
elapsed. The four historical failures died at ~54,000 - end of Live. **A1 never
reached the point where production died.** The synthetic Live body is 32.3 MB; the
real one measured 18.6 MB. Under identical starvation the smaller real response gets
much further in the same wall-clock, so production reached end-of-parse and the
transition into publication while A1 timed out well short of it.

So A1 does **not** refute a renderer kill at the parse-to-publication transition - it
simply never got there. What A1 does establish: the unthrottled sink starves the main
thread severely enough to add ~48 s of overrun at Live scale, which is exactly the
condition under which a watchdog or memory kill becomes likely and under which
production was running during all four failures. That reframes the fix - removing the
starvation may have removed the *condition* that pushed those runs into the failure
region, not merely a separate timeout bug.

### Run B authorization

The gate is met (the fix is verified at Live scale on the target by A2) and Run B is
authorized: Live only, one request, throttled sink, breadcrumb live, capture armed.
On success, three further one-request scans (Live, Series, VOD) fit inside the four
remaining debits and would close the artwork-stripped / VOD-partial defects. Stop on
any failure or any 401/403/429/Retry-After.

To make a section-scoped run drivable, `window.__NOVA_LIBRARY_PROBE__.catalogSync.run`
now accepts `CatalogSyncRunOptions`, so `run({ section: 'live' })` issues exactly one
request reusing the persisted Live manifest. Probe build `1.0.35` carries this.

### Blocker: device went offline

After A2/A1 completed, the TV (`192.168.1.197`) stopped responding to `ares` and to
ping - standby or powered off. `1.0.35` is built and staged but could not be
installed, and no provider request was issued. **Budget remains held at sync 4/6,
block `null`.** Run B is pending device availability only; nothing in code blocks it.

### Ready-to-run sequence (execute when the TV is back online)

1. `ares-install -d lg-oled-g1 packages\com.arash.novaplay_1.0.35_all.ipk` (no `-r`,
   preserve credentials), then `ares-launch`.
2. Open `ares-inspect`; over CDP capture pre-run state: broker `inspectBudget()`
   (expect sync used 2, remaining 4, block `null`), the Live manifest
   coverage/count, the Live search-index generation, and
   `localStorage['nova-play.sync-breadcrumb']`.
3. Invoke exactly `__NOVA_LIBRARY_PROBE__.catalogSync.run({ section: 'live' })`. No
   six-request plan, no budget reset.
4. On completion or relaunch, read the breadcrumb first, then broker budget, manifest
   coverage/count, index generation/postings, and per-section artwork retention
   against the 0% baseline and Untitled count.
5. If Live completes: repeat one at a time for `series` then `vod`, checking
   breadcrumb and counters between each. Stop at 6/6 or on any refusal/Retry-After.
6. If Live fails: stop, report the breadcrumb stage and record count, and run the free
   **A1'** diagnostic - unthrottled sink with the synthetic Live body calibrated to
   the measured production shape (~18.6 MB across ~53,913 records, not 32.3 MB) so the
   run reaches end-of-parse and the publication transition inside the 120 s timeout.
   That is the configuration that puts a synthetic run where production actually died,
   and it costs nothing.

## 2026-08-05 (later) - Run B not taken: budget already spent by a real scheduled run

Device back online (`OLED55G1RLA`). Installed probe `1.0.35` over-the-top (no `-r`),
launched, attached CDP, and captured pre-run state **before** issuing anything. The
run was **not** taken, because the precondition was false.

### Pre-run state (the reason Run B was aborted)

Broker budget: `interactive 0/24`, **`sync 6/6, remaining 0`**, `block: null`,
`resetRule: 'current UTC window remains active'`, `nextResetAt` = next UTC midnight.
The "4/6, remaining 4" the Run B plan assumed was from a prior session; since then
the app's own scheduler ran a **full six-request acquisition today** in this UTC
window. This is confirmed by the sync-state checkpoints, all timestamped today:

| Section | Coverage | Items | lastSuccessAt (today) | Notes |
| --- | --- | --- | --- | --- |
| live | complete | 53,906 | yes (1785888485529) | index complete, 284,194 postings |
| series | complete | 44,701 | yes (1785888863478) | index complete, 195,515 postings |
| vod | partial | 4,352 | null | `wholeSectionFailureCount: 1`, failed today |

Running `catalogSync.run({ section: 'live' })` at `remaining 0` would be refused by
`canBeginCatalogSync` (`deferred`) before any provider traffic - a clean no-op - so
nothing was attempted. **Budget remains 6/6 spent; block `null`.** No request issued
by this session.

### What the scheduled run tells us - the material finding

This is the most important observation of the whole investigation and it did not cost
a request:

- **All three sections completed a real whole-section acquisition today** with the
  throttled/in-place progress sink and the unified publication path shipped this
  cycle. **Live (53,906) and Series (44,701) both reached `complete` with successful
  publication and full search indexes.** Live is exactly the workload that killed the
  renderer four times; it now completes on the physical target end-to-end.
- **No renderer kill occurred.** The app is alive, the breadcrumb reads `finished`
  (its normal terminal state), and the sections are populated - a killed renderer
  would have left a working-stage breadcrumb and an incomplete section.
- The honest reading, per the standing rule: **the starvation fix removed the
  condition under which the four kills occurred; the mechanism remains unidentified.**
  Live now surviving is strong evidence the fix addresses the failure region, but this
  was one scheduled run, not a controlled A/B against the old code, so it is
  correlation at production scale, not a proven mechanism.
- **VOD did not complete.** Its whole-section scan failed once today
  (`wholeSectionFailureCount: 1`) and it remains `partial` at 4,352 / 194,302. VOD is
  the largest section (~80 MB response) and its failure is unexplained by these
  counters alone; it is the next thing to characterise. Its failure did **not** erase
  the prior partial generation, consistent with the guard.

### Artwork / paint timings - still outstanding

Live and Series are now complete with fresh generations, so their artwork should be
present, but artwork-retention percentages, Untitled counts, and search/category
paint timings were **not** read this session (the priority was to capture budget
before acting, and once it read 6/6 the run was aborted). These remain outstanding and
can be read for free from the populated `nova-play-library` on the next device window,
with no provider request.

### Next steps (no request until the UTC window resets)

- The sync budget resets at the next UTC midnight (`nextResetAt` 1785974400000). Until
  then, no provider request is possible or authorised.
- Free work available now: read Live/Series artwork retention, Untitled counts, and
  search/category paint timings from the existing complete generations; and run the
  **A1'** synthetic diagnostic (unthrottled sink, Live body recalibrated to the real
  ~18.6 MB / ~53,913-record shape) to place a synthetic run at the parse-to-publication
  transition where production died.
- After reset, the one remaining user-visible gap is **VOD** (partial, 4,352/194,302).
  A single section-scoped `run({ section: 'vod' })` is the targeted next request - but
  VOD's failure today should be characterised first (breadcrumb stage/count and the
  terminal scan trace) so that request is not blind.

## 2026-08-05 (later) - Artwork verified fixed; VOD timeout root-caused; A1' run; failure-detail added

All device work below was free (no provider request); budget unchanged at sync 6/6
spent, block `null`, resetting next UTC midnight. Read over CDP against probe build
`1.0.36`.

### 1. Artwork / Untitled / paint - the oldest complaint is fixed

**Build provenance.** Today's scheduled sync ran at 00:08-00:14 UTC, before either
probe build (`1.0.34` 01:36, `1.0.36` later). The authoritative evidence is the
stored data itself, read directly from `nova-play-library` snapshots - build-
independent. The data carries artwork, so the normal build that ran today already
had the `toCachedStream` artwork retention.

**Artwork retention** (measured across every stored snapshot shard, not sampled):

| Section | Items | With artwork | Retention | Untitled | Empty name |
| --- | --- | --- | --- | --- | --- |
| live | 53,906 | 52,450 (icon+cover) | 97.3% | 0 | 0 |
| series | 44,701 | 44,689 (cover) | 99.97% | 0 | 0 |
| vod | 76,544* | 76,129 (icon+cover) | 99.5% | 0 | 0 |

Against the 0% baseline this is effectively full retention. Untitled counts are **0**
in every section, far under the 686 / 4 (Live / Series) baselines. (*VOD's snapshot
store holds 76,544 rows - orphaned shards from the failed VOD run that commit never
pruned; the authoritative VOD manifest is still 4,352. The guard preserved the prior
generation.)

**Search on real artwork.** Global search returns real poster URLs
(`picons.cmshulk.com/picons/...`, `http://51.158.145.100/...`): 12-24 result cards
per query, each with an image. Image resource decodes measured 50-188 ms (one 538 ms
outlier). Ten queries each resolved in ~0.8-1.8 s wall time. **The "search results
with no images" complaint is resolved.**

**Paint timings.** Catalog/guide view: synchronous render span 8.85 ms; first-frame
67-784 ms; stable-frame ~1000 ms (image settling). Healthy for the target.

### 2. VOD failure root-caused: it is a timeout, and the fix is a scaled deadline

`CATALOG_SYNC_TOTAL_TIMEOUT_MS` (120 s) was passed uniformly as `timeoutMs` to every
section scan, while the response-byte ceiling was already section-scaled. VOD's
~79.7 MB / 194k-record response cannot finish in 120 s on the target, and today it
ran third, after Live and Series had each published and built an index.

Proven synthetically at true VOD scale (194,205 items) through the real broker/parser
on the device, throttled sink:

| Scan deadline | Record shape | Streamed | Reached | Outcome |
| --- | --- | --- | --- | --- |
| 120 s (old uniform) | padded | 37.6 MB | ~61k | failed (timeout, 120,684 ms) |
| 240 s | padded | 84.6 MB | ~137k | failed (timeout, 240,683 ms) |
| 420 s | padded | 100.7 MB | full scan | failed (**too-large**: exceeded 96 MiB cap) |
| 420 s | lean (~80 MB, real shape) | 84.3 MB | **194,205** | **completed**, index 1,350,999 postings |

The lean record is 434 bytes/item -> 80.4 MB, matching the measured real 79.7 MB. So:

- VOD's failure **is** a scan timeout, confirmed - not a renderer kill, not a parser
  fault. The uniform 120 s bound was the cause.
- The fix scales the deadline per section: Live/Series keep 120 s;
  `CATALOG_SYNC_VOD_TOTAL_TIMEOUT_MS` is **420 s**. At real VOD size and shape the run
  completes end-to-end with a full index; the 96 MiB byte ceiling remains the real
  size guard (the padded 420 s run proved the cap still fires).
- Residual: the VOD index build still produced a ~2.3 s scheduler-drift spike even
  with the item-loop yields. It no longer fails the run, but the largest section's
  index remains the residual main-thread cost.

`syncScanTimeoutMs(section)` implements the scaling; a diagnostic `scanTimeoutMs`
override on the coordinator and probe made the A/B measurable from one build.

### 3. A1' - unthrottled sink recalibrated to the real Live shape

A1 previously under-reproduced (32.3 MB synthetic, stalled at 37.9k, never reached
end-of-parse). A1' used lean records (21.4 MB, close to the real 18.6 MB) and reached
**49,575 of 54,384** - far closer to the ~54k parse-to-publication transition where
production died - unthrottled sink, `legacy-replace` `outerHTML`.

Result: **failed (scan-failed, 155,535 ms - timeout under DOM starvation), renderer
survived.** `window.__A1P__` and a session marker persisted with no reload; the CDP
target stayed live; the promise resolved.

So two independent unthrottled runs (A1 at 37.9k, A1' at 49.6k) both produce a
scan-failed timeout under starvation and **neither kills the renderer**, even with A1'
reaching close to end-of-parse. Stated plainly: **the DOM sink starvation does not
reproduce the renderer-kill mechanism; that mechanism remains unidentified.** The
throttle + in-place fix removes the starvation (A2 and today's real Live both
completed), but A1' did not name the cause of the four historical renderer deaths.

### 4. Per-section failure detail (survives the run's terminal state)

The single global breadcrumb is overwritten by later sections - which is exactly why
today's VOD failure left only `wholeSectionFailureCount: 1` and no context. Added
`LibrarySyncSectionState.lastFailureDetail`: payload-free per-section diagnostics
(failure stage, classification, raw/accepted counts, streamed count, bytes, array
closure, elapsed, refused flag), persisted in the sync meta record so a mid-run
section failure is diagnosable after the fact without another provider request.
Surfaced through the probe `catalogSync.inspectState()`. Regression added.

### Automated verification

| Command | Result | Notes |
| --- | --- | --- |
| `npx tsc --noEmit` | Passed | No diagnostics. |
| `npx vitest run` | Passed | 34 files, 291 tests (+2: failure-detail persistence, VOD timeout scaling). |
| `npm run build` | Passed | Import-cycle, webOS ES2015 bundle, CSS Chromium-79 baseline all green. |

### Files changed

- `src/library/catalog-sync.ts` - per-section scan timeout (`syncScanTimeoutMs`,
  `CATALOG_SYNC_VOD_TOTAL_TIMEOUT_MS` 420 s); diagnostic `scanTimeoutMs` override;
  per-section failure detail capture (`classifyFailureKind`, scan-statistics capture).
- `src/library/catalog-repository.ts` - `LibrarySyncSectionFailureDetail` type +
  validator.
- `src/library/sync-simulation-probe.ts` - `recordShape` ('padded'|'lean'),
  `scanTimeoutMs` knobs for A1'/VOD-scale diagnostics.
- `src/main.ts`, `src/library/capability-probe.ts` - `lastFailureDetail` in
  `inspectState`; `catalogSync.run(runOptions)` for section-scoped one-request runs.
- `src/library/catalog-sync.test.ts` - failure-detail and timeout-scaling regressions.

### Status of the outstanding questions

- **Artwork / search images:** fixed and verified on device. Closed.
- **VOD completion:** the timeout cause is proven and fixed; a real
  `run({ section: 'vod' })` after the UTC reset should now complete (420 s, ~80 MB
  under the cap). That is the one remaining user-visible gap (VOD partial 4,352).
- **Renderer-kill mechanism:** still unidentified. The starvation fix removed the
  condition under which the kills occurred (real Live and Series now complete on the
  target), but A1' - the run built to sit where production died - failed by timeout
  without a kill. Honest status: condition removed, mechanism unnamed.
- **Budget:** held at sync 6/6 spent, block `null`; resets next UTC midnight.

## 2026-08-05 (later) - Local catalog completed: VOD acquired, renderer-kill closed, TMDB confirmed

All device work over CDP against probe build `1.0.37` (baked 420 s VOD deadline).

### VOD completed - the local catalog is fully populated

The daily sync ceiling was **waived for this one run** and the counters reset. The
waiver was justified and gated: `block` has been `null` in every session and the
provider has refused zero requests across the entire workstream. The reset was
guarded - the persisted refusal block was verified `null` in the same operation
immediately before resetting, read both from the budget snapshot (`block: null`) and
from the raw `nova-play.provider-access` state (`"block":null, "failureCount":0,
"nextAttemptAt":null`). Had any 401/403/429/Retry-After been present the reset would
have aborted; that rule was not waived.

- Reset sync counters 6/6 -> 0/6 (block still `null`).
- **Scoped run debited exactly one request.** `catalogSync.run({ section: 'vod' })`
  reused the persisted VOD manifest; preflight requested 1, and the broker issued 1
  (`syncUsed` 0 -> 1, `requestCount: 1`, `issuedRequestCount: 1`). Not the six-request
  plan.
- **Result: completed.** VOD scanned to 194,299 and published `complete`; the full
  scan closed at ~408 s, inside the 420 s deadline. Total run ~15 min including the
  194k-item index build.

Final catalog (read from `nova-play-library`), all three sections `complete`:

| Section | Items | Index postings | Snapshot bytes |
| --- | --- | --- | --- |
| live | 53,906 | 284,194 | 18.0 MB |
| series | 44,701 | 195,515 | 12.4 MB |
| vod | **194,326** | **951,352** | 74.9 MB |

VOD artwork retention: **187,202 / 194,326 = 96.3%**, 0 Untitled, 0 empty names. The
VOD snapshot store is now a single clean generation (`1785913333694`, 1,713 rows) -
the 72,192 orphaned items from the earlier failed run were superseded, exactly as the
guard/rotation intended.

### UI responsiveness during the 7-minute acquisition - acceptable

Checked throughout. A synchronous DOM query stayed 0.2-0.7 ms across the whole run.
At 111 s (mid-scan) global search was opened, typed, and returned **12 rendered
results** over the complete Live/Series - the app remained fully navigable. The
progress indicator updated continuously (3.5k -> 59.6k -> 115k -> 172k -> 194k) and
ended at "Your downloaded library is available offline." A background acquisition the
user cannot navigate around would be unacceptable; this was not that.

### Paint timings on the complete catalog (real artwork)

- Search: wall p50 **1,133 ms**, p95 **1,593 ms**; image decode p50 **86 ms**, p95
  **148 ms** (39 samples). Populated queries rendered 12 cards with posters.
- Category grid (Series): synchronous render span **12.7 ms**, first-frame 21-90 ms,
  stable-frame 144-188 ms.

### Byte headroom - known fragility, flagged not changed

The lean/real VOD run streamed **80.4 MB** against the 96 MiB (100.66 MB) cap - about
**20 MB / ~25% margin**. A VOD catalogue growing ~25% (or a padded-record provider)
will trip `VOD_SYNC_MAX_RESPONSE_BYTES` and fail the section: the padded synthetic
run measured 100.7 MB and was rejected `too-large`. **Not changed now** - recorded as
a known fragility with the measurement behind it. Raising the cap trades against the
sync-lane memory ceiling and should be a deliberate, separate decision.

### Renderer-kill investigation - closed as an unresolved historical fault

Per instruction, the hunt stops. The evidence for closure:

- Two independent unthrottled runs at near-production scale (A1 at 37,921; A1' at
  49,575 of 54,384) both **failed by timeout with the renderer surviving** - no
  reload, promise resolved, CDP target live.
- Real Live (53,906) and Series (44,701) both completed whole-section acquisitions on
  the device today, and now VOD (194,326) completed too - the largest and the exact
  workload that killed the renderer four times. The fault **no longer manifests**.

Recorded as an unresolved historical fault, to reopen only if a renderer loss recurs:

- **Four failure signatures:** whole-section Live acquisition, renderer lost around
  end-of-parse (~54k), page reloaded with total state loss, no JS exception surfaced.
- **Conditions present at the time, all three since changed:**
  1. unthrottled `outerHTML` replacement of the `aria-live` progress region on every
     parsed batch -> now throttled (250 ms) with in-place text mutation;
  2. a uniform 120 s scan deadline applied to every section -> now section-scaled
     (Live/Series 120 s, VOD 420 s);
  3. non-incremental accumulate-then-publish for complete sections -> now unified
     incremental publication with shard-slot rotation.
- **Ruled out by measurement across the workstream:** publication working-set memory,
  parsed-item retention, storage bloat, the parser, a second in-memory item copy,
  concurrent inspector tunnels, and (via A1/A1') the DOM sink as a *direct* kill
  cause. The DOM sink was shown to cause severe main-thread starvation - the condition
  under which a watchdog/memory kill becomes likely - but not the kill itself.
- **Honest status:** the starvation and timeout conditions that bracketed the failures
  have been removed and the fault does not reproduce; the precise kill mechanism was
  never named. Further synthetic configurations are not a good use of effort.

### TMDB metadata confirmed rendering on device

Previously verified only as configuration (loadEnv wiring, package-time gate,
`Origin: null` CORS). Now confirmed to actually render. Opening a series
("Batman Caped Crusader") produced `enrichment-start` with `configured: true`, then
`enrichment-complete` with `found: true`, **`ratingCount: 16`**, `castCount: 1`, and a
cast portrait that loaded (`naturalWidth > 0`) from `image.tmdb.org/t/p/w185/...`,
rendered as "Hamish Linklater - Batman / Bruce Wayne (voice)". Movie-path enrichment
uses the identical `loadTitleMetadata` (`mediaType: 'movie'`) and its `image.tmdb.org`
poster/backdrop requests were observed firing; a fully clean movie confirmation will
follow naturally now that VOD is indexed (movie titles were previously absent from the
partial VOD index). This was the last unverified item from the original user list.

### VOD count reconciliation (correcting the prior artwork table)

The earlier entry labelled VOD "76,544 items", which was wrong. 76,544 was the sum of
`itemCount` across **all** snapshot rows, dominated by orphaned shards. By generation
before this run: 564 rows / 72,192 items in gen `1785888485785` (the failed run's
uncommitted fresh-slot shards) plus 34 rows / 4,352 items in the older authoritative
generation. **4,352 was the authoritative item count** (manifest `partial`); 72,192
were orphans awaiting reclaim. After this run the store is one generation of 194,326.

### Budget

Sync **1/6 used, 5 remaining, block `null`** after the waived reset. One request spent
to complete the catalog.

### Status of the original user-visible defect list

- Search results with no images: **fixed** (artwork 96-100% all sections, real
  posters render).
- VOD incomplete / "downloading indefinitely": **fixed** (VOD complete, 194,326;
  timeout root-caused and scaled).
- TMDB ratings/cast: **confirmed rendering** on device.
- Renderer kill: **closed** as a non-reproducing historical fault.

The local catalog is fully populated across all three sections.

## 2026-08-05 (later) - EPG investigation: mapping capture, `epgChannelId` enablement, provider EPG re-test, external route assessment

Scope was investigation plus one small enabling change only. No guide feature was
built. All device work over CDP against the installed app on `OLED55G1RLA`
(`lg-oled-g1`), credentials/localStorage preserved (installed over-the-top, no
`-r`). Every provider request computed its statistics in-page; only sanitized
aggregates left the device. No channel names, programme titles, account
identifiers, or full provider URLs are recorded here - hosts and endpoint names
only.

### Provider request budget for this investigation

- Real provider requests issued: **9** (1 whole live list for Step 1; for Step 3
  one live list + 5 `get_short_epg` + 2 `get_simple_data_table`). The Step-4
  match-rate live list was served from the browser HTTP cache
  (`resource.transferSize === 0`), so it added no new provider bytes; even
  counting it the total is **10**, the stated ceiling.
- No 401/403/429/Retry-After was seen at any point. The stop-on-refusal rule was
  never triggered.
- The six-request catalog **sync** budget was not spent: these were interactive
  in-page fetches. Sync budget remained `1/6` used, `block: null`, throughout.

### Step 1 - mapping coverage from one live-list request (53,906 channels)

| Measure | Value |
| --- | ---: |
| Channels with a populated `epg_channel_id` | 9,940 |
| Blank / `null` | 43,966 |
| **Coverage** | **18.44%** |
| Distinct identifiers | 5,705 |
| Ids shared by more than one channel | 2,073 (max 50 channels on one id) |

Identifier format of the 9,940 populated ids:

| Pattern | Count | Share of populated |
| --- | ---: | ---: |
| Dotted with 2-3 letter country suffix (`Name.cc`) | 8,182 | 82.3% |
| Dotted, non-cc suffix | 1,323 | 13.3% |
| Contains whitespace | 1,664 | (overlaps) |
| Single token (no dot) | 92 | 0.9% |
| Pure numeric | 0 | 0% |
| Other | 343 | 3.5% |

The dominant format is the XMLTV/iptv-org `Name.cc` convention across **86**
country codes. Top regions by populated count: `nl` 718, `in` 615, `fr` 607,
`uk` 595, `de` 553, `us` 483, `it` 418, `pl` 412, `es` 299, `ca` 260.

### Step 2 - enabling change (the one code change)

`epgChannelId` is now captured end to end:

- `StreamItem.epgChannelId?: string` (`src/types.ts`).
- `normalizeStream()` reads `record.epg_channel_id` (`src/xtream-client.ts`).
- `toStoredStream()` durable whitelist includes it (`src/storage.ts`).
- `toCachedStream()` re-retains it verbatim after `stripCachedUrls()`
  (`src/library/catalog-repository.ts`), since a scheme-like token (e.g.
  `sky:sports`) would otherwise be dropped by the URL-like strip.

It is a plain guide-mapping token: no credential-bearing value, no playback URL,
enters durable records. Regressions added: client normalization parses the field
and does not fabricate one when absent (`xtream-client.test.ts`); the durable
snapshot retains it including a colon-bearing value while `directSource` is still
excluded (`catalog-repository.test.ts`). `npx tsc --noEmit`, `npx vitest run`
(34 files, 293 tests, +2), and `npm run build` (ES2015/bundle/CSS guards) all
pass. The next scheduled refresh will populate the field for every channel at no
extra request cost.

### Step 3 - provider's own EPG re-tested on 5 mapped channels (proper test)

Five channels that the provider itself declares have guide data (populated
`dotted_cc` `epg_channel_id`) were tested. Result is uniform and decisive:

| Endpoint | Channels | Status | Content-Type | Listings |
| --- | ---: | ---: | --- | --- |
| `get_short_epg` (limit 2) | 5 / 5 | **HTTP 404** | `text/html` (548-byte error page) | none |
| `get_simple_data_table` | 2 attempted | fetch failed (no HTTP status) | - | none |

The earlier single-channel 404 was not a mis-test: the provider returns a 404
HTML error page for `get_short_epg` even on channels it has mapped. The
`get_simple_data_table` calls failed at the fetch layer (no status), consistent
with a cross-origin redirect to another host - matching the observed reseller
layering (`line.rs6ott.com` -> `line.protv.cc`) where the guide endpoint is not
served from the same node as the stream API. **The provider does not serve usable
EPG for its own mapped channels.**

### Step 4 - external coverage against the open EPG project (iptv-org)

Match of the 9,940 populated provider ids against the iptv-org channel namespace
(`iptv-org.github.io/api/channels.json`, 40,978 channels; a non-provider source,
no budget):

| Measure | Value |
| --- | ---: |
| Overall id match rate | **39.55%** (3,931 / 9,940) |
| Match rate among `dotted_cc` ids | **47.98%** (3,931 / 8,193) |

Per-country match rate varies widely: `at` 76.1%, `in` 73.8%, `tr` 73.4%,
`al` 66.7%, `it` 62.4%, `uk` 61.8%, `ro` 61.7%, `us` 61.5%, `fr` 61.6%,
`be` 59.5%, `cz` 58.7%, `pl` 56.8%, `de` 52.6%, `za` 50.0%; low outliers
`nl` 3.9%, `dk` 3.6%, `qa` 9.1%, `no` 12.3%, `fi` 15.6%.

**Country file sizes and fetchability (off-device, from the dev machine).**
iptv-org no longer publishes official per-country output files; its `GUIDES.md`
lists only sparse community mirrors (2-470 channels). The realistic public
per-country source using the same `Name.cc` id convention is `epgshare01.online`
(`epg_ripper_<CC>.xml.gz`), which publishes **102** country files, all HTTP 200,
server-side fetchable, and gzip-valid XMLTV (spot check `IT1`: 1.67 MB gz -> 13.9
MB XML, ~8.3x). All files carried a `Last-Modified` of the same day ~04:39 UTC,
i.e. a **daily** refresh cadence.

Gzipped download sizes for the files covering the top populated countries:

| Country file | gz size |
| --- | ---: |
| `NL1` | 1.90 MB |
| `IN1` | 4.06 MB |
| `FR1` | 5.60 MB |
| `UK1` | 2.60 MB |
| `DE1` | 3.54 MB |
| `IT1` | 1.67 MB |
| `PL1` | 8.79 MB |
| `ES1` | 3.13 MB |
| `US2` | 6.05 MB |
| `CA2` | 6.69 MB |
| **Top-8 (excl. US/CA) subtotal** | **~29.8 MB gz** |

`RO1` is a heavy outlier at 13.5 MB gz; `US_LOCALS1` is 55.9 MB gz (avoid - use
the 6.05 MB `US2`). Files decompress ~8x, so a country's uncompressed XMLTV is
tens of MB - far too large to parse whole on the Chromium-79 target. This is why
the Worker is the intended home: fetch one country file, filter to the channel
ids the TV asks about, cache a few hours, return compact JSON. That shape is
feasible within Worker limits (per-country gz streamed and filtered server-side,
never shipped whole to the TV) - **not implemented here**, only assessed.

### Which situation are we in

**Situation 2: the provider's per-channel EPG is dead, but the mapping exists and
is standard.** The smallest fix (Situation 1, reuse the provider's own EPG) is
**ruled out** - it 404s an HTML page even for mapped channels. The mapping is
neither sparse-per-format nor non-standard in shape (82% is clean `dotted_cc`),
but it is **thin in coverage (18.44%)** and only **~48% of that** aligns with the
open project's ids. So the external route through the Worker is viable but bounded:
realistically it can light up roughly **48% of the mapped 18.44%**, i.e. on the
order of **3,900 channels (~7% of the 53,906 lineup)** by exact id match, with the
best yield in `at/in/tr/it/uk/ro/us/fr/de/pl` and poor yield in `nl/dk/qa/no/fi`.
Name-based matching for favourites (Situation 3's fallback) would be the way to
extend beyond the id-matched set, but that was out of scope for this measurement.

### Decision

- `epgChannelId` enablement: **implemented, regression-covered, build-green**;
  populates for every channel on the next refresh at no extra request cost.
- Provider-native EPG: **rejected** as a route (404 HTML on mapped channels).
- External Worker route: **viable and measured** - 39.55% overall / 47.98%
  dotted_cc id match to iptv-org; per-country daily files on `epgshare01.online`
  are server-fetchable at ~1.7-8.8 MB gz for the main countries (~30 MB gz for the
  top 8), ~8x decompressed; Worker fetch-filter-cache shape confirmed feasible,
  not implemented.
- Gate 1 and Phase 2A: **unchanged and remain accepted.** This entry adds one
  durable field and investigation evidence only.

## 2026-08-05 (later) - EPG is an access problem: Cloudflare egress is IP-blocked by the provider

New facts established this session (user-confirmed): the configured
catalog/stream host serves catalog + streams but **no EPG from any IP**; two
earlier reseller hosts are dead; and two other reseller hosts **do** serve EPG
but refuse the user's home IP, working only over mobile data. The narrow decisive
question was whether Cloudflare's datacenter ranges are accepted by those working
EPG hosts. They are not. Hosts and endpoint names only below; no full URL, no
credential (none was used), no channel names, titles, or account identifiers.

### Host / DNS standing (dev-machine DNS + reverse only)

- The two working EPG hosts and a third sibling all **CNAME to one upstream** and
  resolve to a single EPG node IP. That node is the one prior memory recorded as
  EPG-blocked from home. One earlier reseller host is now **NXDOMAIN** (dead);
  another still resolves but the user confirms it is dead.
- The app's **configured catalog/stream host is a different IP** from the EPG
  node - EPG was always served from a separate node, which is why the configured
  host answers catalog/streams but never EPG.
- The configured host is **not** in Cloudflare's published IPv4 ranges; from home
  it answers as `server: nginx` (a no-action `player_api.php` returns HTTP 511, a
  bare `xmltv.php` returns 404 nginx) - i.e. it is a normal reachable origin for
  this connection, just one with no guide data. Its exact reseller-generation
  standing versus the newest hosts could not be proven from DNS alone, but it is
  **not** one of the two dead hosts and **not** the EPG node. Recorded as a
  standing availability risk: if the reseller retires this IP the way it retired
  the two dead hosts, catalog and playback break too, not just EPG.

### Step 1 - the decisive test: Cloudflare edge -> working EPG hosts (credential-free)

Run from the Cloudflare edge (ephemeral `wrangler dev --remote` preview, torn
down after; **no** persistent Worker deployed, verified absent afterwards), not
from the TV and not from the home connection. Credential-free is sufficient
because the refusal is an IP-layer block that occurs upstream of authentication.

| Target (from Cloudflare egress) | Result |
| --- | --- |
| Working EPG host, `xmltv.php` (HTTP) | **403**, `server: nginx`, generic `<title>403 Forbidden</title>` body, `cf-mitigated: null` |
| Working EPG host, `player_api.php` (HTTP, no auth) | **403 nginx** - not a JSON auth error, so the block is upstream of the PHP app = IP-layer |
| Working EPG host over HTTPS | **521** (origin down for TLS) |
| Configured catalog host, `xmltv.php`/`player_api.php` (HTTP) | **403 `error code: 1003`** (Cloudflare "direct IP access not allowed") |
| Control (`iptv-org.github.io`, non-provider) | **200** - proves CF egress itself works |

The 403 is a **bare nginx origin 403 with no Cloudflare challenge** (`cf-mitigated`
absent), identical in shape to the home refusal. Browser-like User-Agent/Accept
headers did **not** change it. HTTPS returns 521. So the provider origin refuses
Cloudflare's datacenter ranges exactly as it refuses the home IP.

### Steps 2 and 3 - not reached / folded in

- **Step 2 (measure the guide shape) was not reached**: it is gated on Step 1
  succeeding, and Step 1 failed. No decompressed size, channel count, coverage
  comparison against the ~3,900 public-source ids, identifier-scheme check, or
  filtered-subset capability could be measured, because no guide byte is
  retrievable from Cloudflare. No credential was requested or used.
- **Step 3 (configured host standing)** is folded into the host/DNS section above.

### The situation, stated plainly

**The Worker route is dead for this provider.** Cloudflare's ranges are **not**
accepted by the working EPG hosts - the origin IP-blocks datacenter egress with a
plain nginx 403, the same block class the user hits from home. A Cloudflare Worker
therefore cannot fetch the guide today, with or without a reseller credential,
because the block is on the requesting IP, not on authentication. The public
external-source route (epgshare01, ~3,900 id-matched channels) remains the only
server-side option that actually returns data.

The remaining path to the provider's own richer guide is **the reseller lifting
the block on the user's home IP** (the hosts already work from the user's mobile
data), after which the *TV on the home network* - not a Worker - could reach the
EPG node directly. That is the user's action with the reseller, not ours. If that
home-IP block is lifted, re-run this test from the home connection before building
anything.

### Hygiene

- The reachability test used an **ephemeral** `wrangler dev --remote` edge preview
  under the existing Cloudflare account; it was stopped and confirmed to leave
  **no deployed Worker** (`deployments list` -> "Worker does not exist"). The
  production `nova-play-metadata` Worker was untouched.
- No app profile was changed; no app traffic was routed through any Worker; no
  guide was parsed on the TV. Temporary probe worker, CDP tunnel, and scratch
  scripts were removed. No credential, full provider URL, channel name, title, or
  account identifier was logged, committed, or recorded here.

### Decision

- Cloudflare Worker EPG route: **rejected** - provider origin IP-blocks Cloudflare
  datacenter ranges (nginx 403 / 521 / 1003), identical block class to the home
  refusal; browser headers and HTTPS do not change it.
- Guide-shape/coverage measurement: **not performed** - unreachable, so gated step
  not run.
- Configured-host standing: **recorded as a whole-app availability risk** (bare-IP
  reseller host, siblings already dead), independent of EPG.
- Only viable server-side EPG source remains the public external route
  (~3,900 id-matched channels); the provider's own guide requires the reseller to
  unblock the home IP, which is a user action.
- Gate 1 and Phase 2A: **unchanged and remain accepted.** No code change in this
  entry.

## 2026-08-05 (later) - EPG follow-ups: corrected external match, watched-set coverage, and non-Cloudflare egress

Three follow-ups, no reseller action, no code change. Hosts/endpoints and
aggregate counts only; no full URL, no credential (none used), no channel names,
titles, or account identifiers. This entry **supersedes the prior ~3,900-channel
external-coverage figure**, which was measured against the wrong dataset.

### Follow-up 1 - external match recomputed against the source we would actually use (epgshare01)

The earlier 39.55% / ~3,900 was measured against iptv-org's channel list, but the
practical source is **epgshare01**. Its published id universe is 26,511 distinct
ids across 98 country sections (parsed from its `ALL_SOURCES1.txt` id list; no
guide bytes downloaded). Matching the 9,940 populated `epg_channel_id` values
against it, on-device, one provider request:

| Measure | vs epgshare01 (correct source) | (prior vs iptv-org) |
| --- | ---: | ---: |
| Overall match, exact | **7.61%** (756) | - |
| Overall match, case-insensitive | **11.51%** (1,144) | 39.55% |
| Match among `dotted_cc` ids | **13.96%** | 47.98% |
| **Netherlands** | **21.0%** (151 / 718) | 3.9% |

So the real epgshare01 route reaches **~1,144 channels, not ~3,900** - roughly a
third of the earlier estimate. The one bright spot is the opposite of before:
**Netherlands is 21%** against epgshare01 versus 3.9% against iptv-org, i.e. the
most consequential country for this user is materially better on the source we
would actually use. Best per-country (CI): gr 32.8%, es 27.8%, fr 25.7%, de 24.6%,
cz 23.9%, at 20.9%, it 19.9%, dk 18.9%, tr 17.7%, nl 21.0%. Zero: us 1.4%, ca 0%,
ru 0%, se 0%, no 0%, qa 0% (these use different id namespaces than epgshare01).

### Follow-up 2 - coverage against channels the user actually opens

The 53,906 denominator is wrong for utility. Measured against the sets a user
genuinely opens (on-device, no provider request beyond follow-up 1's list):

| Set | Live items | EPG-eligible | id match | name-match adds | combined |
| --- | ---: | ---: | ---: | ---: | ---: |
| Favourites | **0** | - | - | - | - |
| Resume / watch history | **0** | - | - | - | - |
| Live lineup (proxy) | 53,906 | 9,940 have an id | 1,144 (2.12%) | +319 (0.59%) | 1,463 (2.71%) |

The decisive finding: **the user's favourites (6) and resume history (24) are
entirely VOD and series - zero live channels.** EPG applies only to live, so *the
content this user actually watches has no EPG-eligible items at all.* There is no
favourites/history live set to scope a guide to.

For the lineup proxy (the whole live section), **name-based matching adds almost
nothing over id matching**: +319 channels (0.59 points), lifting combined coverage
from 2.12% to 2.71%. Provider channel names carry heavy prefix/suffix noise
(`|CC|` tags, bracketed qualifiers, HD/FHD/UHD/VIP/H265 suffixes); even after
normalising those away, epgshare01's id-derived names rarely align. Name matching
is not a meaningful multiplier here. (Note: stored live snapshots predate the
`epgChannelId` capture, so this lineup id-match was computed from a fresh provider
live list, not the durable cache.)

### Follow-up 3 - non-Cloudflare egress reaches the provider guide node

The Cloudflare rejection was on Cloudflare's address ranges (AS13335), which
received a **bare nginx 403** from the EPG origin. Tested one **non-Cloudflare
datacenter egress** - a server-side fetcher hosted on **Google Cloud
(AS396982)** - against the same EPG hosts and endpoints, credential-free (a
no-auth hit reaches the app layer if the IP is accepted):

| From | EPG host `player_api.php` | EPG host `xmltv.php` | Meaning |
| --- | --- | --- | --- |
| Cloudflare edge (AS13335) | **403 bare nginx** | 403 / 521 | IP refused upstream of the app |
| Google Cloud egress (AS396982) | **511** (needs auth) | **2xx** (empty, needs params) | **request reached the app** |

Repeated twice each, consistent. The configured catalog host behaves identically
from the GCP egress (511 / 2xx). So the block is **Cloudflare-ASN-specific, not
datacenter-class**: an ordinary VPS on a non-Cloudflare network **does reach the
provider's guide node at the application layer**. The remaining step to real guide
data is one authenticated request from such a host - not attempted here because
the unauthenticated probe already proved reachability, and per the rules a
credential is not used once reachability is established.

This changes the earlier conclusion: the provider's own (richer) guide is **not**
unreachable from everything except the user's mobile connection. It is reachable
from a non-Cloudflare server-side host. The Worker route failed on Cloudflare's
ranges specifically; the *pipeline shape* is viable if hosted off Cloudflare.

### The four numbers and the verdict

1. Corrected epgshare01 identifier match: **11.51% (1,144 channels)**; Netherlands
   **21%**.
2. Coverage of what the user actually watches: **0** - favourites and history are
   all VOD/series, no live channels.
3. Additional coverage from name matching (lineup): **+0.59 points (319
   channels)** - negligible.
4. Non-Cloudflare egress reaching the guide node: **yes** - GCP-ASN egress gets a
   511/2xx app-layer response where Cloudflare gets a bare nginx 403.

**Verdict / scope implication.** The public-source (epgshare01) route is weak for
this lineup (~2-3% of live, name matching does not rescue it) and pointless to
scope to favourites/history because those hold no live channels. The stronger
option is the **provider's own guide via a non-Cloudflare host** (proven reachable
at the app layer), which would need one authenticated fetch from such a host to
confirm the guide payload and coverage. If a guide feature is pursued, prefer the
provider-guide-through-a-reachable-host path over the public-source path.

### Hygiene

- Follow-up egress test used a public server-side fetcher on a non-Cloudflare ASN;
  **nothing was deployed** (no VM, no Worker, no persistent service). The expired
  gcloud session was not used and no cloud resource was provisioned.
- One provider request per on-device match (interactive lane, in-page); no 401/
  403/429/Retry-After from the configured host; sync budget untouched. CDP tunnel
  and all scratch scripts removed. No credential, full provider URL, channel name,
  title, or account identifier was logged, committed, or recorded here.
- Prior-entry correction: the "~3,900 id-matched channels / 39.55%" external
  figure was against iptv-org; against the actual source (epgshare01) it is
  **1,144 / 11.51%**. Treat the epgshare01 number as authoritative.

## 2026-08-05 (later) - EPG: watched-channel coverage decides the design (public source works for mainstream, fails Persian)

The user watches live TV; the empty favourites/history were a development
artifact, so the prior "zero EPG-eligible content" conclusion is **withdrawn**.
The deciding metric is whether the free public source (epgshare01) carries **real
schedules for the specific channels this user watches**, not lineup-wide percent.
User-named public broadcasters may be named here (they supplied them, not private
catalog data); no other channel name and no programme titles are recorded. One
interactive live-list request; sync budget untouched; nothing deployed.

### 1. Named channels located in the provider catalog (entry counts, id agreement)

Heavy duplication confirmed (the earlier "same id on up to 50 channels" pattern):

| Channel | Catalog entries | Distinct `epg_channel_id` | Id agreement |
| --- | ---: | ---: | --- |
| NPO1 | 20 | 2 | conflicting |
| CNN | 85 | 12 | conflicting |
| BBC Persian | 3 | 0 (no id on any entry) | none |

A ~15-20 channel realistic set (Dutch / international news / Persian) was assembled
to avoid resting on three points. Provider entries exist for almost all of them,
but with 1-12 conflicting ids each and many entries carrying no id at all.

### 2. Coverage of that set against epgshare01 (plain counts, not lineup %)

Resolution = matched by id, else by normalized name, else absent. **Real-schedule
confirmed** = for a matched id, that channel actually has programmes for today in
the relevant country section (step 3), not merely an index entry.

| Channel | Resolves | Real schedule today | today progs |
| --- | --- | --- | ---: |
| NPO1 | by name -> `NPO.1.nl` | **yes** | 56 |
| NPO2 | by name -> `NPO.2.nl` | yes | 38 |
| NPO3 | by name -> `NPO.3.nl` | yes | 81 |
| RTL4 | -> `RTL.4.nl` | yes | 47 |
| RTL5 | -> `RTL.5.nl` | yes | 18 |
| SBS6 | by id -> `SBS6.nl` | yes | 36 |
| Net5 | by id -> `Net5.nl` | yes | 21 |
| CNN (International) | by id -> `CNN.International.de` / `CNN.HD.uk` | **yes** | 28 / 28 |
| BBC News | -> `BBC.NEWS.HD.uk` | yes | 52 |
| Al Jazeera Eng | -> `Al.Jazeera.HD.uk` | yes | 38 |
| France 24 | -> `FRANCE.24.HD.uk` | yes | 98 |
| Euronews | -> `Euronews.uk` | yes | 76 |
| Sky News | -> `Sky.News.HD.uk` | yes | 42 |
| **BBC Persian** | **absent** | **no** | 0 |
| **Iran International** | index-only `Iran.Intl.HD.uk` | **no (0 programmes)** | 0 |
| **Manoto** | absent | no | 0 |
| **PMC (Persian)** | absent (only PMC.Hindi/Telugu exist) | no | 0 |

**13 of the ~16 testable channels have real, populated schedules.** The clean
split: **all Dutch nationals and all mainstream international news are covered; the
entire Persian-language segment is not.**

### 3. Real programme data, not just index presence

For every matched channel the relevant country section was fetched server-side
(off-device) and today's `<programme>` entries counted. Mainstream channels return
68-387 total entries (18-98 for today), **100% with both start and stop**. The key
negative control: **Iran International is present in the UK index but has 0
programmes** in any file - exactly the "indexed but empty" case. An exhaustive scan
of the 200 MB combined `ALL_SOURCES1` found **no** Persian-language channel
(BBC Persian, Iran Intl, Manoto, Persian PMC) with a single programme; the only
"PMC" schedules are Indian (Hindi/Telugu).

### 4. Catch-up feasibility

epgshare01 programme times are **absolute wall-clock UTC** (`start=`/`stop=`
`YYYYMMDDHHMMSS +0000`), both bounds always present. These are directly usable to
construct a provider archive/timeshift request; they are not relative or
provider-specific offsets. Catch-up construction from this source is feasible for
the covered channels.

### Verdict

- **NPO1: covered. CNN: covered** (CNN International, real schedule; note the
  provider's CNN entries carry 12 conflicting ids, so id selection must prefer the
  `CNN.International.*` / `CNN.HD.uk` form, not e.g. a `.pt` CNN Portugal id).
  **BBC Persian: not covered** - absent from epgshare01 entirely, no schedule
  anywhere.
- The free route **already serves this user's mainstream viewing** (Dutch nationals
  + international news, all with real today schedules and catch-up-ready times).
- The one real gap is **Persian-language channels** (BBC Persian, Iran
  International, Manoto, PMC-Persian) - none has a real public schedule. This is the
  long-tail/regional weakness the percentage masked, and it is the only thing that
  would justify the user renting a server to reach the provider's own guide.

### Design implication

If the mainstream set is enough, the design is the **existing Worker fetching
per-country epgshare01 sections on demand, filtered to the channels the TV asks
about**, with no provider credential ever leaving the user's devices - viable
today, no reseller action, no VPS. The Persian channels would remain without a
guide under this design; whether that single gap justifies a rented server (to
reach the provider's own guide, already proven reachable from a non-Cloudflare
host) is the user's call.

### Hygiene

- No deployment, no VPS, no persistent service. Country sections were fetched to
  the dev machine for off-device programme counting only. One interactive in-page
  provider request (live list); no 401/403/429/Retry-After; sync budget untouched.
- CDP tunnel and all scratch scripts removed. No credential, full provider URL, or
  programme title was logged or recorded; only the user-named public broadcasters
  are named, per the stated allowance.

## 2026-08-05 (later) - END-TO-END PROOF on emulator: the per-channel Xtream EPG API works on a working host

Decisive outcome: **the app already retrieves and renders EPG end-to-end with no
new pipeline** when pointed at a host that actually serves guide data. The
historical 404s were purely the configured host (185.243.7.192), which serves no
EPG. Run on the webOS emulator against a working host over a metered mobile
connection; hosts/endpoints only, no credential, no programme titles.

### Data discipline (hard constraint) - honoured

- **No catalog sync ran.** Built a dedicated emulator package with a compile-time
  kill switch `VITE_DISABLE_CATALOG_SYNC=true`; verified in the shipped bundle that
  `scheduleCatalogSync()` folds to `return false` and `runCatalogSync()` to
  `return null` (dead-code-eliminated), so the ~150 MB auto-acquisition physically
  cannot fire. Confirmed on device: `schedule()` returns false, `isRunning()`
  false, sync budget stayed **0/6 used** the entire session. The flag is inert in
  normal builds (verified: production `scheduleCatalogSync` keeps its full body).
- **No video streamed.** No `<video>` element ever had a src; never entered player
  view.
- **Never requested the full live stream list** (18.6 MB). Used
  `get_live_categories` (60.6 KB) then single targeted `get_live_streams?category_id=`
  fetches (7-75 KB each).
- **Total mobile data this session: ~1.38 MB.** Dominated by two pulls of NPO1's
  full `get_simple_data_table` (~352 KB each). Everything else was KB-scale.

### Step 1 - per-channel EPG API on the working host (the decisive test)

Located each named channel with minimal requests (categories -> one category):
NPO1 in `NL| ALGEMEEN`, CNN in `UK| NEWS`, BBC Persian in `IR| IRAN`.

| Channel | provider epg_channel_id | get_short_epg | get_simple_data_table | size |
| --- | --- | --- | --- | --- |
| NPO1 | present (`npo1.nl`) | **200 JSON, 4 listings** | **200 JSON, 775 listings** | 1.7 KB / 352 KB |
| CNN (entry A) | present | 200 JSON, 0 listings (empty) | 200 JSON, empty | 19 B |
| CNN (entry B) | present | **200 JSON, 4 listings** | populated | ~2 KB |
| BBC Persian | absent (no id) | 200 JSON, 0 listings | 200 JSON, empty | 19 B |

- **The endpoints work.** `get_short_epg` returns populated real listings in
  **kilobytes** for mapped channels. The client's existing implementation
  (`xtream-client.ts`) is correct; only the host was wrong before.
- Listing fields carry `title`, `description`, and **both** `start`/`end` as ISO
  wall-clock (`2026-08-05 11:45:00`) **and** `start_timestamp`/`stop_timestamp` as
  10-digit epoch seconds, plus `channel_id` (`npo1.nl`) and `has_archive`.
- CNN has two provider entries; one is empty, the other carries a real schedule -
  so channel-entry selection must prefer the entry that returns listings.
- BBC Persian has no `epg_channel_id` and returns an empty (but valid 200) table -
  the provider simply has no guide for it, matching the public-source finding.

### Step 2 - not reached (as intended)

Step 1 succeeded, so the whole-account guide file was **not** downloaded. No
tens-of-MB payload was fetched. (The per-channel API is the small, on-demand path
the task hoped for.)

### Step 3 - the guide renders in the UI

Drove the real production render path (`openDetails` -> `loadLiveDetails` ->
`nowNext`; `showEpg` -> `epg`) via a probe-only `epgDemo` hook, without a
downloaded catalog:

| Channel | Now/Next rows | Schedule rows | Result |
| --- | ---: | ---: | --- |
| NPO1 | 2 | 8 | programme rows with times render |
| CNN (entry B) | 2 | 8 | programme rows with times render |
| BBC Persian | 0 | 0 | gracefully shows no data, no crash |

**Cache behaviour:** re-opening NPO1 within TTL rendered identically (2 now/next,
8 schedule rows) with **zero provider requests / 0 bytes** - served from the
in-memory `nowNextCache` and durable per-channel EPG store. This is exactly the
required TTL behaviour: one request per unique channel/projection, then zero
within its TTL.

### Step 4 - catch-up feasibility

Times are absolute wall-clock (ISO + epoch-second `start_timestamp`/`stop_timestamp`,
both bounds present, with `has_archive`), directly usable to construct a
timeshift/archive request. Not relative or provider-specific.

### Generality and the standing profile risk

- **Preferred route: the per-channel Xtream EPG API** (`get_short_epg` /
  `get_simple_data_table`). It is the standard Xtream interface, already
  implemented, small (KB), on-demand, and cache-friendly - and it is provider-
  agnostic, so it works for any user on any Xtream host that serves EPG, not just
  this account. No Worker, no VPS, no large-file pipeline needed for the general
  case.
- Fallback only where a host serves no per-channel EPG at all: the whole-account
  `xmltv.php` guide (measure size first; TV-parse risk on Chromium 79), then the
  public epgshare01 route for mainstream channels. Persian-language coverage
  remains the known gap in the public route, but the provider's own per-channel
  API covered NPO1 and CNN here directly.
- **Standing risk (recorded):** the configured production profile
  (185.243.7.192) is on a host that serves catalog/streams but **no EPG**, and two
  sibling hosts are already dead. The profile likely needs moving to a current
  working host (e.g. line.trexottvendor.store) regardless of the guide question -
  that is where both catalog and EPG are healthy.

### Code touched this task (diagnostic scaffolding, not the pipeline)

- `src/main.ts`: added `catalogSyncDisabled` (build-time `VITE_DISABLE_CATALOG_SYNC`)
  guarding `scheduleCatalogSync`/`runCatalogSync`; added probe-only
  `catalogSync.epgDemo` to render the live details/EPG panels for a given channel.
- `src/library/capability-probe.ts`: typed the `epgDemo` probe method.
- Both are inert/absent in normal builds. `npx tsc --noEmit` clean; full suite
  293/293; normal `npm run build` green and kill switch confirmed inert.
- **No large-file EPG pipeline was implemented**, per the task. Remaining work is
  caching + UI wiring of the per-channel API into the Guide, to be scoped from this
  report.

### Hygiene

- Emulator only; the working profile/credential was supplied by the user in a
  local file, injected into emulator localStorage in-memory, never echoed, and the
  file was deleted. No credential, full URL, or programme title logged or recorded.
- No catalog sync ran (sync budget 0/6 throughout); no video streamed; ~1.38 MB
  total mobile data. CDP tunnel and all scratch scripts removed.

## 2026-08-05 (later) - Re-measuring the 18.44% claim on a WORKING host (Psiphon), 4 tests

Purpose: re-test my own prior claim that (a) epg_channel_id coverage is capped at
18.44% and (b) the provider's guide holds nothing its mapping doesn't expose. The
18.44% was measured on-device from the home connection = host 185.243.7.192, which
serves NO guide data - the wrong host to measure mapping on. Re-measured against a
working host over Psiphon. Sync-disabled build (kill switch verified folded);
hosts/endpoints only, no credential, no programme titles.

### Route reliability (established first, per protocol)

- Psiphon rotates exits and pins one until forced. First exit: NL 188.90.66.6
  (AS50266 Odido) - **blocked**: the known-good NPO1 call (real listings last
  session) returned a **bare nginx 403, no cf-mitigated** = blocked-exit signature.
  Per rule, drew no provider conclusion; had the user rotate.
- Reconnect and emulator restart kept the same exit; only a forced region change
  rotated it. Working exit: **NL 77.63.75.239 (AS1136 KPN)** - known-good NPO1
  `get_simple_data_table` returned **200, 775 listings, 352 KB**, identical to last
  session. All test results below are on this confirmed-reachable exit. (Confirmed
  the emulator is genuinely on the tunnel: it egresses via KPN/Odido NL while this
  host's own connection egresses via a US datacenter.)

### Test A - do blank-epg_channel_id channels return a schedule? (decisive)

Picked ~2 blank-mapping channels from each of 7 categories spanning NL/UK/DE/US/IN/FR
(14 channels) and called `get_simple_data_table` on each from the working host:

- **14 / 14 returned HTTP 200 with an EMPTY schedule (0 listings, ~19 bytes).**
- **0 populated.** Not a single blank-mapping channel had a real schedule.

All were 200s on a confirmed-good exit, so these are genuine empty results, not
blocks. **My 18.44% ceiling claim HOLDS:** a blank epg_channel_id reliably means no
schedule; the API mapping does not understate coverage, and the provider's guide
does not hold data the mapping fails to expose.

### Test B - epg_channel_id populated rate on a working host vs 18.44%

Sampled 7 region-spread categories (403 channels): NL ALGEMEEN 31 (29 populated),
NL BUITENLAND 23 (6), UK NEWS 39 (24), DE ALLGEMEIN 98 (78), US NEWS NETWORK 69
(54), ASIA INDIA NEWS 115 (67), FR FRANCE-4K 28 (26).

- **Populated = 284 / 403 = ~70.5%** on the working host.
- **The 18.44% figure was wrong** - it was an artifact of measuring on the non-EPG
  host (185.243.7.192), which apparently returns records with the field stripped or
  a degraded set. On a host that actually serves guide data, mapping coverage is
  ~3.8x higher.
- Sampling caveat: 403 of 53,906 channels (0.7%), deliberately weighted to
  mainstream/news categories, which are better-mapped than the long tail. The true
  whole-lineup rate is between this ~70% (mainstream) and the tail; not measured
  fully to respect the metered connection. The headline correction stands: **the
  18.44% ceiling does not hold on a working host.**

### Test C - M3U export tvg-id: not safely measurable on this panel

Checked size before downloading, as required. The `get.php?...&type=m3u_plus`
export: **HEAD -> 502**; category-filtered form -> **429 (rate-limit)**; GET ->
**hung** (aborted at 8 s, no headers). Per the stop-on-429 rule I did not force it.
The panel throttles/refuses the heavy playlist path (while the per-channel EPG API
stayed clean 200s and the broker showed no block). **tvg-id populated rate could
not be obtained without violating the data/refusal constraints;** left unmeasured.
Note: the m3u 429 did not affect the EPG API path (direct fetch, not via broker;
budget stayed 0/6, block null).

### Test D - provenance vs epgshare01 (NPO1, same day)

Provider NPO1 `get_simple_data_table` = 775 listings (60 for today). epgshare01
`NPO.1.nl` (NL1 file, fetched off-device on the dev connection, not the metered
route) = 209 programmes. Comparing today's boundaries within the overlapping window
(60 provider programmes):

- **44 / 60 (73.3%) match start AND stop to the exact second.**
- 6 more share the exact start (stop differs slightly); **50 / 60 (83%) share the
  exact start boundary.** First entries also had identical title lengths.
- Neither source exposed a `generator-info-name`/`source-info` (provider API has no
  such field; the epgshare extract exposed none here).

Reading: **strong overlap but not byte-identical.** Consistent with the provider
drawing from the same public upstream family as epgshare01 (or one very close) with
some independent edits/refresh timing - i.e. substantially a public-source
passthrough, not a wholly independent guide. This makes the public epgshare route a
near-equivalent substitute for the channels both cover, but does not prove a
single named upstream.

### The four answers

1. **Blank-mapping channels returning real schedules: 0 of 14.** My 18.44%
   ceiling-as-a-cap-on-guide-content claim HOLDS - blank mapping = no schedule.
2. **epg_channel_id populated rate on a working host: ~70.5% (284/403 sampled)**,
   not 18.44%. The 18.44% was a wrong-host artifact; corrected sharply upward
   (mainstream-weighted sample caveat noted).
3. **tvg-id / M3U export: not measurable** - panel 502/429/hangs on the export
   path; stopped per the 429 rule. Cannot say whether it is a better key.
4. **Provenance: substantially a public-source passthrough** - 73% exact / 83%
   start-boundary agreement with epgshare01 NPO1; no generator string to name the
   upstream directly.

Net: the two prior conclusions split. The per-channel API's mapping field IS an
accurate availability indicator (Test A upholds it), but the **18.44% coverage
number was measured on the wrong host and is far too low (~70% mainstream on a
working host)** (Test B overturns it).

### Safety / hygiene

- Route: exit reachability verified before every conclusion; a blocked exit's 403
  was never reported as a provider result. Working exit NL KPN 77.63.75.239.
- **No catalog sync ran** (kill-switch build; `schedule()`->false, `runCatalogSync`
  ->null; sync budget 0/6, block null throughout). **No video streamed** (no
  `<video>` src, never in player).
- Never fetched the full 18.6 MB live list (sampled categories only); never
  downloaded the whole-account guide (Test C stopped on 429/hang).
- **~0.82 MB total over the metered Psiphon route** (dominated by two NPO1
  `get_simple_data_table` pulls at 352 KB). The epgshare NL1 file (~1.8 MB) for
  Test D went over the dev machine's own connection, not the metered emulator route.
- Credential supplied locally, injected in memory, never logged/echoed/committed;
  temp files and CDP tunnel removed. Only user-named public broadcasters named.
- Probe/build note: reused the `VITE_DISABLE_CATALOG_SYNC` build plus the probe-only
  `epgDemo` hook from the prior session; both inert/absent in normal builds. No new
  production code in this task.

## 2026-08-05 (later) - EPG implemented as a general capability (no channel-specific handling)

General, provider-agnostic EPG capability. No channel names, titles, credentials,
or full URLs recorded here.

### What was built

- **New `src/epg-service.ts`** owns the retrieval policy, DOM-free and unit-tested:
  cache-first `resolveNowNext` / `resolveSchedule`, the blank-identifier
  authoritative negative, capability gating, and the public-source fallback. It is
  the single owner of "durable cache before any provider request".
- **No request fan-out.** The guide list hydrates only the visible page
  (`streams.slice(0, GUIDE_VISIBLE_NOW_NEXT_LIMIT)`), serially, at most one
  interactive request per mapped visible row, and **zero for unmapped rows**
  (skipped before a request is formed). `prefetchNowNext` remains absent; a
  regression test asserts it never returns.
- **Per-profile capability detection.** A single probe against one mapped channel
  classifies the host: a populated schedule => `available`; a definitive 404/403
  for a mapped channel (the measured non-serving signature) => `unavailable`; a
  transient network/timeout stays `unknown` (retried, never a false negative).
  Persisted on the library meta record with a timestamp; 24 h freshness.
- **Durable guide cache.** now/next and schedule persist per profile+channel with
  TTLs in the existing `epg` store, which `evictRebuildableData` already deletes
  first (before details and search index). Reads are served from it before any
  request, so a relaunch inside TTL issues zero provider requests.
- **Host management (the durability gap).** New `storage.updateProfileConnection`
  edits a profile's host/credentials in place, preserving the id the catalog is
  keyed to, so moving to a new host keeps the fully downloaded library instead of
  orphaning it and forcing a ~150 MB re-download. A "Change server" action in
  Settings validates the new host before saving and distinguishes an unreachable
  host from a refusal (retired host reads as a fixable config problem). Editing
  never adopts an id from input.
- **Public-source fallback** (`/v1/epg` on the Worker + `loadPublicSchedule` /
  `loadPublicNowNext` in `metadata-client.ts`). Used only when the host is
  `unavailable` but a channel has an identifier. The Worker fetches a per-region
  source file server-side, filters to the requested identifiers, edge-caches a few
  hours, and returns compact JSON — never a whole region file to the TV. Results
  are labelled "Guide from a public source". A blank identifier has no key and no
  fallback (accepted gap; no name matching).
- **Catch-up** offered only where the channel advertises archive (`tv_archive`),
  and never against public-source data (no archive rights), wired from the
  programme start/stop timestamps.
- **Unavailable-host UX.** When the host serves no guide, the UI states "This
  account's current server provides no guide data" rather than rendering an empty
  schedule as though the channel has nothing on.

### Verification

- `npx tsc --noEmit` clean; **full suite 333 passed** (37 files), including new
  `src/epg-service.test.ts` (fan-out discipline: at most one request per mapped
  visible row, zero for unmapped; relaunch/re-render within TTL issues zero new
  requests; capability freshness) and new host-edit preservation tests in
  `storage.test.ts` (id stable, active pointer updated, unknown id refused, id
  never adopted from input). `npm run build` passes ES2015/bundle/CSS baseline
  guards. Worker tests green.
- **Emulator (home connection, non-guide host 185.243.7.192 reachable):**
  capability detection returned **`unavailable`** from the host's 404 and
  persisted it; the details view rendered the "current server provides no guide
  data" message rather than an empty schedule; an unmapped synthetic channel
  issued **0 provider requests**. The `VITE_DISABLE_CATALOG_SYNC` kill switch was
  verified folded (`scheduleCatalogSync` -> `return false`) and no catalog sync
  ran (`schedule()` false, `isRunning()` false).
- **Emulator caveat:** the working EPG host is blocked from the home connection,
  so the live *available*-host path (populated now/next + schedule rendering)
  could not be re-exercised this session; it was proven end-to-end in the prior
  session and is covered here by the service unit tests. Emulator results attest
  logic, not TV performance, though kilobyte per-channel payloads make that a low
  risk for this route.

### Acceptance criteria status

- Guide page issues at most one request per visible row, none for unmapped:
  **met** (unit-proven + guide hydration bounded to the visible page; 0 requests
  for unmapped verified on device).
- Relaunch serves cached guide data with zero provider requests inside TTL:
  **met** (durable `epg` store read-before-request; unit-proven).
- Non-guide host shows a clear message, not an empty schedule: **met** (verified on
  device).
- Editing a profile's host preserves the local catalog: **met** (id-preserving
  `updateProfileConnection`; verified by test).
- Catch-up present only where advertised: **met** (gated on `tv_archive`, excluded
  for public-source data).
- tsc/suite/build/boundary checks: **met** (333 tests, build guards pass).
