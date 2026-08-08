# Implementation Plan

[Overview]

Build Nova Play’s local-first Library Engine: a profile-isolated, durable, coverage-aware catalog that synchronizes IPTV provider data into IndexedDB, serves browse/search/navigation from local data, and later adds canonical title, person-credit, language, version, and availability intelligence.

## Purpose and north-star behavior

Nova Play should evolve from a network-first Xtream client into a personal media library whose normal read path is local:

> Nova Play opens, browses, filters, and searches from its own local catalog. The IPTV provider is an asynchronous replication source and playback origin, not a dependency in the normal UI critical path.

The durable catalog is not merely a search cache. It is the foundation for:

- instant browse and global search;
- reliable operation during provider latency or partial outages;
- resumable synchronization across app launches;
- canonical title identity;
- person-to-title availability navigation;
- duplicate and language-version grouping;
- richer filters and saved collections;
- provider capability diagnostics;
- safe daily maintenance;
- future local recommendations and optional companion-server support.

The implementation must be delivered phase by phase in separate sessions. Every phase has an explicit acceptance gate and rollback boundary. No later phase should begin until the preceding phase passes unit tests, production build, packaged webOS verification where required, and its documented go/no-go criteria.

## Current architecture and research record

Nova Play is currently a TypeScript/Vite packaged webOS application:

- `public/appinfo.json` declares a single `"type": "web"` application with no packaged service.
- `vite.config.ts` emits an ES2015 IIFE bundle into `webos-app`.
- `tsconfig.json` type-checks modern TypeScript/DOM declarations, but runtime output must remain compatible with older webOS Chromium.
- `src/main.ts` owns most UI state, navigation, catalog browsing, global search, playback, and current in-memory caches.
- `src/xtream-client.ts` owns provider requests and normalization.
- `src/storage.ts` persists profiles, settings, favorites, and resume history in synchronous `localStorage`.
- There is no IndexedDB catalog, service worker, SharedWorker, browser worker entry, or packaged webOS service.
- The optional Cloudflare metadata Worker enriches titles and people but should not receive IPTV credentials or full private catalogs by default.

Current persistent state is intentionally small:

- active and saved profiles;
- per-profile settings;
- at most 500 favorites;
- at most 100 resume records;
- no persistent categories, provider assets, search documents, metadata graph, provider health, or sync checkpoints.

Current runtime optimization includes:

- 15-minute in-memory category stream cache;
- exact-query LRU/TTL result cache;
- bounded in-memory complete-catalog warming;
- sequential catalog warm queue;
- cooperative streamed provider search;
- playback-aware cancellation;
- performance tracing.

These optimizations remain useful as migration/fallback mechanisms, but they are not the final source of truth.

## Reproducible planning baseline

The plan and status record are operational inputs, not disposable notes. Before Phase 0 begins:

- preserve `implementation_plan.md` and `LIBRARY_ENGINE_STATUS.md` in a sanitized checkpoint commit, or record a retained patch plus SHA-256 manifest for every in-scope untracked file;
- record the exact `HEAD`, branch/upstream relation, dirty tracked/untracked inventory, Node/npm/webOS CLI versions, and baseline test/build results;
- name intentional working-tree exclusions;
- never archive credentials, provider URLs, private catalog data, exported traces, or secret-bearing local deployment files;
- do not start a phase from an unnamed dirty baseline;
- append a new baseline snapshot whenever the accepted implementation base changes.

At the time of the architecture reassessment, `HEAD` was `e22a2d98d83b0d04ea81ce3e002208e2a9e418bf`, and both planning artifacts were untracked. Gate 0 remains pending until the planning baseline is durably preserved.

## Physical LG OLED G1 findings

Real-device traces were captured through `ares-inspect` and CDP on `lg-oled-g1`.

Observed facts:

- Whole-library `get_live_streams`, `get_vod_streams`, and `get_series` requests can fail to answer in a useful time window.
- Category endpoints may also stall intermittently.
- A Live TV match-all warm reached the 6,001-item safety boundary in approximately 2.7 seconds and was correctly marked oversized for the current in-memory policy.
- A prior search could remain active for roughly a minute while waiting for provider work.
- The bounded search flow now starts whole-library requests immediately, gives them 10 seconds, then gives category fallback requests 6 seconds.
- The resulting partial search completed in approximately 16.1 seconds rather than waiting roughly a minute.
- Partial provider results must not be treated as authoritative or cached as complete.
- These measurements prove that the durable synchronizer cannot assume healthy whole-library endpoints or completion in one app session.

The Library Engine must therefore support:

- an adaptive whole-library fast path;
- resumable category crawling;
- endpoint health/backoff;
- partial coverage;
- durable progress;
- safe continuation on future foreground launches.

## Architectural principles

1. **Local-first reads, provider-authoritative replication**  
   Local data serves the UI; the provider remains the authority for playable availability.

2. **Coverage is explicit**  
   An empty local result is authoritative only when the relevant section/category coverage is complete and current.

3. **Provider assets are not canonical titles**  
   Multiple language/quality/provider entries may represent one movie or series.

4. **Never replace a good active snapshot with incomplete work**  
   Staging changes are activated only at safe category/section boundaries.

5. **Never infer deletion from a failed or partial sync**  
   Deletion requires complete successful coverage and a grace policy.

6. **User data outranks rebuildable catalog data**  
   Favorites, resume history, parental decisions, and manual identity corrections are never silently evicted.

7. **Playback has priority**  
   Synchronization pauses or cancels before playback startup and must never compete for the TV’s media/UI resources.

8. **Privacy by default**  
   IPTV credentials and private catalog data remain on-device unless the user explicitly opts into a local companion service.

9. **Measured complexity**  
   Do not add trigram indexes, artwork blobs, a packaged service, or cloud catalog synchronization until device evidence justifies them.

10. **Phase-gated migration**  
    The current network path remains available until local parity and recovery behavior are proven.

## Runtime topology

Preferred topology after Phase 0 passes:

```text
Main UI thread
  ├── CatalogRepository (read API)
  ├── SyncController (lifecycle and worker messages)
  ├── small session caches/search index
  └── current playback/navigation code
           │
           ▼
Classic Web Worker
  ├── provider adapter
  ├── streamed parser
  ├── normalization
  ├── identity-candidate generation
  ├── search-document generation
  └── batched IndexedDB writes
           │
           ▼
IndexedDB: nova-play-library
  ├── provider catalog and coverage
  ├── staging/sync/checkpoint state
  ├── canonical title/person graph
  ├── search projections
  └── provider capability health
```

Required fallback topology if worker-side IndexedDB is unreliable:

```text
Main UI thread
  ├── same CatalogRepository
  ├── same sync state machine
  └── cooperative scheduler with short time slices
           │
           ▼
IndexedDB: same schema and contracts
```

The database and repository contracts must not depend on which runner is used.

## Lifecycle reality

A Web Worker stops when the packaged web app process closes. “Daily synchronization” means:

- on the first foreground launch after the last successful refresh becomes stale;
- never blocking Home, Search, or playback;
- continuing from durable checkpoints;
- doing no work on days when the app is never opened.

True closed-app scheduling is a later optional phase requiring either:

- a proven packaged webOS service and Activity Manager integration; or
- an optional Nova Hub running on a NAS/Raspberry Pi/home server.

## Synchronization model

### Initial build

1. Open the existing active local catalog immediately, even if empty or stale.
2. Load persisted provider capability health.
3. Attempt category manifests using bounded requests.
4. Prefer a proven healthy whole-library endpoint.
5. Otherwise build a category crawl queue.
6. Prioritize:
   - categories containing favorites/resume assets;
   - user-preferred languages;
   - recently visited sections/categories;
   - remaining categories.
