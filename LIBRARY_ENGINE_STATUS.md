# Nova Play Library Engine Status

This is the append-only implementation record for the phased Library Engine described in [`implementation_plan.md`](implementation_plan.md). The plan defines the architecture and acceptance gates; this file records what was actually attempted, measured, accepted, deferred, or rolled back.

This file holds the rules, the current baseline, and the phase register. The dated
entries themselves live in [`docs/library-engine/journal/`](docs/library-engine/journal/),
one file per day — see [Journal](#journal) below. The entries were moved there verbatim;
nothing was edited, reordered, or summarized.

## Record rules

For every phase:

1. Add a dated entry before implementation begins, in `docs/library-engine/journal/YYYY-MM-DD.md` (create the file if that day has no entry yet, and add it to the Journal index below).
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


## Journal

Dated entries, verbatim, one file per day. Newest last.

| Day | Entries | Size | Covers |
| --- | --- | --- | --- |
| [`2026-07-30`](docs/library-engine/journal/2026-07-30.md) | 3 | 10 KB | Pre-implementation architecture reassessment … All-phase closure and Plan 1.0 freeze preparation |
| [`2026-07-31`](docs/library-engine/journal/2026-07-31.md) | 1 | 3 KB | Phase 0 capability probe implementation |
| [`2026-08-01`](docs/library-engine/journal/2026-08-01.md) | 8 | 28 KB | Phase 0 webOS runtime probe evidence … Phase 1B implementation and fixture verification |
| [`2026-08-02`](docs/library-engine/journal/2026-08-02.md) | 7 | 45 KB | Phase 1B provider-budget correction and controlled Gate 1 evidence … Sync-debit diagnosis, bounded playb… |
| [`2026-08-03`](docs/library-engine/journal/2026-08-03.md) | 6 | 31 KB | Explicit Gate 1 arming, request-count reconciliation, and independent media-engine proof … Post-cutover … |
| [`2026-08-04`](docs/library-engine/journal/2026-08-04.md) | 8 | 93 KB | Post-cutover search coverage and local-read performance defects … Local section-scale repro, publication… |
| [`2026-08-05`](docs/library-engine/journal/2026-08-05.md) | 13 | 85 KB | Progress DOM sink, populated probe, hardened guard, localised stall … EPG implemented as a general capab… |
