## Final plan governance and freeze controls

This section is normative. The frozen plan version is `Library Engine Plan 1.0`. If delivery-process wording elsewhere conflicts with this section, this section controls.

### Contract classes

Immutable architecture contracts:

- local-first reads and provider-authoritative playable availability;
- explicit completeness, freshness, attempt outcome, and deletion proof;
- immutable revision-owned catalog rows and atomic `ActiveSectionRecord` routing activation;
- completion proof before sealing; unit-boundary restart for non-paginated requests;
- no deletion proof from partial, failed, malformed, timed-out, or cancelled work;
- profile isolation, one writer lease per profile, and protected `localStorage` authority;
- runner-independent repository/state-machine contracts and separately built classic Workers;
- bounded paged reads/search, deterministic ordering, explicit hybrid truncation, and network rollback;
- opaque canonical IDs, entity-safe external namespaces, profile-scoped private evidence, and manual override precedence;
- parental enforcement before rendering/navigation, deterministic version policy, and nonmutating user-state projection;
- privacy/redaction rules and Phase 5's decision-only boundary.

Device-calibrated values:

- batch/page/index sizes, storage soft/hard limits, worker/cooperative slice budgets, timeouts, and performance thresholds;
- these may change only through a dated gate entry containing device evidence, old/new values, rationale, and rollback result;
- calibration cannot change correctness, identity, coverage, deletion, privacy, paging, authority, or rollback semantics.

### Decision register

| ID | Frozen decision |
| --- | --- |
| DEC-001 | IndexedDB is the on-TV durable catalog; current `localStorage` remains authoritative for profiles/settings/favorites/resume until an explicit later migration ADR. |
| DEC-002 | Foreground classic Worker is preferred; Gate 0 deterministically selects Worker-IDB, Worker-main-IDB, cooperative-main, or no-go. |
| DEC-003 | Catalog data is immutable by revision and exposed only through the sole per-profile/section `ActiveSectionRecord`, which routes reads to one section revision or an explicit category-revision set. |
| DEC-004 | Standard Xtream responses are non-paginated and restart from byte zero after interruption. |
| DEC-005 | Provider assets, canonical titles, and people are distinct identities; canonical/person keys are opaque Nova Play IDs. |
| DEC-006 | Search starts with bounded token/prefix/facet indexing; trigrams require a separate approved amendment. |
| DEC-007 | Metadata enrichment is demand-driven and budgeted; private full-catalog upload is prohibited. |
| DEC-008 | Phase 5 retains foreground sync unless a decision-only ADR and later implementation ADR explicitly approve another topology. |

### Assumption register

| ID | Assumption | Required response if false |
| --- | --- | --- |
| ASM-001 | OLED G1 provides persistent/stable main-thread IndexedDB. | Gate 0 returns `no-go`; evaluate companion architecture separately. |
| ASM-002 | At least one runner can meet UI/playback budgets. | Gate 0 returns `no-go`; do not implement durable on-TV sync. |
| ASM-003 | Xtream item/category IDs are provider-scoped, not globally stable. | Keep profile/section scoping and identity remapping; never weaken keys. |
| ASM-004 | Provider/category endpoints may stall or be incomplete. | Preserve bounded adaptive crawl, completion proof, and partial coverage. |
| ASM-005 | Current `localStorage` writes can fail or be truncated under pressure. | Treat it as protected but inherited-risk storage; verify before/after fingerprints and never mutate it during catalog recovery. |
| ASM-006 | Device wall clock/time zone may change. | Use UTC timestamps, injected clocks, and never infer freshness/deletion solely from backward wall-clock movement. |

### Risk register

| ID | Risk | Frozen mitigation |
| --- | --- | --- |
| RSK-001 | Active-plus-staging exceeds quota. | Preflight headroom, conservative estimates, ordered pruning, abort before active data is endangered. |
| RSK-002 | False removal from category moves/partial reads. | Comparable complete section passes, later confirmation, grace, and protected detached state. |
| RSK-003 | Wrong canonical navigation. | Fixed high auto-confirm threshold, stratified audit, ambiguity UI, manual overrides, zero silent choice. |
| RSK-004 | Main-thread/worker work harms playback. | Playback-priority cancellation, measured budgets, bounded slices/messages, Gate 0/2/4 evidence. |
| RSK-005 | Private data leaks through traces/cursors/reports/enrichment. | Hashed/minimal evidence, allowlisted aggregate telemetry, redaction tests, no private bulk upload. |
| RSK-006 | Schema upgrade prevents app rollback. | Minimum-reader metadata, schema-only upgrades, resumable backfills, controlled rebuild, compatibility tests. |
| RSK-007 | Planning artifacts or phase evidence are lost. | Freeze manifest, sanitized checkpoint commit, append-only status, hash verification before each phase. |

### Deferred register