7. Ingest one bounded unit at a time into a new immutable revision; never overwrite the active revision.
8. Seal a revision only after the request and parser produce explicit completion proof.
9. Atomically update the active-section routing record, coverage proof, revision metadata, and checkpoint in one short IndexedDB transaction.
10. Expose progress to the UI.
11. Resume only at durable sync-unit boundaries. Standard non-paginated Xtream responses restart from byte zero after interruption.

### Daily first-foreground-run maintenance

1. Open local data and render immediately.
2. Compare `lastSuccessfulRefreshAt` to the refresh policy, initially 20–24 hours.
3. Validate account access without deleting local data on failure.
4. Refresh category manifests.
5. Reuse provider capability/backoff decisions.
6. Reconcile changed or due categories.
7. Activate completed revisions progressively.
8. Finalize a section generation only after complete successful coverage.
9. Mark removal candidates; do not delete immediately.
10. Prune safe rebuildable data after success.

### Deletion policy

A provider asset absent from one response is not immediately deleted.

Required rules:

- record `lastSeenGeneration` and the comparable complete section pass that supplied the observation;
- category absence alone cannot prove provider-level removal because assets may move categories;
- create or advance a tombstone only from a complete comparable section pass, or equivalent complete membership proof, with no failed, cancelled, timed-out, or malformed units;
- retain the asset for at least one later complete confirming pass and the configured grace period;
- cancel tombstoning if it reappears;
- project favorite/resume references from protected `localStorage` state before pruning and preserve referenced assets through a detached-availability state;
- offer remapping to another equivalent provider asset only where identity confidence is high.

### Revision activation and crash recovery

- Provider catalog snapshots are immutable revisions. One `ActiveSectionRecord` per profile/section is the sole authority that points reads to either a whole-section revision or an explicit category-revision set.
- Active records remain readable during synchronization.
- One expiring single-writer lease per profile prevents overlapping controllers/runners from mutating the same catalog.
- Sync run and checkpoint records are written durably.
- Network requests, parsing, and large batch preparation never occur inside an IndexedDB transaction.
- Activation is one short transaction updating the active-section routing record, matching coverage proof, sealed revision metadata, and durable checkpoint.
- Incomplete writing revisions are tagged by `syncRunId` and `requestAttemptId`.
- Startup recovery performs read-only profile discovery, then acquires a `startup-recovery` maintenance lease for each profile before any mutation. It resumes only sealed unit-level work; incomplete non-paginated responses restart from byte zero and their writing revisions are abandoned.
- Abandoned and superseded revisions are pruned only after confirming that no `ActiveSectionRecord` references them.
- IndexedDB version upgrades contain schema operations only. Large backfills are resumable post-open jobs.
- An aborted upgrade leaves the prior database version intact. A successful incompatible upgrade uses a controlled rebuild of rebuildable stores; feature-flag rollback is not assumed to downgrade the schema.

## Gradual read cutover

Read routing is based on coverage, not merely whether any local rows exist:

1. exact in-memory query cache;
2. complete/current local coverage;
3. partial local coverage plus network fallback;
4. current provider path where no local coverage exists.

During shadow mode, local and network results are compared but the UI still uses the current path.

During cutover:

- completed local categories are authoritative;
- partial sections display a coverage/refresh state;
- global search merges local completed coverage with network results for uncovered areas;
- deduplication uses stable provider asset keys;
- the UI clearly distinguishes complete, partial, stale, and unavailable results.

### Normative Phase 2 read and hybrid rules

These semantics are fixed architecture contracts:

| Local state | Provider state | Result |
| --- | --- | --- |
| Complete/current matching coverage | Any | Local authoritative; no provider request |
| Complete/stale matching coverage | Online | Return stale local immediately, refresh asynchronously; do not mix generations |
| Complete/stale matching coverage | Offline/failed | Return stale local with issue; never call it current |
| Partial matching coverage | Online | Hybridize completed local scopes with bounded provider results only for uncovered scopes |
| Partial matching coverage | Offline/failed | Return local partial with non-authoritative count and issue |
| No matching coverage | Online | Current network path |
| No matching coverage | Offline/failed | Unavailable result with explicit issue |
| DB unavailable/corrupt | Online | Current network path and sanitized diagnostic |
| DB unavailable/corrupt | Offline | Unavailable; preserve user state and offer controlled rebuild |

