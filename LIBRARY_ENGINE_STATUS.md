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