- full trigram/n-gram search;
- persisted artwork blobs;
- automatic enrichment of every title;
- recommendations;
- multi-provider-in-one-profile schema;
- protected user-state migration away from `localStorage`;
- cloud catalog/credential storage;
- packaged background service or Nova Hub implementation;
- EPG/catch-up discovery and change history.

Each deferred item requires an explicit change-controlled amendment or ADR; phase implementers must not absorb it opportunistically.

### Change control

After freeze, no session may silently alter an immutable contract, gate, store/key ownership, protocol major, phase boundary, or privacy rule. A required discovery must:

1. stop the active phase before dependent implementation;
2. append a status entry describing evidence and impact;
3. create an ADR or plan amendment with alternatives, migration, tests, rollback, and affected phases;
4. obtain explicit user approval;
5. update plan freeze version and all affected prompts/contracts;
6. rerun the complete freeze checklist and regenerate hashes/manifest;
7. preserve the superseded manifest and status linkage.

Bug fixes that do not alter contracts need no plan revision but still require phase tests/status evidence. Device calibration follows the narrower calibrated-value process above.

### Self-contained future-session execution contract

Every phase prompt below repeats its own scope, but every implementation session must also perform all of these steps:

1. Verify `implementation_plan.md`, `LIBRARY_ENGINE_STATUS.md`, and `LIBRARY_ENGINE_PLAN_FREEZE.sha256` hashes before edits.
2. Read the named plan sections and every status entry; confirm prerequisite gate/phase acceptance and no unresolved blocking ADR.
3. Record `HEAD`, branch/upstream, dirty-tree inventory, Node/npm/webOS CLI versions, selected runner/schema/protocol/policy versions, and exact in-scope files.
4. Use the accepted lockfile (`npm ci` when setup is required), run baseline tests/build/diff check, and append a dated phase-started status entry.
5. Implement only the named phase and its owned stores/files/contracts; later-phase/deferred work is forbidden.
6. Run phase unit/integration/fault tests, production build, privacy checks, rollback, and required OLED G1 package/device scenarios.
7. Append commands/results, deterministic seeds, sample/population sizes, p50/p95 metrics, storage/heap data, deviations, risks, security review, rollback evidence, and explicit phase/gate decision.
8. Stop at the named gate. A dependent phase requires a separate session and accepted status entry.

### Final freeze checklist

Before declaring a new plan freeze:

- required eight top-level sections occur exactly once and in order;
- all Markdown fences are balanced;
- all ten phase headings/prompts exist and phase prerequisites form a valid chain;
- every planned nonplatform symbol is defined or explicitly owned by the current app;
- every store has one owning phase, key, indexes, migration, pruning, and profile-isolation rule;
- no conflicting old offset paging, coverage union, external-derived canonical key, or full-array index contract remains;
- gates contain measurable evidence, rollback, privacy, and stop criteria;
- tests and production build pass; `git diff --check` passes;
- scoped status proves no unapproved production implementation was introduced;
- status contains an append-only freeze entry and no unresolved freeze blocker;
- SHA-256 manifest is generated last and independently verified;
- the frozen artifacts are preserved in a dedicated sanitized Git checkpoint.

[Implementation Order]

Implement capability proof first, then durable shadow replication, local read cutover, canonical identity, advanced UX, and only afterward optional closed-app infrastructure.

## Phase 0 — capability probe only

Goal: prove the physical webOS storage/worker foundation before committing to the architecture.

The common future-session protocol in `[Testing]` is mandatory. Gate 0 implementation may not begin until the reproducible planning baseline is preserved.

1. Record the current baseline in `LIBRARY_ENGINE_STATUS.md`.
2. Add capability types and disposable IndexedDB probe helpers.
3. Add the separate classic Worker Vite configuration and deterministic build output without changing the main app to a multi-entry/module build.
4. Add main-thread probe orchestrator and recommendation policy.
5. Expose the probe only through explicit debug/launch-param access.
6. Add automated tests.
7. Run full tests/build/package.
8. Install on `lg-oled-g1`.
9. Execute all physical-device probe tiers.
10. Close/relaunch and verify persistence.
11. Verify cancellation during playback.
12. Clean up the disposable database.
13. Record sanitized measurements and one runner decision:
    - `worker-idb`;
    - `worker-main-idb`;
    - `cooperative-main`;
    - `no-go`.
14. Stop and request architectural review if the decision is `no-go`.

Acceptance gate: Gate 0 in `[Overview]`.

Rollback: remove/disable probe API and worker asset; no production data has changed.

### Future-session task prompt: Phase 0