Sorting is deterministic:

- category `provider`: `providerOrder`, then `CategoryKey`;
- category `name`: folded normalized name, then `CategoryKey`;
- asset `provider`: `providerOrder`, then `ProviderAssetKey`;
- `name`: folded normalized name, year with missing last, then key;
- `recent`: `firstSeenAt` descending, provider-added time secondary, then key;
- `rating`: rating missing last, rating descending, then folded name/key;
- `year`: year missing last, year descending, then folded name/key;
- search `relevance`: score descending, exact-title rank, folded name, year, then key.

Local cursor pages read the immutable revision and availability-overlay generations captured in `ReadSnapshot`. A newly activated revision does not invalidate a cursor while every referenced revision/overlay is retained; the cursor continues against its captured snapshot. Return `snapshot-expired` only after a referenced generation is pruned or the cursor TTL elapses. Current active-generation mismatch alone is not an error.

For a hybrid read, `CatalogService` materializes the accepted, deduplicated, deterministically sorted category/asset/search records with their sort tuples and local snapshot identity into a bounded in-memory `HybridReadSession`. Every hybrid next cursor contains `hybridSessionId` and resolves only that session:

- maximum eight sessions per profile;
- five-minute TTL;
- maximum 500 accepted merged records total per session, including local and provider fallback records;
- local candidates are fetched in bounded repository pages and merged incrementally; the service never materializes an uncapped local scope;
- paging operates only over that immutable accepted session;
- overflow returns `truncated=true`, a lower-bound/unknown count, and `network-truncated`;
- standard non-paginated Xtream responses cannot claim continuation beyond accepted materialized results;
- relaunch/profile switch expires all sessions and later cursors return `snapshot-expired`.

Deduplicate first by `ProviderAssetKey`. After Phase 3, confirmed canonical duplicates remain separate playable versions unless the request explicitly asks for grouped canonical results. A provider record may replace local stale display fields only when it has the same provider key; it never mutates the active revision.

Adult/parental filtering is applied before result acceptance and count calculation. Unsupported network-only facets return `unsupported-filter`; they are never silently ignored.

## Product capabilities unlocked

High-value features after the durable catalog is stable:

- instant local browse and global search;
- actor/director/title/alias search;
- genre, year, country, language, quality, section, watched, and favorite filters;
- reliable Known For and filmography navigation;
- duplicate quality/language variants grouped under one title;
- preferred-version selection;
- recently added based on local observations;
- resume continuity across provider ID replacement;
- unwatched/new episode collections;
- local availability badges on metadata recommendations;
- richer parental filtering;
- browse/search during provider outages;
- provider sync, storage, and coverage diagnostics.

Later candidates:

- local “Because you watched…” recommendations;
- multi-provider availability;
- local EPG/catch-up discovery;
- change history;
- optional Nova Hub synchronization.

Deferred until measurements justify them:

- persisted artwork blobs;
- full trigram/n-gram indexing;
- automatic enrichment of every title;
- cloud storage of IPTV credentials/catalog data;
- packaged webOS background service.

## Security and privacy

- Keep credentials in the existing profile storage boundary during early phases.
- Send credentials to a Worker only in a versioned `start-sync` payload for the active profile. A live paused Worker resumes with `profileId`, `runId`, and the controller's current fenced lease guard only; a restarted Worker receives a new credential-bearing `start-sync` carrying a resume descriptor and current guard.
- The controller transfers credentials directly to the selected Worker, validates the profile/run association, and releases its temporary message reference immediately after acknowledgement.
- Never write credentials to IndexedDB catalog stores, generic message logs, traces, errors, cache keys, cursors, status files, or exported diagnostics.
- Provider identity in IndexedDB uses the local `profileId`, not a credential-derived hash exposed externally.
- Treat every provider URL as potentially secret-bearing. Provider base URLs remain only in the existing profile boundary; playback/direct-source URLs are ephemeral secrets; only validated durable artwork/direct-source values may enter catalog records.
- Reject provider base URLs containing URL userinfo, query, or fragment. Errors and telemetry use closed allowlists; raw exception messages, stacks, causes, request/response objects, and URLs are never serialized.
- Do not send private catalog data to the Cloudflare metadata Worker in bulk.
- Metadata enrichment requests should use canonical title IDs or minimal title/year inputs.
- An optional Nova Hub must be explicitly configured, local-network scoped, authenticated, and disabled by default.

