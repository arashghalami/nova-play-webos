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
- The physical ReferenceError diagnosis and corrective bundle work remain to be committed after the final diff/cleanup verification.
- Gate 1 remains **rejected/pending**: this entry proves the local post-scan publication path, not all-three-section authoritative provider synchronization.
- Phase 2A remains **not started and not authorized**.
- The next provider action remains exactly one separately approved serial Gate 1 sync in a future UTC window with all six sync debits available. No provider request is authorized before that condition is met.