```text
Implement only Phase 0 from @implementation_plan.md. First verify the freeze manifest; read the complete Overview, protocol/capability contracts and governance in Types/Testing, Phase 0 Files/Functions/Tests/Order, and every @LIBRARY_ENGINE_STATUS.md entry. Confirm no implementation phase has started; record HEAD, dirty tree, tool versions, baseline tests/build, and a Phase 0-started entry. Create only the disposable probe, separate classic ES2015 Worker build, debug-only access, tests, and sanitized reporting described by the plan. Do not create the permanent DB/schema, sync engine, local read path, identity graph, or later UX. Exercise every runner path, packaged file URL, provider-boundary Worker fetch, main/Worker IndexedDB, persistence relaunch, abort/transaction recovery, quota tiers, playback cancellation, cleanup, and disabled normal build on the OLED G1. Run all automated/build/package/privacy/rollback checks. Append measurements and exactly one deterministic recommendation: worker-idb, worker-main-idb, cooperative-main, or no-go. Stop at Gate 0; no later phase is authorized.
```

## Phase 1A — durable schema and repository

Goal: create the durable profile-isolated database without provider synchronization.

The common future-session protocol is mandatory. Confirm Gate 0's selected runner and exact storage limits in the status record.

1. Add permanent Library Engine types, opaque canonical/person key creation, stable provider keys, and compound physical keys.
2. Define DB metadata, version, revision/pointer/lease/pass/catalog stores, and indexes exactly enough to implement `[Types]`.
3. Implement explicit schema upgrades containing schema work only plus resumable post-open backfills.
4. Implement transaction helpers and single-writer lease primitives.
5. Implement `IndexedDbCatalogRepository` and `CatalogWriteRepository`, including immutable revisions and atomic `ActiveSectionRecord` routing activation.
6. Implement profile deletion and rebuildable-data pruning.
7. Implement abandoned-run recovery primitives.
8. Add fake IndexedDB tests and fault injection.
9. Add DB telemetry.
10. Run tests/build/package and a physical CRUD/relaunch smoke test.
11. Record schema version and device storage usage.

Acceptance:

- transaction abort and `ActiveSectionRecord`/revision atomicity pass at every tested crash boundary;
- profile isolation and two-controller lease exclusion pass;
- every migration, blocked/aborted upgrade, post-open backfill, recovery, and controlled rebuild test passes;
- physical persistence and active-plus-staging headroom are measured;
- current UI behavior is unchanged;
- exact schema/minimum-reader version and rollback compatibility are recorded.

Rollback: feature flag leaves repository unopened; deleting `nova-play-library` affects no current user state.

### Future-session task prompt: Phase 1A

```text
Implement only Phase 1A from @implementation_plan.md. Verify the freeze manifest; read the full Overview, all database/revision/store/protocol/operational contracts in Types, Phase 1 Files, Database/Key/Repository Functions, Classes, schema tests, governance, Phase 1A Order, and all status entries. Require accepted Gate 0 with runner and calibrated storage/timing limits. Record baseline and Phase 1A-started status. Implement exactly the permanent metadata/backfill/revision/pointer/lease/pass/catalog schema, compound keys/indexes, read/write repositories, transactions, atomic activation, recovery/pruning, telemetry, migrations/backfills, and tests owned by Phase 1A. Do not contact providers, start sync, create search index/read cutover, or alter UI behavior. Never move or mutate credentials/favorites/resume/settings. Test fresh/blocked/aborted/incompatible upgrades, leases, all activation crash points, quota/pruning, profile isolation/deletion, rebuild, persistence/relaunch, and rollback. Record schema/minimum-reader version, storage evidence, compatibility, privacy, and rollback; stop after Phase 1A acceptance.
```

## Phase 1B — provider adapter and shadow sync

Goal: replicate provider data durably while leaving all UI reads unchanged.

The common future-session protocol is mandatory. Use only the runner accepted at Gate 0 and schema accepted in Phase 1A.

1. Extract/add `XtreamClient.iterateStreams` with backpressure, completion proof, and unit-only restart semantics.
2. Add provider capability health/backoff.
3. Add normalization/fingerprints/language/quality evidence.
4. Add coverage and tombstone policies.
5. Add sync planner.
6. Add runner-independent sync engine.
7. Add Worker or cooperative runner selected by Gate 0.
8. Add main-thread sync controller.
9. Start shadow sync only after Home renders.
10. Pause on playback/profile change/pagehide.
11. Persist checkpoints only at sealed/activated unit boundaries; restart interrupted non-paginated units into fresh revisions.
12. Add parity sampling with recorded sample sizes without changing user-visible reads.
13. Test failures/crashes/deletions/quota.
14. Run physical initial and interrupted sync scenarios.
15. Record throughput, coverage, storage, and parity.

Acceptance: Gate 1 in `[Overview]`.

Rollback: disable shadow sync; current provider path remains untouched; rebuildable DB can be deleted.

### Future-session task prompt: Phase 1B