## Storage policy

Storage tiers, from most protected to most disposable:

1. user state: favorites, resume, parental decisions, manual identity corrections;
2. active provider catalog and availability links;
3. canonical identities and aliases;
4. search documents/indexes;
5. metadata cache;
6. old staging generations, stale diagnostics, and rebuildable derived indexes.

Rules:

- store compact normalized objects, not raw provider payloads;
- store only validated queryless `DurableArtworkUrl` references and explicitly credential-free `DurableDirectSourceUrl` values, never raw provider/playback URLs or artwork blobs, in initial phases;
- use batched writes and short transactions;
- probe `navigator.storage.estimate()` and `navigator.storage.persist()` where available;
- account for the temporary active-plus-staging peak, which may approach twice the active catalog;
- where quota estimates are unavailable, maintain a conservative measured bytes-per-record estimate;
- define measured soft and hard thresholds and stop before starting a revision that cannot retain the active snapshot safely;
- prune in order: abandoned revisions, unreferenced superseded revisions, stale diagnostics, then rebuildable search/metadata projections;
- never prune an active revision before replacement activation;
- never delete user state to make room for catalog data;
- expose storage health in diagnostics.

## Language and version strategy

Language is evidence-based and may be unknown.

Evidence sources:

- provider/category prefixes;
- category names;
- title script;
- metadata original language/country;
- user corrections.

Initial behavior:

- infer and store language candidates with confidence;
- retain unknown and nonpreferred content;
- hide/filter in the read model rather than destructively excluding;
- allow preferred language order;
- allow inclusion of unknown language;
- allow preferred quality and original/dubbed/subtitled preferences.

Optional storage-saving mode may later exclude explicitly selected categories from synchronization, but only after users see the consequence that excluded content cannot appear in local search.

## Decision gates

### Gate 0: capability probe

Proceed only after the physical OLED G1 demonstrates the selected runner's complete evidence chain:

- persistent main-thread IndexedDB after a true app close/relaunch;
- stable create/read/update/delete, compound keys, indexes, and cursor iteration;
- deterministic classic Worker URL resolution from packaged `file://` HTML;
- Worker startup/error handling and round-trip messaging;
- Worker fetch/CORS behavior tested separately from main-thread fetch;
- worker-side IndexedDB or measured bounded Worker-to-main write messaging;
- cooperative scheduling behavior if Worker operation is unavailable;
- cancellation and transaction recovery without affecting playback;
- recorded p50/p95 batch, query, message, cancellation, and playback-startup timings;
- no app crash under representative record volumes;
- successful disposal of the probe DB and disabled/removable probe exposure in normal builds.

Runner selection is deterministic:

| Evidence | Recommendation |
| --- | --- |
| Worker messaging, provider fetch, Worker IndexedDB, persistence, cancellation, and performance all pass | `worker-idb` |
| Worker messaging/fetch pass, Worker IndexedDB fails, and bounded Worker-to-main writes plus main IndexedDB pass | `worker-main-idb` |
| Worker path fails, but main fetch/IndexedDB and cooperative scheduling meet UI/playback limits | `cooperative-main` |
| Persistent/stable main IndexedDB fails, or every runner harms playback/UI | `no-go` |

Main-thread fetch success does not prove Worker fetch compatibility. A Worker fetch/CORS failure does not imply an IndexedDB failure.

### Gate 1: shadow sync

Proceed to local read cutover only if the status entry records sample sizes and evidence showing:

- every required crash point recovers without losing the last active revision;
- profile isolation and the single-writer lease pass;
- coverage/completion manifests are accurate for all sampled successful, partial, failed, timed-out, cancelled, and malformed cases;
- parity discrepancies are classified with zero unexplained missing provider IDs in complete sampled scopes;
- zero false deletions occur, including category moves;
- active-plus-staging storage remains below measured soft limits with safe quota-failure recovery;
- playback cancellation p95 meets the accepted Gate 0 target.

### Gate 2: browse/search cutover

Gate 2 uses the normative Phase 2 read contracts in `[Types]`. Proceed to identity work only after a reproducible OLED G1 report records the query/category corpus, deterministic sampling seed, coverage mix, cache/index state, p50/p95 timings, heap deltas, discrepancy classifications, cancellation results, and rollback result.

Required evidence:

- compare at least 30 categories per section, or every category when a section has fewer than 30; include empty, small, large, stale, partial, adult-filtered, and provider-failure scopes;
- compare at least 100 deterministic search queries, including zero-result, exact title, prefix, multi-token, accent-folded, duplicate-version, adult-hidden, and cross-section queries;
- complete/current local scopes have zero unexplained missing or extra provider asset IDs and identical deterministic ordering after applying the documented local sort;
- hybrid pagination has zero duplicates and zero lost accepted records across page boundaries in the test corpus;
- empty local results are authoritative only under complete/current matching coverage;
- stale, partial, offline, provider-failed, invalid-cursor, snapshot-expired, DB-unavailable, and DB-corrupt outcomes match the normative routing table;
- DB deletion/corruption and the `network-only` feature flag restore the current provider path without affecting favorites, resume history, settings, or playback;
- cancellation and profile switch produce no late render, stale cursor reuse, or cross-profile result;
- the in-memory search index stays within its accepted document/token/prefix/byte limits and overflow uses persisted search without silently dropping authoritative results;
- Home remains unblocked and no ingestion/index task exceeds the accepted Gate 0 main-thread budget;
- provisional OLED G1 targets are category first-page p50 <= 75 ms and p95 <= 150 ms, common local-search p50 <= 50 ms and p95 <= 100 ms, cancellation acknowledgement p95 <= 250 ms, and no more than 10% playback-startup regression versus the idle median.

Gate 0 may tighten or relax only hardware-dependent numeric timing/memory limits through a dated status decision with evidence. It may not change paging, coverage, deduplication, ordering, privacy, fallback, or rollback semantics.

### Gate 3: canonical identity and availability navigation

Proceed to advanced collections only after a reproducible report records matcher policy version, deterministic sample seed, population and sample sizes by match method, confusion matrices, unresolved/ambiguity rates, migration result, privacy review, and rollback result.

Required evidence:

- external IDs have zero title/person, movie/series, or source-namespace collisions;
- audit every auto-confirmed availability link when the population is below 200; otherwise audit a reproducible stratified sample of at least 200 covering provider external IDs, exact title/year, original-title/year, aliases, languages, remakes, transliterations, and provider replacements;
- the audited auto-confirmed sample has zero incorrect mappings; for samples of at least 200, report the Wilson 95% interval and require its lower bound to exceed 98%;
- a labeled ambiguity corpus contains at least 100 cases and has zero silent low-confidence navigation;
- candidates below the auto-confirm threshold remain candidates; rejected candidates do not reappear unless their evidence version changes;
- manual confirm/reject/split/merge decisions survive refresh, relaunch, provider item-ID replacement, schema migration, and controlled rebuild;
- one confirmed playable version opens directly; multiple confirmed versions show a deterministic chooser; ambiguous and unavailable titles never open an arbitrary asset;
- at least 100 deterministic Known For/filmography navigation cases, or the full available corpus when smaller, have zero wrong-title playback;
- profile-scoped aliases, evidence, overrides, and availability never leak between profiles or into shared public canonical metadata;
- disabling the identity/people feature flag restores the accepted Phase 2 behavior without deleting canonical records or protected user state.