```text
Implement only Phase 1B from @implementation_plan.md. Verify the freeze manifest; read the full Overview, provider/sync/completion/coverage/tombstone/protocol/operational contracts in Types, Phase 1 Files, synchronization/normalization/coverage/tombstone Functions and Classes, sync/coverage/parity tests, governance, Phase 1B Order, and all status. Require accepted Phase 1A and use only Gate 0's runner/schema/limits. Record baseline and Phase 1B-started status. Implement streamed backpressured ingestion, completion proof, immutable revision writes, adaptive capability/backoff, normalization/search-document persistence, section passes, unit-boundary checkpoints, safe tombstones, lifecycle cancellation, shadow parity, telemetry, and fault tests. Non-paginated interruption restarts from byte zero. Do not route any browse/search UI to local data or remove existing fallback/warming. Test crashes, malformed/partial/timeout/cancel, category moves, false deletion, quota, profile switch, relaunch, playback, privacy, and rollback on OLED G1. Append deterministic samples, throughput/storage/p50/p95/parity/recovery evidence; stop at Gate 1.
```

## Phase 2A — local category browsing

Goal: cut category and asset browsing to local data where coverage is complete.

1. Add feature flags and `CatalogService`.
2. Add coverage-aware `listCategories` and `listAssets`.
3. Change `openSection` and `loadCategory` to use the service.
4. Keep network fallback for partial/no coverage.
5. Add complete/partial/stale UI state.
6. Add DB corruption fallback.
7. Run parity, remote UX, provider-outage, and rollback tests.
8. Deploy and compare category navigation latency.
9. Keep global search on the current path.

Acceptance:

- local complete categories are authoritative;
- partial categories merge/fallback correctly;
- rollback flag works;
- playback and remote navigation regressions pass.

### Future-session task prompt: Phase 2A

```text
Implement only Phase 2A from @implementation_plan.md. Verify the freeze manifest; read the full Overview including normative Phase 2 routing/hybrid rules, paging/read/feature contracts in Types, Phase 2 Files, CatalogService/Repository Functions, UI/coverage/rollback tests, governance, Phase 2A Order, and status. Require accepted Gate 1. Record baseline and Phase 2A-started status. Implement feature-flagged category/asset reads with snapshot-bound cursors, deterministic sorts/counts, coverage/source/issues, bounded hybrid sessions, stale/partial/offline/provider/DB-corrupt behavior, cancellation, profile isolation, TV indicators, and network-only rollback. Route only openSection/loadCategory; global search and identity remain unchanged. Test all routing-table cells, invalid/expired cursors, activation during paging, truncation, adult filtering, provider outage, corruption/rebuild, D-pad/focus/playback, privacy, and rollback on OLED G1. Append category corpus, p50/p95, discrepancy, UX, and rollback evidence; stop after Phase 2A acceptance.
```

## Phase 2B — local search and in-memory index

Goal: serve global search locally for complete coverage and hybridize partial coverage.

The common future-session protocol is mandatory.

1. Validate the Phase 1B revision-owned search-document format and run its explicit Phase 2B backfill/migration if the accepted document version changed.
2. Build the active-profile token/prefix/facet index incrementally from cursor pages under explicit document/token/prefix/estimated-byte limits.
3. Add incremental index updates, release on profile switch, and paged persisted-search fallback for overflow.
4. Add local ranking/filtering/paging without silently dropping authoritative results.
5. Route `runGlobalSearch` through `CatalogService.search`.
6. Merge network fallback only for uncovered scope.
7. Retain exact-query cache only if measured benefit remains.
8. Add source/coverage status to results.
9. Benchmark 10k/50k/100k documents on OLED G1.
10. Decide whether trigrams are unnecessary or require a new plan.
11. Retire current complete-catalog warming only after rollback proof.

Acceptance: Gate 2 in `[Overview]`.

### Future-session task prompt: Phase 2B

```text
Implement only Phase 2B from @implementation_plan.md. Verify the freeze manifest; read the complete Phase 2 routing/paging/search/index contracts, Files/Functions/Tests, Gate 2, governance, Phase 2B Order, and status. Require accepted Phase 2A. Record baseline and Phase 2B-started status. Migrate/use Phase 1B search documents, load cursor pages into the bounded token/prefix/facet index, implement persisted overflow search, deterministic ranking/counts/cursors, coverage-aware local/hybrid search, cancellation/profile cleanup, source/issues UI, and network-only rollback. Never materialize the full catalog, silently drop overflow results, add trigrams, or implement identity/Phase 4 facets. Test 10k/50k/100k, all limits, paging activation, hybrid duplicate/loss, stale/offline/corrupt paths, adult policy, heap/long tasks, D-pad/playback, privacy, and retirement rollback. Run Gate 2's category/query samples and p50/p95 targets; append complete evidence and stop at Gate 2.
```

## Phase 3A — namespaced identity foundation

Goal: correct external identity semantics and create canonical/availability stores.

The common future-session protocol is mandatory. Metadata enrichment remains demand-driven and budgeted.