Matching thresholds and policy versions are fixed in the accepted Phase 3A status entry. Later threshold changes require change control and a fresh shadow audit; they are not silent tuning.

### Gate 4: advanced library policy, collections, and diagnostics

Phase 4A and Phase 4B are independently accepted. Gate 4 is the final advanced-library acceptance before any optional infrastructure discovery can influence the product architecture.

Required evidence:

- migrate every supported legacy settings shape, including plaintext parental PIN, with zero loss of unrelated playback/settings fields; injected migration failure preserves the complete pre-migration value;
- evaluate at least 100 deterministic language/version cases covering unknown language, conflicting evidence, manual overrides, original/dubbed/subtitled variants, quality ties, and unavailable preferred assets; results match the fixed precedence policy with zero nondeterministic choice;
- adult/rating policy is enforced consistently across category, browse, search, details, collections, metadata recommendation cards already present in the app, availability choices, and direct deep links; at least 50 boundary cases produce zero unauthorized reveal before PIN validation;
- PIN verification data is nonreversible, unlock is session-only, failed attempts reveal no protected metadata, and no PIN/plaintext verifier material appears in traces or diagnostics;
- favorite/resume projections reproduce every source `localStorage` record in the deterministic test corpus; projection failure or DB rebuild causes zero source mutation, truncation, or deletion;
- detached favorites/resume records remain visible, and remapping never changes the source record until an explicit user-confirmed action;
- saved collections are profile-isolated, survive relaunch/migration, save definitions rather than result snapshots, and handle missing/detached assets without corruption;
- `recently-added` and `new-episodes` follow the normative observation/acknowledgement rules and do not reset on refresh;
- every supported facet has deterministic count/sort/paging semantics; unsupported hybrid/network facets are explicit rather than ignored;
- diagnostics are redacted and bounded by retention policy; exported diagnostics contain zero credentials, provider URLs, private titles, people, or queries;
- all filter sheets, choosers, collections, diagnostics, empty/error states, and PIN flows pass D-pad focus, Back, restoration, and 1920x1080 overscan checks;
- advanced-library feature rollback restores accepted Gate 3 behavior while preserving settings, user state, identity overrides, and rebuildable Phase 4 records;
- provisional OLED G1 targets are filter/collection first-page p95 <= 150 ms, version chooser p95 <= 100 ms after data load, no new main-thread task over the accepted Gate 0 budget, and no more than 10% playback-startup regression.

Only hardware-dependent timing/memory limits may be calibrated through a dated status decision. Policy precedence, parental enforcement, protected-state authority, deterministic collection semantics, privacy, and rollback are immutable contracts.

[Types]

Introduce provider-scoped catalog, coverage, synchronization, search, identity, worker-protocol, and capability-probe contracts with explicit validation and versioning.

## Core identifiers