1. Add opaque Nova Play canonical/person IDs plus entity-safe namespaced external-ID indexes.
2. Migrate metadata adapters away from overloaded `tmdbId`.
3. Add canonical title, alias, availability, identity override stores.
4. Add deterministic identity candidate policy.
5. Backfill candidates while keeping provider/manual aliases and evidence profile-scoped.
6. Auto-confirm only high-confidence policy cases; enrichment is prioritized and bounded rather than a full-catalog sweep.
7. Persist manual reject/confirm precedence.
8. Add collision/remake/language tests.
9. Run a transient sanitized shadow mapping report through identity telemetry; do not create the Phase 4B diagnostics store.

No Known For UI cutover yet.

### Future-session task prompt: Phase 3A

```text
Implement only Phase 3A from @implementation_plan.md. Verify the freeze manifest; read identity/enrichment/store contracts, fixed matcher policy, Files/Functions/Tests, Gate 3, governance, Phase 3A Order, metadata client/proxy boundaries, and status. Require accepted Gate 2. Record baseline and Phase 3A-started status. Implement opaque canonical IDs, entity-safe external-ID/alias stores, public provenance, profile-scoped evidence and durable identity subjects/lineage, candidates/links/overrides, profile-local merge/split, evidence-gated public redirects, policy-versioned deterministic matching, canonical search projections, demand-driven enrichment, migrations/backfill, transient sanitized mapping reports, privacy, and feature rollback. Correct TMDB/TVmaze/Trakt namespaces; never bulk enrich, overwrite manual decisions, leak private aliases, create the Phase 4B diagnostics store, or change Known For navigation. Run collision/remake/transliteration/language/provider-replacement/lineage and migration/rollback tests plus the required shadow audit. Append policy version, seed, confusion/precision/ambiguity evidence and decision; stop after Phase 3A mapping acceptance.
```

## Phase 3B — people graph and Known For navigation

Goal: make people credits availability-aware and safely navigable.

1. Add person and credit stores.
2. Persist metadata people/credits with namespaces.
3. Link credits to canonical titles.
4. Replace `localStreamForCredit` with repository availability lookup.
5. Open one confident provider version directly.
6. Show a TV-friendly chooser for multiple versions.
7. Show “Not available in your playlist” when absent.
8. Show an ambiguity state rather than opening a wrong title.
9. Add manual correction workflow if required.
10. Test Known For, filmography, related titles, Back, focus, and playback.
11. Record mapping precision and unresolved rate.

Acceptance: Gate 3 in `[Overview]`.

### Future-session task prompt: Phase 3B

```text
Implement only Phase 3B from @implementation_plan.md. Verify the freeze manifest; read people/credit/availability/protocol/privacy contracts, Files/Functions/Tests, Gate 3, governance, Phase 3B Order, and status. Require accepted Phase 3A shadow mapping with fixed policy version. Record baseline and Phase 3B-started status. Implement public-only, externally proven, namespaced people/person aliases/search projections/credits under the global public-metadata lease, validate that every credit targets a public canonical title, and add availability-aware Known For/filmography/related navigation. Do not persist provider/manual private people or bridge profile-private titles through public credits. Exactly one confirmed playable choice may open directly; multiple choices use deterministic TV chooser; ambiguous, detached, and unavailable states are explicit. Preserve manual title overrides and profile isolation across refresh/relaunch/provider replacement. Do not implement Phase 4 preference automation or silently choose candidates below threshold. Run the full Gate 3 identity/navigation corpus, cross-scope rejection, migration/privacy/rollback, D-pad/Back/focus/playback and provider-outage scenarios on OLED G1. Append sample/confusion/unresolved/chooser/wrong-navigation evidence and rollback; stop at Gate 3.
```

## Phase 4A — language, quality, and version grouping

Goal: let users control the visible library without destructive default filtering.

1. Add settings contracts and migrations.
2. Add preferred language order.
3. Add unknown-language policy.
4. Add quality/version preference.
5. Group equivalent provider assets under canonical titles.
6. Add compact version chooser.
7. Filter read/search models rather than deleting records.
8. Add optional explicit category sync exclusion only after warnings.
9. Test script/language ambiguity and user overrides.
10. Run TV remote UX tests.

### Future-session task prompt: Phase 4A

```text
Implement only Phase 4A from @implementation_plan.md. Verify the freeze manifest; read Phase 4 settings/evidence/parental/version/user-state contracts and policies, Files/Functions/Tests, Gate 4, governance, Phase 4A Order, current storage/content-rating behavior, and status. Require accepted Gate 3. Record baseline and Phase 4A-started status. Implement schema-versioned nested preferences, safe legacy/PIN migration with rollback verification, language/audio/subtitle/quality evidence and fixed precedence, unknown read-model policy, adult/rating enforcement at every boundary, deterministic version groups/chooser, and explicit warned sync exclusions. Retain all catalog records by default; never mutate protected source state or expose protected metadata before authorization. Test every legacy setting, migration failure, 100-case language/version corpus, 50 parental boundaries, PIN redaction/session behavior, profile isolation, D-pad/Back/focus/playback, performance, and rollback. Append evidence; stop after Phase 4A acceptance.
```