```ts
export type ProfileId = string
export type ProviderAssetKey = string
export type CategoryKey = string
export type CanonicalTitleKey = string
export type PersonKey = string
export type SyncRunId = string
export type SyncGeneration = number
export type RevisionId = string
export type ScopeKey = string & { readonly __scopeKey: unique symbol }
export type SectionPassId = string
export type RequestAttemptId = string

export type TitleExternalIdNamespace =
  | 'tmdb:movie'
  | 'tmdb:tv'
  | 'tvmaze:show'
  | 'trakt:movie'
  | 'trakt:show'

export type PersonExternalIdNamespace =
  | 'tmdb:person'
  | 'tvmaze:person'
  | 'trakt:person'

export type EpisodeExternalIdNamespace =
  | 'tmdb:tv:episode'
  | 'tvmaze:episode'
  | 'trakt:episode'

export type ProviderAssetPhysicalKey = [
  ProfileId,
  RevisionId,
  ProviderAssetKey,
]
export type ProviderCategoryPhysicalKey = [
  ProfileId,
  RevisionId,
  CategoryKey,
]
export type CategoryMembershipPhysicalKey = [
  ProfileId,
  RevisionId,
  CategoryKey,
  ProviderAssetKey,
]
export type SearchDocumentPhysicalKey = [
  ProfileId,
  RevisionId,
  ProviderAssetKey,
]
export type ProviderSearchTokenPhysicalKey = [
  ProfileId,
  RevisionId,
  string,
  ProviderAssetKey,
]
export type ProviderSearchPrefixPhysicalKey = [
  ProfileId,
  RevisionId,
  string,
  ProviderAssetKey,
]
export type ProviderSearchFacetKind =
  | 'section'
  | 'category'
  | 'language'
  | 'country'
  | 'genre'
  | 'quality'
  | 'adult'

export type ProviderSearchFacetPhysicalKey = [
  ProfileId,
  RevisionId,
  ProviderSearchFacetKind,
  string,
  ProviderAssetKey,
]
export type CanonicalEpisodeKey = string
export type EpisodeObservationKey = string
export type MetadataScopeKey = string & {
  readonly __metadataScopeKey: unique symbol
}

export type PublicMetadataScope = { kind: 'public' }

export type MetadataScope =
  | PublicMetadataScope
  | { kind: 'profile'; profileId: ProfileId }

export type TitleExternalIdPhysicalKey = [
  MetadataScopeKey,
  TitleExternalIdNamespace,
  string,
]
export type PersonExternalIdPhysicalKey = [
  MetadataScopeKey,
  PersonExternalIdNamespace,
  string,
]
export type EpisodeExternalIdPhysicalKey = [
  MetadataScopeKey,
  EpisodeExternalIdNamespace,
  string,
]

export type ProviderBaseUrl = string & {
  readonly __providerBaseUrl: unique symbol
}
export type DurableArtworkUrl = string & {
  readonly __durableArtworkUrl: unique symbol
}
export type DurableDirectSourceUrl = string & {
  readonly __durableDirectSourceUrl: unique symbol
}
export type EphemeralPlaybackUrl = string & {
  readonly __ephemeralPlaybackUrl: unique symbol
}

export interface UrlSecretContext {
  username: string
  password: string
  forbiddenValues: string[]
  allowHttp: boolean
}
```

Validation:

- IDs are non-empty strings.
- Provider keys are constructed centrally and never from display text alone.
- `CanonicalTitleKey` and `PersonKey` are opaque, stable Nova Play IDs; they are not derived from whichever metadata source is discovered first.
- External IDs are separately indexed and entity-compatible; bare numeric IDs and generic profile-ambiguous `provider` namespaces are forbidden.
- Provider evidence remains profile-scoped. Shared external metadata must not absorb private aliases/evidence without provenance.
- Database records include `schemaVersion`.


## Document map

The architecture, principles, decision gates, and core identifiers stay in this file.
The reference material below was split out verbatim to keep this document readable;
nothing was rewritten.

| Part | Sections | Size | Contents |
| --- | --- | --- | --- |
| [`contracts.md`](docs/library-engine/contracts.md) | 1 | 61 KB | Cross-phase foundational contracts |
| [`data-model.md`](docs/library-engine/data-model.md) | 15 | 31 KB | Durable data model: stores, keys, indexes, and record shapes |
| [`file-manifest.md`](docs/library-engine/file-manifest.md) | 8 | 9 KB | Per-phase file manifests |
| [`api-manifest.md`](docs/library-engine/api-manifest.md) | 18 | 31 KB | Function and class manifests |
| [`dependencies-and-tests.md`](docs/library-engine/dependencies-and-tests.md) | 19 | 16 KB | Dependencies, build/TS config, session protocol, and the test plan |
| [`governance-and-phases.md`](docs/library-engine/governance-and-phases.md) | 13 | 40 KB | Freeze controls, per-phase execution, navigation, master checklist |

> `api-manifest.md` is a **design-time** record of intended functions and classes,
> not generated from source. Treat it as intent, and verify against `src/` before
> relying on any signature in it.