## Phase 4B — advanced filters and collections

Goal: expose the normalized library’s highest-value user features.

1. Add facets for people, genre, year, country, language, quality, watched, favorites, and recently added.
2. Add remote-friendly filter sheets.
3. Add saved collections.
4. Add collections for unwatched, new episodes, selected people, language, and 4K.
5. Add provider/storage/sync diagnostics.
6. Add offline/provider-outage UX.
7. Measure search/index memory and UI latency.
8. Keep recommendation algorithms deferred; they require a change-controlled plan amendment and new freeze.

### Future-session task prompt: Phase 4B

```text
Implement only Phase 4B from @implementation_plan.md. Verify the freeze manifest; read protected-state/episode/collection/diagnostic/facet contracts and policies, Files/Functions/Tests, Gate 4, governance, Phase 4B Order, and status. Require accepted Phase 4A. Record baseline and Phase 4B-started status. Implement read-only favorite/resume projection with source fingerprints, detached/remapped lifecycle, stable episode observations/acknowledgements, saved query definitions, dynamic collections, deterministic facets/counts/paging, redacted bounded diagnostics/export, offline/provider-error UX, and remote focus restoration. Do not migrate authority from localStorage, store collection result snapshots, guess unknown episode identity, add recommendations/artwork blobs, or mutate source user state during rebuild. Test projection under abort/quota/corruption, collection migration/isolation, recently-added/new-episode semantics, all facets, diagnostics privacy/retention, OLED G1 focus/overscan/performance/rollback. Complete Gate 4 evidence and stop.
```

## Phase 5 — ADR-005 background synchronization topology discovery

**Status:** accepted for planning only; no background-infrastructure implementation is approved.

**Default decision:** retain the Gate-0-selected foreground runner. Insufficient evidence, failed probes, unacceptable security, or excessive operational burden always retain foreground sync; none automatically authorizes a service or Hub.

### Evidence window and escalation triggers

Use at least 30 active-use days after Gate 4, with sanitized aggregates for at least 20 foreground sync attempts and at least 10 naturally interrupted launches. Phase 5 may be opened earlier only for a documented critical correctness issue that cannot be solved by the foreground runner.

A nonforeground option is justified for evaluation only when at least one trigger persists after foreground optimization:

- p95 time to current complete coverage exceeds 15 minutes;
- more than 25% of due syncs remain incomplete after three subsequent app launches;
- more than 20% of active-use days begin with coverage older than 48 hours;
- users must keep the app open solely for synchronization in more than 20% of measured syncs;
- foreground work repeatedly violates an accepted playback/UI budget.

### Decision matrix

| Criterion | Foreground runner | Packaged webOS service | Opt-in Nova Hub |
| --- | --- | --- | --- |
| Current disposition | Approved default after Gate 0 | Unapproved; probe only | Unapproved; discovery only |
| Closed-app work | No | Only if Activity Manager/lifecycle probe proves it | Yes while an explicitly configured Hub is running |
| Catalog authority | On-TV active revisions | Provider remains authority; TV controls activation | Provider remains authority; TV controls import/activation |
| Credentials | Existing on-TV profile boundary | On-TV service boundary only after security review | Per-profile opt-in transfer only after pairing/security approval |
| Network exposure | Provider outbound only | Provider outbound only | Local authenticated endpoint; no Internet exposure by default |
| Offline failure | Serve local catalog | Serve local catalog | Serve TV local catalog; Hub outage is nonblocking |
| Update burden | Existing app | App/service compatibility matrix | Separate server/client operations and support |
| Multi-profile isolation | Existing profile keys/leases | Mandatory equivalent isolation | Mandatory per-profile authorization and revocation |
| Backup role | Protected user state remains on TV | No new backup authority | Optional encrypted export only under later ADR |
| Rejection default | Continue foreground | Continue foreground | Continue foreground |

### Authority and conflict model

- Provider data remains authoritative for availability.
- The TV owns `ActiveSectionRecord` routing, protected user state, manual identity overrides, parental settings, and final import acceptance.
- A service/Hub may produce candidate immutable revisions only; it cannot directly mutate `ActiveSectionRecord`.
- Imports include profile ID, schema/protocol versions, source generation, completion proof, content hash, created/expiry times, and idempotency key.
- TV-side activation applies the same completion, coverage, quota, profile-isolation, lease, tombstone, and rollback contracts as foreground sync.
- Concurrent candidates resolve by explicit generation/completion proof; user/manual state always wins over remote derived state.
- Clock skew cannot prove freshness or deletion; the TV validates elapsed age and source evidence.

### Security and local-network threat model

Assume a hostile or compromised LAN peer, replay, device impersonation, DNS/mDNS spoofing, stale/replayed snapshots, stolen bearer material, and accidental cross-profile access.

Any later Hub design must require:

- explicit TV-displayed pairing with user confirmation;
- unique device identity and per-profile authorization;
- authenticated encryption in transit; TLS certificate/fingerprint pinning or an equivalently reviewed channel;
- short-lived/revocable credentials stored outside logs/config exports where the platform permits;
- replay protection through nonces, expiry, idempotency, and monotonically accepted generation evidence;
- disabled-by-default discovery; mDNS/SSDP may suggest a candidate but never establishes trust;
- no router port forwarding, public discovery, telemetry upload, or cloud relay by default;
- rate limits, bounded payloads, input validation, audit events, profile revocation, and factory-reset removal;
- explicit disclosure if platform limitations prevent secure secret storage.

A packaged service must prove least privilege, package/app identity validation, private IPC, no externally exposed unauthenticated method, and credential erasure on profile removal.

### Compatibility, backup, update, and rollback

- External protocol starts at major 1/minor 0 and uses the plan's versioned envelope.
- Unsupported major versions fail closed; minor versions add optional fields only.
- Every candidate declares database schema, minimum TV reader, normalization version, identity-policy version, and content hash.
- TV import never upgrades the DB implicitly; incompatible candidates are rejected with a sanitized reason.
- Keep the last accepted active revision until a candidate is fully verified and activated.
- Rolling upgrade tests cover old TV/new service, new TV/old service, interruption, downgrade, revocation, and protocol-major rejection.
- A Hub is not the sole backup of favorites, resume, settings, or manual overrides. Any future protected-state backup requires separate encryption, recovery-key, conflict, retention, and consent design.
- Disabling/unpairing removes service authorization and queued candidates without deleting the TV catalog or user state.

### Required discovery evidence

For a packaged service probe:

- documented webOS model/OS compatibility;
- Activity Manager registration and scheduling behavior across reboot, standby, app update, network loss, and account failure;
- at least 30 scheduled opportunities and 10 forced interruptions;
- CPU/memory/storage/network and playback interference;
- private IPC/authentication and package lifecycle;
- uninstall/update/rollback and credential erasure.

For Nova Hub discovery:

- deployment/update/support model for NAS/Raspberry Pi/home server;
- pairing, pinned authenticated channel, revocation, discovery spoof resistance, and LAN-offline behavior;
- protocol/schema matrix and malformed/replayed/oversized payload tests;
- host backup/recovery and data-directory permissions;
- at least 30 scheduled syncs, 10 TV/Hub network interruptions, and service restart/upgrade tests;
- explicit catalog/credential ownership and opt-in UX.

### ADR outcomes

`ADR-005` must choose exactly one:

- `retain-foreground`: no infrastructure work approved;
- `service-probe-rejected`: record reasons and retain foreground;
- `hub-rejected`: record reasons and retain foreground;
- `service-implementation-plan-approved`: requires a new implementation ADR and user approval;
- `hub-implementation-plan-approved`: requires a new implementation ADR and user approval;
- `deferred-insufficient-evidence`: retain foreground and define the next evidence review date.

Phase 5 discovery ends after the ADR. It must not create implementation code.

### Future-session task prompt: Phase 5 discovery

```text
Perform only Phase 5 discovery from @implementation_plan.md. Read the full Overview; Cross-phase operational invariants and protocol contracts in Types; Phase 5 discovery Files; External services; Testing common protocol; Gate 4 evidence; this Phase 5 order; and all @LIBRARY_ENGINE_STATUS.md entries. Verify Gate 4 is accepted and the required 30-day/attempt evidence exists. Record HEAD, dirty tree, tool versions, exact evidence period, and a Phase 5-started status entry. Analyze the foreground runner, packaged webOS service, and opt-in Nova Hub against ADR-005's triggers, authority model, threat model, protocol/schema matrix, lifecycle, backup, update, rollback, multi-profile isolation, and operational burden. Create only `docs/adr/ADR-005-background-sync-topology.md` and its sanitized evidence template. Do not add service/Hub code, package declarations, discovery clients, endpoints, credentials, or scheduling. Run documentation checks, privacy review, and `rtk git diff --check`; append the selected ADR outcome and risks to status. Stop after the decision. Any implementation requires a separate explicitly approved ADR/session.
```

## Section navigation commands for future sessions

PowerShell commands compatible with this Windows repository:

```powershell
# Overview
(Get-Content implementation_plan.md) |
  Select-String -Pattern '^\[Overview\]$' -Context 0,10000 |
  ForEach-Object { $_.Context.PostContext } |
  Select-Object -First ((Select-String -Path implementation_plan.md -Pattern '^\[Types\]$').LineNumber - (Select-String -Path implementation_plan.md -Pattern '^\[Overview\]$').LineNumber - 1)

# Types
$lines = Get-Content implementation_plan.md
$start = (Select-String -Path implementation_plan.md -Pattern '^\[Types\]$').LineNumber
$end = (Select-String -Path implementation_plan.md -Pattern '^\[Files\]$').LineNumber
$lines[($start - 1)..($end - 2)]

# Files
$lines = Get-Content implementation_plan.md
$start = (Select-String -Path implementation_plan.md -Pattern '^\[Files\]$').LineNumber
$end = (Select-String -Path implementation_plan.md -Pattern '^\[Functions\]$').LineNumber
$lines[($start - 1)..($end - 2)]

# Functions
$lines = Get-Content implementation_plan.md
$start = (Select-String -Path implementation_plan.md -Pattern '^\[Functions\]$').LineNumber
$end = (Select-String -Path implementation_plan.md -Pattern '^\[Classes\]$').LineNumber
$lines[($start - 1)..($end - 2)]

# Classes
$lines = Get-Content implementation_plan.md
$start = (Select-String -Path implementation_plan.md -Pattern '^\[Classes\]$').LineNumber
$end = (Select-String -Path implementation_plan.md -Pattern '^\[Dependencies\]$').LineNumber
$lines[($start - 1)..($end - 2)]

# Dependencies
$lines = Get-Content implementation_plan.md
$start = (Select-String -Path implementation_plan.md -Pattern '^\[Dependencies\]$').LineNumber
$end = (Select-String -Path implementation_plan.md -Pattern '^\[Testing\]$').LineNumber
$lines[($start - 1)..($end - 2)]

# Testing
$lines = Get-Content implementation_plan.md
$start = (Select-String -Path implementation_plan.md -Pattern '^\[Testing\]$').LineNumber
$end = (Select-String -Path implementation_plan.md -Pattern '^\[Implementation Order\]$').LineNumber
$lines[($start - 1)..($end - 2)]

# Implementation Order
$lines = Get-Content implementation_plan.md
$start = (Select-String -Path implementation_plan.md -Pattern '^\[Implementation Order\]$').LineNumber
$lines[($start - 1)..($lines.Length - 1)]
```

Git for Windows equivalents, if `sed.exe` and `cat.exe` are available:

```cmd
"C:\Program Files\Git\usr\bin\sed.exe" -n "/^\[Overview\]$/,/^\[Types\]$/p" implementation_plan.md | "C:\Program Files\Git\usr\bin\cat.exe"
"C:\Program Files\Git\usr\bin\sed.exe" -n "/^\[Types\]$/,/^\[Files\]$/p" implementation_plan.md | "C:\Program Files\Git\usr\bin\cat.exe"
"C:\Program Files\Git\usr\bin\sed.exe" -n "/^\[Files\]$/,/^\[Functions\]$/p" implementation_plan.md | "C:\Program Files\Git\usr\bin\cat.exe"
"C:\Program Files\Git\usr\bin\sed.exe" -n "/^\[Functions\]$/,/^\[Classes\]$/p" implementation_plan.md | "C:\Program Files\Git\usr\bin\cat.exe"
"C:\Program Files\Git\usr\bin\sed.exe" -n "/^\[Classes\]$/,/^\[Dependencies\]$/p" implementation_plan.md | "C:\Program Files\Git\usr\bin\cat.exe"
"C:\Program Files\Git\usr\bin\sed.exe" -n "/^\[Dependencies\]$/,/^\[Testing\]$/p" implementation_plan.md | "C:\Program Files\Git\usr\bin\cat.exe"
"C:\Program Files\Git\usr\bin\sed.exe" -n "/^\[Testing\]$/,/^\[Implementation Order\]$/p" implementation_plan.md | "C:\Program Files\Git\usr\bin\cat.exe"
"C:\Program Files\Git\usr\bin\sed.exe" -n "/^\[Implementation Order\]$/,$p" implementation_plan.md | "C:\Program Files\Git\usr\bin\cat.exe"
```

## Master progress checklist

- [ ] Phase 0: Prove IndexedDB, Worker, quota, persistence, and cancellation on OLED G1.
- [ ] Gate 0: Record runner recommendation and go/no-go.
- [ ] Phase 1A: Implement durable schema/repository in isolation.
- [ ] Phase 1B: Implement adaptive resumable sync in shadow mode.
- [ ] Gate 1: Accept recovery, coverage, storage, and parity.
- [ ] Phase 2A: Cut category browsing to coverage-aware local reads.
- [ ] Phase 2B: Cut global search to local/hybrid token/prefix/facet index.
- [ ] Gate 2: Accept local browse/search and rollback.
- [ ] Phase 3A: Add namespaced canonical identity and availability mapping.
- [ ] Phase 3B: Add people graph and Known For/filmography navigation.
- [ ] Gate 3: Accept mapping precision and ambiguity handling.
- [ ] Phase 4A: Add language/quality preferences and version grouping.
- [ ] Phase 4B: Add advanced filters, saved collections, and diagnostics.
- [ ] Gate 4: Accept policy, protected state, collections, diagnostics, remote UX, and rollback.
- [ ] Phase 5: Complete ADR-005 discovery only after its evidence prerequisites.
