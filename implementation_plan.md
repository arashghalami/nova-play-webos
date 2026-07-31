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

## Cross-phase foundational contracts

The following contracts are normative and close names referenced elsewhere in the plan. Platform/application types already owned by the current app, such as `LibrarySection`, `StreamItem`, `AbortSignal`, and IndexedDB DOM types, are reused rather than duplicated.

### Protocol, capability, and deterministic utilities

```ts
export interface LibraryProtocolVersion {
  major: 1
  minor: number
}

export interface LibraryProtocolEnvelope<T> {
  protocol: LibraryProtocolVersion
  messageId: string
  correlationId?: string
  profileId?: ProfileId
  sentAt: number
  payload: T
}

export interface EphemeralProviderAccess {
  baseUrl: ProviderBaseUrl
  username: string
  password: string
}

export interface EphemeralProbeFetchInput
  extends EphemeralProviderAccess {
  operation: 'validate-account'
}

export interface TitleExternalIdValue {
  namespace: TitleExternalIdNamespace
  value: string
}

export interface PersonExternalIdValue {
  namespace: PersonExternalIdNamespace
  value: string
}

export type LibraryWorkerRequestEnvelope =
  LibraryProtocolEnvelope<LibraryWorkerRequest>
export type LibraryWorkerEventEnvelope =
  LibraryProtocolEnvelope<LibraryWorkerEvent>

export type ProbeStage =
  | 'main-idb'
  | 'worker-start'
  | 'worker-message'
  | 'main-fetch'
  | 'worker-fetch'
  | 'worker-idb'
  | 'worker-main-write'
  | 'cooperative-main'
  | 'persistence'
  | 'cancellation'
  | 'cleanup'

export type CapabilityWarningCode =
  | 'http-only-provider'
  | 'storage-estimate-unavailable'
  | 'storage-persistence-unavailable'
  | 'worker-fetch-cors'
  | 'worker-idb-unavailable'
  | 'performance-budget-exceeded'
  | 'cleanup-retry-required'

export type ProbeStartupErrorCode =
  | 'worker-url-resolution'
  | 'worker-construction'
  | 'worker-script-load'
  | 'worker-message-timeout'
  | 'unknown-worker-startup'

export interface CapabilityProbeRecord {
  schemaVersion: 1
  id: string
  token: string
  group: number
  sequence: number
  payload: string
  estimatedBytes: number
}

export interface CapabilityMeasurement {
  schemaVersion: 1
  operation:
    | 'write'
    | 'read'
    | 'index-query'
    | 'cursor-scan'
    | 'worker-message'
    | 'worker-fetch'
    | 'worker-idb'
    | 'worker-main-write'
    | 'cooperative-slice'
    | 'cancel'
    | 'transaction-recovery'
  runner: 'main' | 'worker' | 'worker-main'
  success: boolean
  durationMs: number
  recordCount?: number
  batchSize?: number
  estimatedBytes?: number
  errorCode?: SyncErrorCode
}

export interface Clock {
  now(): number
}

export interface RandomSource {
  next(): number
}

export interface CryptoRandomSource {
  randomBytes(length: number): Uint8Array
}

export type LibraryStoreName =
  | 'databaseMetadata'
  | 'profileLibraryMetadata'
  | 'backfillCheckpoints'
  | 'catalogRevisions'
  | 'activeSections'
  | 'sectionPasses'
  | 'syncRuns'
  | 'syncCheckpoints'
  | 'syncLeases'
  | 'coverage'
  | 'providerCapabilities'
  | 'tombstones'
  | 'profileAvailabilityState'
  | 'availabilityOverlayEpochs'
  | 'availabilityOverlays'
  | 'providerAssets'
  | 'providerCategories'
  | 'categoryMemberships'
  | 'searchDocuments'
  | 'providerSearchTokens'
  | 'providerSearchPrefixes'
  | 'providerSearchFacets'
  | 'canonicalTitles'
  | 'titleExternalIds'
  | 'titleAliases'
  | 'canonicalSearchDocuments'
  | 'canonicalSearchTokens'
  | 'availabilityLinks'
  | 'identityCandidates'
  | 'providerIdentitySubjects'
  | 'providerIdentitySubjectAssets'
  | 'providerAssetLineage'
  | 'identityOverrides'
  | 'identityOverrideSubjects'
  | 'canonicalRedirects'
  | 'enrichmentJobs'
  | 'people'
  | 'personExternalIds'
  | 'personAliases'
  | 'credits'
  | 'personSearchDocuments'
  | 'personSearchTokens'
  | 'versionGroups'
  | 'profileEvidenceOverrides'
  | 'profilePolicyState'
  | 'userStateProjection'
  | 'savedCollections'
  | 'canonicalEpisodes'
  | 'episodeExternalIds'
  | 'episodeObservations'
  | 'collectionAcknowledgements'
  | 'diagnostics'

export interface LibraryTransactionContext {
  transaction: IDBTransaction
  store(name: LibraryStoreName): IDBObjectStore
}

export type LibraryTransactionWork<T> = (
  context: LibraryTransactionContext,
  provideResult: (value: T) => void,
  fail: (error: unknown) => void,
) => void

export type LibraryTelemetryEvent =
  | {
      name: 'capability-measurement'
      operation: CapabilityMeasurement['operation']
      runner: CapabilityMeasurement['runner']
      success: boolean
      durationMs: number
      recordCount?: number
      batchSize?: number
    }
  | {
      name: 'sync-progress'
      runId: SyncRunId
      endpoint?: ProviderEndpoint
      completedUnits: number
      failedUnits: number
      processedRecords: number
      durationMs: number
    }
  | {
      name: 'database-operation'
      operation: 'open' | 'upgrade' | 'activate' | 'recover' | 'prune'
      success: boolean
      durationMs: number
      errorCode?: SyncErrorCode
    }
  | {
      name: 'catalog-read'
      operation: 'categories' | 'assets' | 'search'
      source: ReadSource
      resultCount: number
      durationMs: number
    }

export interface LibraryTelemetry {
  event(event: LibraryTelemetryEvent): void
}

export type SafeSyncErrorDetail =
  | 'request-failed'
  | 'response-invalid'
  | 'transaction-aborted'
  | 'quota-exceeded'
  | 'operation-cancelled'
  | 'operation-unsupported'
  | 'unknown-failure'

export declare function serializeSyncError(
  code: SyncErrorCode,
  detail: SafeSyncErrorDetail,
  retryable: boolean,
  endpoint?: ProviderEndpoint,
): SerializedSyncError
```

All time-dependent tests inject `Clock`; any jitter, sampling, opaque-ID generation test, or parity selection injects a seeded `RandomSource`. Production may use platform time/randomness, but acceptance evidence records its deterministic seed where sampling is involved.

Protocol rules:

- unsupported major versions fail closed with `unsupported`;
- minor versions are backward-compatible additions only;
- duplicate mutating messages are idempotent by `messageId`;
- replies/events retain `correlationId`;
- only `LibraryWorkerRequestEnvelope` carrying `start-sync` or the explicit Phase 0 `probe.fetch` input may contain credentials/provider URLs;
- generic envelope inspection/logging replaces the complete actual paths `payload.profile` for `start-sync` and `payload.options.fetch` for `probe` with a constant redaction marker before serialization;
- `probe-fetch-ack` and `credentials-accepted` identify no credential value; after the correlated acknowledgement, sender and Worker release temporary credential references;
- errors, telemetry, cursors, diagnostics, and status artifacts never contain credentials, provider URLs, private titles, person names, search text, or raw payloads.

### Database metadata, backfills, and recovery

```ts
export type LibraryDatabaseSchemaVersion = 1 | 2 | 3 | 4 | 5 | 6
export type LibraryReaderVersion = 1 | 2 | 3 | 4 | 5 | 6

export declare const LATEST_PLANNED_LIBRARY_DATABASE_SCHEMA_VERSION: 6
export declare const CURRENT_LIBRARY_DATABASE_SCHEMA_VERSION:
  LibraryDatabaseSchemaVersion
export declare const CURRENT_LIBRARY_READER_VERSION: LibraryReaderVersion

export type LibraryBackfillId =
  | 'v2-provider-search-documents'
  | 'v3-canonical-identity'
  | 'v4-people-credits'
  | 'v5-preferences-evidence'
  | 'v6-collections-episodes-diagnostics'

export type LibraryReadGate =
  | 'provider-search'
  | 'canonical-identity'
  | 'people-credits'
  | 'preferences-evidence'
  | 'collections-episodes-diagnostics'

export type BackfillCheckpointKey = [ProfileId, LibraryBackfillId]

export interface LibraryDatabaseMetadataRecord {
  schemaVersion: 1
  key: 'database'
  databaseSchemaVersion: LibraryDatabaseSchemaVersion
  minimumReaderVersion: LibraryReaderVersion
  createdAt: number
  upgradedAt: number
}

export interface ProfileLibraryMetadataRecord {
  schemaVersion: 1
  profileId: ProfileId
  activeBackfillIds: LibraryBackfillId[]
  enabledReadGates: LibraryReadGate[]
  updatedAt: number
}

export interface BackfillCheckpointRecord {
  schemaVersion: 1
  key: BackfillCheckpointKey
  id: LibraryBackfillId
  profileId: ProfileId
  fromSchemaVersion: LibraryDatabaseSchemaVersion
  toSchemaVersion: LibraryDatabaseSchemaVersion
  dependsOn: LibraryBackfillId[]
  storeNames: LibraryStoreName[]
  state: 'planned' | 'running' | 'paused' | 'completed' | 'failed'
  localCursor?: IDBValidKey
  processedRecords: number
  expectedRecords?: number
  readGate: LibraryReadGate
  updatedAt: number
  lastErrorCode?: SyncErrorCode
}

export interface BackfillDefinition {
  id: LibraryBackfillId
  from: LibraryDatabaseSchemaVersion
  to: LibraryDatabaseSchemaVersion
  dependsOn: LibraryBackfillId[]
  readGate: BackfillCheckpointRecord['readGate']
  transformBatch(
    maintenance: ProfileMaintenanceInputFor<'post-open-backfill'>,
    cursor: IDBValidKey | undefined,
    batchSize: number,
  ): Promise<{
    nextCursor?: IDBValidKey
    processedRecords: number
    complete: boolean
  }>
}

export interface LibraryStoreDefinition {
  name: LibraryStoreName
  keyPath: string | string[]
  autoIncrement: false
}

export interface LibraryIndexDefinition {
  store: LibraryStoreName
  name: string
  keyPath: string | string[]
  unique: boolean
  multiEntry: boolean
}

export interface LibrarySchemaStep {
  version: LibraryDatabaseSchemaVersion
  minimumReaderVersion: LibraryReaderVersion
  ownedPhase: '1A' | '2B' | '3A' | '3B' | '4A' | '4B'
  createStores: LibraryStoreDefinition[]
  createIndexes: LibraryIndexDefinition[]
  deleteIndexes: Array<{
    store: LibraryStoreName
    name: string
  }>
  backfillId?: LibraryBackfillId
}
```

The schema sequence is fixed:

| DB version | Owner | Minimum reader | Store/index change | Required backfill and read gate |
| --- | --- | --- | --- | --- |
| 1 | Phase 1A | 1 | Create `databaseMetadata`, `profileLibraryMetadata`, `backfillCheckpoints`, `catalogRevisions`, `activeSections`, `sectionPasses`, `syncRuns`, `syncCheckpoints`, `syncLeases`, `coverage`, `providerCapabilities`, `tombstones`, `profileAvailabilityState`, `availabilityOverlayEpochs`, `availabilityOverlays`, `providerAssets`, `providerCategories`, `categoryMemberships`, and `searchDocuments` with the indexes in the physical-store table | None; UI remains on network reads |
| 2 | Phase 2B | 2 | Add `providerSearchTokens`, `providerSearchPrefixes`, and `providerSearchFacets`; accept provider search-document format 2 and its join projections | `v2-provider-search-documents`; gate `provider-search` until every active revision has format-2 documents and verified join projections |
| 3 | Phase 3A | 2 | Add canonical title/external-ID/alias/token, availability, identity subject/lineage/candidate/override/redirect, and enrichment stores/indexes | `v3-canonical-identity`; gate only identity reads, never accepted Phase 2 reads |
| 4 | Phase 3B | 2 | Add people/person-ID/alias/token and credit stores/indexes | `v4-people-credits`; gate people/Known For reads |
| 5 | Phase 4A | 2 | Add version-group, profile-evidence-override, and policy-state stores/indexes | `v5-preferences-evidence`; gate Phase 4 preference reads |
| 6 | Phase 4B | 2 | Add user-state projection, collection, episode/external-ID/observation/acknowledgement, and diagnostics stores/indexes | `v6-collections-episodes-diagnostics`; gate Phase 4B reads |

Rules:

- Versionchange transactions perform only the table's store/index creation or removal and atomically update `databaseMetadata`; record transformation never runs in that transaction.
- Opening fails closed with `unsupported` before any write when the application reader is less than `minimumReaderVersion` or the DB schema is newer than `CURRENT_LIBRARY_DATABASE_SCHEMA_VERSION`; the current network path remains available.
- A reader newer than the DB runs every schema step in order, then registers the named backfills and dependencies atomically in metadata/checkpoints.
- Backfills run under a renewable `post-open-backfill` maintenance lease, use the persisted `IDBValidKey` cursor, commit bounded batches, and atomically update checkpoint progress.
- A dependent backfill starts only after every dependency is complete. Completion requires no remaining source row, expected/processed reconciliation where count is available, and a successful verification scan.
- The final batch transaction marks the checkpoint complete, removes its ID from `activeBackfillIds`, and enables its read gate atomically.
- Interruption resumes from the last committed cursor. Failure preserves the prior accepted read path and active revision; retry never skips the failed batch.
- Controlled rebuild never deletes `databaseMetadata`, `backfillCheckpoints`, leases, or protected stores and cannot claim a read gate until its backfill verification completes.

```ts
export interface StoragePolicy {
  softLimitBytes: number
  hardLimitBytes: number
  minimumFreeBytes: number
  estimatedBytesPerRecord: number
  retainSupersededRevisions: number
  diagnosticRetentionDays: number
}

export type LeaseKey = string & { readonly __leaseKey: unique symbol }
export type LeaseEpoch = number

export type LeaseScope =
  | { kind: 'profile'; profileId: ProfileId }
  | { kind: 'public-metadata' }

export interface SyncLeaseGuard {
  leaseKey: LeaseKey
  leaseEpoch: LeaseEpoch
  ownerId: string
  kind: 'sync'
  scope: { kind: 'profile'; profileId: ProfileId }
  expiresAt: number
}

export interface MaintenanceLeaseGuard<
  R extends MaintenanceReason = MaintenanceReason,
> {
  leaseKey: LeaseKey
  leaseEpoch: LeaseEpoch
  ownerId: string
  kind: 'maintenance'
  scope: LeaseScope
  reason: R
  expiresAt: number
}

export type MaintenanceReason =
  | 'startup-recovery'
  | 'profile-deletion'
  | 'controlled-rebuild'
  | 'retention-prune'
  | 'quota-prune'
  | 'post-open-backfill'
  | 'projection-write'
  | 'identity-write'
  | 'enrichment-write'
  | 'evidence-write'
  | 'policy-write'
  | 'episode-write'
  | 'collection-write'
  | 'diagnostics-write'

export type PublicMetadataMaintenanceReason =
  | 'identity-write'
  | 'enrichment-write'
  | 'episode-write'

export interface MaintenanceInput {
  initiatingProfileId?: ProfileId
  reason: MaintenanceReason
  guard: MaintenanceLeaseGuard
  observedAt: number
}

export type MaintenanceInputFor<R extends MaintenanceReason> =
  Omit<MaintenanceInput, 'reason' | 'guard'> & {
    reason: R
    guard: MaintenanceLeaseGuard<R>
  }

export type ProfileMaintenanceInputFor<R extends MaintenanceReason> =
  Omit<MaintenanceInputFor<R>, 'initiatingProfileId' | 'guard'> & {
    profileId: ProfileId
    initiatingProfileId: ProfileId
    guard: MaintenanceLeaseGuard<R> & {
      scope: { kind: 'profile'; profileId: ProfileId }
    }
  }

export type PublicMetadataMaintenanceInputFor<
  R extends PublicMetadataMaintenanceReason,
> = Omit<MaintenanceInputFor<R>, 'guard'> & {
  guard: MaintenanceLeaseGuard<R> & {
    scope: { kind: 'public-metadata' }
  }
}

export interface ProfileMaintenanceLeaseRequest<
  R extends MaintenanceReason = MaintenanceReason,
> {
  initiatingProfileId: ProfileId
  ownerId: string
  scope: { kind: 'profile'; profileId: ProfileId }
  reason: R
}

export interface PublicMetadataMaintenanceLeaseRequest<
  R extends PublicMetadataMaintenanceReason =
    PublicMetadataMaintenanceReason,
> {
  initiatingProfileId?: ProfileId
  ownerId: string
  scope: { kind: 'public-metadata' }
  reason: R
}

export type MaintenanceLeaseRequest<
  R extends MaintenanceReason = MaintenanceReason,
> =
  | ProfileMaintenanceLeaseRequest<R>
  | (R extends PublicMetadataMaintenanceReason
      ? PublicMetadataMaintenanceLeaseRequest<R>
      : never)

export type ProfileCatalogDeletionInput =
  ProfileMaintenanceInputFor<'profile-deletion'> & {
    confirmedAt: number
    preserveProtectedLocalStorage: true
  }

export type ProtectedLibraryStoreName =
  | 'canonicalTitles'
  | 'titleAliases'
  | 'providerIdentitySubjects'
  | 'providerIdentitySubjectAssets'
  | 'providerAssetLineage'
  | 'identityOverrides'
  | 'identityOverrideSubjects'
  | 'personAliases'
  | 'profileEvidenceOverrides'
  | 'savedCollections'
  | 'collectionAcknowledgements'

export type PublicMetadataLibraryStoreName =
  | 'canonicalRedirects'
  | 'people'
  | 'personExternalIds'
  | 'personAliases'
  | 'credits'
  | 'personSearchDocuments'
  | 'personSearchTokens'

export type RebuildableLibraryStoreName = Exclude<
  LibraryStoreName,
  | ProtectedLibraryStoreName
  | PublicMetadataLibraryStoreName
  | 'databaseMetadata'
  | 'profileLibraryMetadata'
  | 'backfillCheckpoints'
  | 'syncLeases'
>

export type ControlledRebuildInput =
  ProfileMaintenanceInputFor<'controlled-rebuild'> & {
    rebuildStores: RebuildableLibraryStoreName[]
    preserveProtectedLocalStorage: true
    preserveProtectedIndexedDbStores: true
  }

export type PruneInput =
  ProfileMaintenanceInputFor<'retention-prune' | 'quota-prune'> & {
    policy: StoragePolicy
  }

export interface PruneReport {
  deletedRevisionIds: RevisionId[]
  deletedSearchDocuments: number
  deletedMetadataRecords: number
  deletedDiagnostics: number
  estimatedBytesFreed: number
  activeRevisionTouched: false
  protectedUserStateTouched: false
}

export interface RecoveryReport {
  resumedRunIds: SyncRunId[]
  abandonedRunIds: SyncRunId[]
  abandonedRevisionIds: RevisionId[]
  preservedActiveRevisionIds: RevisionId[]
  expiredLeaseOwners: string[]
  errors: SerializedSyncError[]
}
```

### Revision write contracts

```ts
export interface BeginRevisionInput {
  lease: SyncLeaseGuard
  scope: CatalogScope
  syncRunId: SyncRunId
  sectionPassId: SectionPassId
  requestAttemptId: RequestAttemptId
  generation: SyncGeneration
}

export interface RevisionWriteBatch {
  assets: ProviderAssetRecord[]
  categories: ProviderCategoryRecord[]
  memberships: CategoryMembershipRecord[]
  searchDocuments: SearchDocumentRecord[]
  providerSearchProjection?: ProviderSearchProjectionBatch
  estimatedBytes: number
}

export interface ActivateCategoryRevisionInput {
  kind: 'activate-category'
  profileId: ProfileId
  lease: SyncLeaseGuard
  section: LibrarySection
  generation: SyncGeneration
  expectedActiveSectionGeneration: SyncGeneration
  categoryKey: CategoryKey
  revisionId: RevisionId
  coverage: CoverageRecord
  checkpoint: SyncCheckpointRecord
  activatedAt: number
}

export interface ActivateSectionLayoutInput {
  kind: 'activate-section-layout'
  profileId: ProfileId
  lease: SyncLeaseGuard
  section: LibrarySection
  generation: SyncGeneration
  expectedActiveSectionGeneration?: SyncGeneration
  mode: 'section-catalog' | 'category-crawl'
  manifestRevisionId?: RevisionId
  sectionRevisionId?: RevisionId
  categoryRevisionIds: Array<{
    categoryKey: CategoryKey
    revisionId: RevisionId
  }>
  coverage: CoverageRecord[]
  checkpoint: SyncCheckpointRecord
  activatedAt: number
}

export type ActivateRevisionInput =
  | ActivateCategoryRevisionInput
  | ActivateSectionLayoutInput
```

`RevisionWriteBatch` records must all match the target profile/revision/scope. `activateRevision` validates a current lease, a sealed revision, matching completion proof, and storage headroom.

### Scope, paging, read-state, and feature flags

```ts
export interface ManifestScope {
  kind: 'manifest'
  profileId: ProfileId
  section: LibrarySection
}

export interface SectionCatalogScope {
  kind: 'section'
  profileId: ProfileId
  section: LibrarySection
}

export interface CategoryCatalogScope {
  kind: 'category'
  profileId: ProfileId
  section: LibrarySection
  categoryKey: CategoryKey
}

export type CatalogScope =
  | ManifestScope
  | SectionCatalogScope
  | CategoryCatalogScope

export type CoverageQueryScope =
  | { kind: 'profile'; profileId: ProfileId }
  | CatalogScope

export interface ActiveSectionRecord {
  schemaVersion: 1
  key: [ProfileId, LibrarySection]
  profileId: ProfileId
  section: LibrarySection
  mode: 'section-catalog' | 'category-crawl'
  generation: SyncGeneration
  manifestRevisionId?: RevisionId
  sectionRevisionId?: RevisionId
  categoryRevisionIds: Array<{
    categoryKey: CategoryKey
    revisionId: RevisionId
  }>
  activatedAt: number
}

export type CategorySort = 'provider' | 'name'
export type AssetSort = 'provider' | 'name' | 'recent' | 'rating' | 'year'
export type SearchSort = 'relevance' | 'name' | 'recent' | 'rating' | 'year'

export interface PageRequest {
  pageSize: number
  cursor?: string
}

export interface CountResult {
  value: number
  relation: 'exact' | 'lower-bound' | 'unknown'
}

export interface PageResult {
  pageSize: number
  nextCursor?: string
  hasMore: boolean
  total: CountResult
  truncated: boolean
}

export type ReadSource =
  | 'local-current'
  | 'local-stale'
  | 'local-partial'
  | 'hybrid'
  | 'network'
  | 'unavailable'

export type ReadIssueCode =
  | 'offline'
  | 'provider-failed'
  | 'network-truncated'
  | 'database-unavailable'
  | 'database-corrupt'
  | 'snapshot-expired'
  | 'invalid-cursor'
  | 'unsupported-filter'
  | 'cancelled'

export interface ReadIssue {
  code: ReadIssueCode
  retryable: boolean
  scopeKey?: ScopeKey
}

export interface CoverageSlice {
  scopeKey: ScopeKey
  activeRevisionId?: RevisionId
  completeness: CoverageRecord['completeness']
  freshness: CoverageRecord['freshness']
  lastAttemptOutcome: CoverageRecord['lastAttemptOutcome']
  itemCount: number
}

export interface CoverageSummary {
  authoritative: boolean
  slices: CoverageSlice[]
  completeScopes: number
  partialScopes: number
  staleScopes: number
  failedScopes: number
}

export interface ReadSnapshot {
  profileId: ProfileId
  bootSessionId: string
  activeRevisionIds: RevisionId[]
  availabilityOverlayEpoch: number
  cursorExpiresAt: number
  evidenceEpoch: number
  policyFingerprint: string
  queryFingerprint: string
  sortFingerprint: string
  createdAt: number
}

export type HybridMaterializedResult =
  | {
      kind: 'category'
      category: ProviderCategoryRecord
      sortTuple: Array<string | number | null>
    }
  | {
      kind: 'asset'
      asset: EffectiveProviderAssetView
      sortTuple: Array<string | number | null>
    }
  | {
      kind: 'search'
      result: CatalogSearchResult
      sortTuple: Array<string | number | null>
    }

export interface HybridReadSession {
  id: string
  profileId: ProfileId
  requestKind: 'categories' | 'assets' | 'search'
  requestFingerprint: string
  snapshot: ReadSnapshot
  acceptedResults: HybridMaterializedResult[]
  acceptedLocalCount: number
  acceptedNetworkCount: number
  createdAt: number
  expiresAt: number
  truncated: boolean
}

export interface CategoryListRequest extends PageRequest {
  profileId: ProfileId
  section: LibrarySection
  sort: CategorySort
  includeAdult: boolean
  signal?: AbortSignal
}

export interface CategoryListResponse extends PageResult {
  categories: ProviderCategoryRecord[]
  coverage: CoverageSummary
  source: ReadSource
  issues: ReadIssue[]
  snapshot: ReadSnapshot
  durationMs: number
}

export interface AssetListRequest extends PageRequest {
  profileId: ProfileId
  section: LibrarySection
  categoryKey: CategoryKey
  sort: AssetSort
  includeAdult: boolean
  languageCodes?: string[]
  qualities?: MediaQuality[]
  signal?: AbortSignal
}

export interface EffectiveAssetEvidence {
  languages: LanguageEvidence[]
  adult: AdultEvidence[]
  ratings: RatingEvidence[]
  versions: VersionEvidence[]
}

export interface EffectiveProviderAssetView {
  asset: ProviderAssetRecord
  effectiveEvidence: EffectiveAssetEvidence
}

export interface AssetListResponse extends PageResult {
  assets: EffectiveProviderAssetView[]
  coverage: CoverageSummary
  source: ReadSource
  issues: ReadIssue[]
  snapshot: ReadSnapshot
  durationMs: number
}

export interface CatalogSearchResult {
  providerAssetKey: ProviderAssetKey
  canonicalTitleKey?: CanonicalTitleKey
  score: number
  asset: EffectiveProviderAssetView
}

export type LibraryReadMode =
  | 'network-only'
  | 'shadow'
  | 'hybrid'
  | 'local-first'

export interface LibraryFeatureFlags {
  schemaVersion: 1
  readMode: LibraryReadMode
  identityEnabled: boolean
  peopleNavigationEnabled: boolean
  advancedLibraryEnabled: boolean
}
```

Cursor format is opaque, versioned, integrity-checked, and binds profile, query/filter/sort fingerprint, captured revision IDs, availability-overlay epoch, evidence epoch, policy fingerprint, optional hybrid session ID, last deterministic sort tuple, and expiry. Profile/filter/sort/integrity mismatch returns `invalid-cursor`; missing/pruned captured revision or overlay, missing/expired hybrid session, evidence/policy mismatch, or TTL expiry returns `snapshot-expired`. A difference from the current active revision alone is valid while the captured generations are retained. Cursors never silently start a different page and contain no credentials or display text.

### Provider, normalization, and synchronization contracts

```ts
export interface ProviderReadStats {
  receivedBytes: number
  parsedRecords: number
  acceptedRecords: number
  ignoredInvalidRecords: number
  coverageAffectingRejections: number
  batches: number
  durationMs: number
}

export interface ProviderReadSummary {
  stats: ProviderReadStats
  completionProof: ProviderCompletionProof
  restartCapability: 'unit-only' | 'provider-pagination'
  providerCursor?: string
}

export interface NormalizationContext {
  revisionId: RevisionId
  scopeKey: ScopeKey
  generation: SyncGeneration
  observedAt: number
  category?: ProviderCategoryRecord
}

export interface LanguageDetectionInput {
  title: string
  categoryName?: string
  providerPrefix?: string
  metadataLanguage?: string
  metadataCountries?: string[]
  manualCode?: string
}

export interface SyncUnit {
  key: string
  profileId: ProfileId
  section: LibrarySection
  categoryKey?: CategoryKey
  providerCategoryId?: string
  scopeKey: ScopeKey
  mode: 'manifest' | 'whole-library' | 'category'
  priority: number
}

export interface SyncPreferences {
  favoriteAssetKeys: ProviderAssetKey[]
  resumeAssetKeys: ProviderAssetKey[]
  preferredLanguageCodes: string[]
  recentScopeKeys: ScopeKey[]
}

export interface SyncPlanningInput {
  profileId: ProfileId
  reason: SyncRunRecord['reason']
  categories: ProviderCategoryRecord[]
  coverage: CoverageRecord[]
  capabilities: ProviderCapabilityRecord[]
  preferences: SyncPreferences
  now: number
}

export interface SyncPlan {
  profileId: ProfileId
  generation: SyncGeneration
  sourceMode: CoverageRecord['sourceMode']
  units: SyncUnit[]
}

export interface CatalogProviderAdapter {
  listCategories(
    section: LibrarySection,
    options: {
      signal?: AbortSignal
      timeoutMs?: number
    },
  ): Promise<{
    categories: Category[]
    completionProof: ProviderCompletionProof
  }>

  iterateStreams(
    section: LibrarySection,
    options: {
      categoryId?: string
      signal?: AbortSignal
      timeoutMs?: number
      batchSize: number
      onBatch(
        batch: StreamItem[],
        stats: ProviderReadStats,
      ): Promise<void> | void
    },
  ): Promise<ProviderReadSummary>
}

export interface SyncRuntime {
  repository: CatalogRepository & CatalogWriteRepository
  provider: CatalogProviderAdapter
  clock: Clock
  telemetry: LibraryTelemetry
}

export interface StartSyncInput {
  profile: WorkerProfileInput
  lease: SyncLeaseGuard
  reason: SyncReason
  signal: AbortSignal
}

export interface ResumeSyncInput {
  profile: WorkerProfileInput
  lease: SyncLeaseGuard
  runId: SyncRunId
  signal: AbortSignal
}

export interface UnitCoverageCompleteInput {
  current: CoverageRecord
  activeRevisionId: RevisionId
  generation: SyncGeneration
  sectionPassId: SectionPassId
  itemCount: number
  completionProof: ProviderCompletionProof
  completedAt: number
}

export interface UnitCoverageFailureInput {
  current: CoverageRecord
  code: SyncErrorCode
  outcome: 'failed' | 'cancelled'
  attemptedAt: number
}

export interface ObserveMissingAssetInput {
  profileId: ProfileId
  providerAssetKey: ProviderAssetKey
  sectionPass: SectionPassRecord
  now: number
  graceMs: number
  protectedByUserState: boolean
}

export interface ConfirmRemovalInput {
  candidate: TombstoneCandidateRecord
  sectionPass: SectionPassRecord
  now: number
}

export interface ApplyRemovalInput {
  profileId: ProfileId
  lease: SyncLeaseGuard
  expectedOverlayEpoch: number
  candidates: TombstoneCandidateRecord[]
  removedAt: number
}

export interface ProfileAvailabilityStateRecord {
  schemaVersion: 1
  profileId: ProfileId
  currentEpoch: number
  updatedAt: number
}

export interface AvailabilityOverlayEpochRecord {
  schemaVersion: 1
  key: [ProfileId, number]
  profileId: ProfileId
  epoch: number
  leaseEpoch: LeaseEpoch
  state: 'writing' | 'sealed' | 'active' | 'retired' | 'abandoned'
  createdAt: number
  sealedAt?: number
  activatedAt?: number
  retiredAt?: number
  itemCount: number
}

export interface AvailabilityOverlayRecord {
  schemaVersion: 1
  key: [ProfileId, number, ProviderAssetKey]
  profileId: ProfileId
  epoch: number
  providerAssetKey: ProviderAssetKey
  state: 'missing-candidate' | 'removed'
  evidenceSectionPassId: SectionPassId
  protectedByUserState: boolean
  updatedAt: number
}

export interface SearchRankingPreferences {
  exactTitleBoost: number
  prefixBoost: number
  aliasBoost: number
  providerOrderWeight: number
}

export interface LibraryFeatureFlagSource {
  current(): LibraryFeatureFlags
}

export interface CatalogCursorPayload {
  schemaVersion: 1
  profileId: ProfileId
  snapshot: ReadSnapshot
  hybridSessionId?: string
  queryFingerprint: string
  sortFingerprint: string
  lastSortTuple: Array<string | number | null>
  expiresAt: number
}

export interface CatalogCursorCodec {
  encode(payload: CatalogCursorPayload): string
  decode(cursor: string): CatalogCursorPayload
}

export interface HybridReadSessionStore {
  get(profileId: ProfileId, id: string): HybridReadSession | null
  put(session: HybridReadSession): void
  deleteProfile(profileId: ProfileId): void
  prune(now: number): void
}

export interface EffectiveEvidenceResolver {
  resolveAsset(
    profileId: ProfileId,
    asset: ProviderAssetRecord,
  ): Promise<EffectiveProviderAssetView>
  currentPolicyState(profileId: ProfileId): Promise<ProfilePolicyStateRecord>
}

export interface CatalogServiceDependencies {
  repository: CatalogRepository
  network: CatalogNetworkFallback
  flags: LibraryFeatureFlagSource
  clock: Clock
  cursorCodec: CatalogCursorCodec
  hybridSessions: HybridReadSessionStore
  evidenceResolver: EffectiveEvidenceResolver
}

export interface CatalogNetworkFallback {
  listCategories(request: CategoryListRequest): Promise<CategoryListResponse>
  listAssets(request: AssetListRequest): Promise<AssetListResponse>
  search(request: CatalogSearchRequest): Promise<CatalogSearchResponse>
}

export interface CatalogService {
  listCategories(request: CategoryListRequest): Promise<CategoryListResponse>
  listAssets(request: AssetListRequest): Promise<AssetListResponse>
  search(request: CatalogSearchRequest): Promise<CatalogSearchResponse>
  getTitleAvailability(
    profileId: ProfileId,
    canonicalTitleKey: CanonicalTitleKey,
    signal?: AbortSignal,
  ): Promise<AvailabilityChoice[]>
  releaseProfile(profileId: ProfileId): void
  dispose(): void
}

export interface SyncExecutionContext {
  runtime: SyncRuntime
  run: SyncRunRecord
  lease: SyncLeaseGuard
  profile: WorkerProfileInput
  signal: AbortSignal
}

export interface SyncUnitResult {
  unitKey: string
  revisionId?: RevisionId
  state: 'completed' | 'failed' | 'cancelled'
  stats?: ProviderReadStats
  error?: SerializedSyncError
}

export interface SyncProgress {
  runId: SyncRunId
  profileId: ProfileId
  plannedUnits: number
  completedUnits: number
  failedUnits: number
  processedRecords: number
}

export interface SerializedSyncError {
  code: SyncErrorCode
  detail: SafeSyncErrorDetail
  retryable: boolean
  endpoint?: ProviderEndpoint
}

export interface WorkerProfileInput
  extends EphemeralProviderAccess {
  profileId: ProfileId
}

export type SyncReason = 'initial' | 'daily' | 'manual' | 'repair'

export type SyncControlReason =
  | 'playback'
  | 'profile-switch'
  | 'pagehide'
  | 'visibility-hidden'
  | 'settings-change'
  | 'user'
  | 'shutdown'
  | 'timeout'

export type SyncRunDescriptor =
  | {
      kind: 'new'
      runId: SyncRunId
      generation: SyncGeneration
      reason: SyncReason
    }
  | {
      kind: 'resume'
      runId: SyncRunId
      generation: SyncGeneration
    }

export interface CapabilityProbeRequest {
  type: 'probe'
  options: CapabilityProbeOptions
}

export interface StartSyncRequest {
  type: 'start-sync'
  profile: WorkerProfileInput
  run: SyncRunDescriptor
  lease: SyncLeaseGuard
}

export interface WorkerMainWriteBatch {
  type: 'worker-main-write-batch'
  batchId: string
  runId: SyncRunId
  profileId: ProfileId
  lease: SyncLeaseGuard
  revisionId: RevisionId
  batch: RevisionWriteBatch
}

export interface WorkerMainWriteAcknowledgement {
  type: 'worker-main-write-ack'
  batchId: string
  accepted: boolean
  error?: SerializedSyncError
}
```

`WorkerProfileInput` exists only in memory. Serialization tests prove it never reaches IndexedDB, diagnostics, traces, error messages, cursor data, or status artifacts. Before a `WorkerMainWriteBatch` is committed, the receiver revalidates profile/revision/lease, record count, structured-clone byte count, every string/array length, physical keys, and all durable URL classifications; it recomputes size rather than trusting `estimatedBytes`.

Fixed initial message limits, calibratable downward at Gate 0, are 500 records, 1 MiB structured-clone bytes, 2,048 characters per ordinary string, 8,192 characters per durable URL, and 256 elements per evidence/token array. A limit violation rejects the entire batch with a safe error and advances neither checkpoint nor coverage.

### Local search-index contracts

```ts
export interface SearchIndexChangeSet {
  upsert: SearchDocumentRecord[]
  removeKeys: SearchDocumentPhysicalKey[]
}

export interface LocalSearchIndex {
  readonly profileId: ProfileId
  readonly limits: LocalSearchIndexLimits
  readonly documentCount: number
  readonly uniqueTokenCount: number
  readonly prefixEntryCount: number
  readonly estimatedBytes: number
  readonly truncated: boolean
  loadPage(documents: SearchDocumentRecord[]): SearchIndexLoadResult
  update(changes: SearchIndexChangeSet): void
  search(request: CatalogSearchRequest): CatalogSearchResponse
  release(): void
}

export interface SearchIndexLoadResult {
  acceptedDocuments: number
  rejectedDocuments: number
  limitReached?: keyof LocalSearchIndexLimits
  nextLocalCursor?: string
}
```

### Identity, availability, and enrichment contracts

```ts
export interface ProviderTitleExternalIdEvidence
  extends TitleExternalIdValue {
  sourceField: string
  observedAt: number
}

export interface IdentityEvidence {
  kind:
    | 'external-id'
    | 'title'
    | 'original-title'
    | 'alias'
    | 'year'
    | 'language'
    | 'manual'
  entity: 'title'
  namespace?: TitleExternalIdNamespace
  valueHash: string
  source: 'provider' | 'tmdb' | 'tvmaze' | 'trakt' | 'manual'
  profileId?: ProfileId
  weight: number
}

export interface IdentityCandidateRecord {
  schemaVersion: 1
  key: string
  profileId: ProfileId
  providerAssetKey: ProviderAssetKey
  canonicalTitleKey: CanonicalTitleKey
  policyVersion: number
  confidence: number
  method: IdentityMatchMethod
  evidence: IdentityEvidence[]
  state: 'candidate' | 'confirmed' | 'rejected' | 'superseded'
  createdAt: number
  updatedAt: number
}

export type ProviderIdentitySubjectKey = string

export interface ProviderIdentitySubjectRecord {
  schemaVersion: 1
  key: ProviderIdentitySubjectKey
  profileId: ProfileId
  createdAt: number
  updatedAt: number
}

export interface ProviderIdentitySubjectAssetRecord {
  schemaVersion: 1
  key: [ProfileId, ProviderAssetKey]
  profileId: ProfileId
  identitySubjectKey: ProviderIdentitySubjectKey
  providerAssetKey: ProviderAssetKey
  state: 'current' | 'retired'
  observedAt: number
}

export interface ProviderAssetLineageRecord {
  schemaVersion: 1
  key: string
  profileId: ProfileId
  identitySubjectKey: ProviderIdentitySubjectKey
  predecessorProviderAssetKey?: ProviderAssetKey
  successorProviderAssetKey: ProviderAssetKey
  method: 'manual' | 'confirmed-canonical-replacement'
  confidence: number
  createdAt: number
}

export interface IdentityOverrideRecord {
  schemaVersion: 1
  key: string
  profileId: ProfileId
  canonicalTitleKey: CanonicalTitleKey
  action: 'confirm' | 'reject' | 'merge' | 'split' | 'prefer'
  targetCanonicalTitleKey?: CanonicalTitleKey
  createdAt: number
  updatedAt: number
}

export interface IdentityOverrideSubjectRecord {
  schemaVersion: 1
  key: [ProfileId, ProviderIdentitySubjectKey, string]
  profileId: ProfileId
  identitySubjectKey: ProviderIdentitySubjectKey
  overrideKey: string
  splitGroup?: number
}

export interface PublicCanonicalConvergenceEvidence {
  source: 'tmdb' | 'tvmaze' | 'trakt'
  matchingExternalIds: TitleExternalIdValue[]
  reviewedAt: number
}

export interface CanonicalRedirectRecord {
  schemaVersion: 1
  fromCanonicalTitleKey: CanonicalTitleKey
  toCanonicalTitleKey: CanonicalTitleKey
  reason: 'public-external-id-convergence'
  evidence: PublicCanonicalConvergenceEvidence
  createdAt: number
}

export interface AvailabilityChoice {
  canonicalTitleKey: CanonicalTitleKey
  providerAssetKey?: ProviderAssetKey
  state: 'playable' | 'multiple' | 'ambiguous' | 'unavailable' | 'detached'
  confidence?: number
  preferred: boolean
  label: string
}

export interface EnrichmentJobRecord {
  schemaVersion: 1
  id: string
  profileId: ProfileId
  canonicalTitleKey?: CanonicalTitleKey
  personKey?: PersonKey
  reason: 'details' | 'favorite-resume' | 'known-for' | 'identity-ambiguity'
  priority: number
  state: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  attemptCount: number
  notBefore: number
  createdAt: number
  updatedAt: number
  lastErrorCode?: SyncErrorCode
}

export interface EnrichmentBudget {
  maxConcurrent: number
  maxRequestsPerSession: number
  cacheTtlMs: number
  maxAttempts: number
  baseBackoffMs: number
}

export interface EnrichmentQueueReport {
  started: number
  completed: number
  failed: number
  cancelled: number
  deferred: number
  requestsUsed: number
  privateFieldsTransmitted: false
}

export interface CanonicalSearchDocumentRecord {
  schemaVersion: 1
  key: [CanonicalTitleKey, MetadataScopeKey]
  canonicalTitleKey: CanonicalTitleKey
  metadataScope: MetadataScope
  metadataScopeKey: MetadataScopeKey
  normalizedTitle: string
  aliasTokens: string[]
  year?: number
  mediaType: CanonicalMediaType
}

export interface CanonicalSearchTokenRecord {
  schemaVersion: 1
  key: [MetadataScopeKey, string, CanonicalTitleKey]
  metadataScopeKey: MetadataScopeKey
  token: string
  canonicalTitleKey: CanonicalTitleKey
}

export interface PersonSearchDocumentRecord {
  schemaVersion: 1
  key: [PersonKey, MetadataScopeKey]
  personKey: PersonKey
  metadataScope: PublicMetadataScope
  metadataScopeKey: MetadataScopeKey
  normalizedName: string
  aliasTokens: string[]
}

export interface PersonSearchTokenRecord {
  schemaVersion: 1
  key: [MetadataScopeKey, string, PersonKey]
  metadataScope: PublicMetadataScope
  metadataScopeKey: MetadataScopeKey
  token: string
  personKey: PersonKey
}
```

Fixed initial Phase 3 matcher policy:

- external-ID equality within an entity namespace: confidence 1.0, eligible for auto-confirm;
- exact normalized/original/alias title plus exact non-missing year: confidence 0.98, eligible for auto-confirm;
- exact title with one-year tolerance: confidence at most 0.94, candidate only;
- title without year, fuzzy title, transliteration-only, or conflicting IDs: confidence at most 0.89, candidate only;
- auto-confirm threshold: 0.98;
- manual reject/confirm/merge/split/prefer always outranks automation;
- a policy-version change reevaluates nonmanual candidates only and requires a fresh shadow report.

### Phase 4 settings, evidence, protected state, and collections

```ts
export type UnknownLanguagePolicy =
  | 'include'
  | 'deprioritize'
  | 'exclude-read-model'
export type VersionMode = 'ask' | 'prefer'
export type AudioPreference = 'original' | 'dubbed' | 'any'
export type SubtitlePreference = 'subtitled' | 'unsubtitled' | 'any'

export interface PinVerifier {
  algorithm: 'pbkdf2-sha256'
  iterations: 100000
  saltBase64: string
  digestBase64: string
}

export interface ParentalSessionUnlock {
  profileId: ProfileId
  unlockedAt: number
  expiresAt: number
}

export interface ParentalDecision {
  visible: boolean
  requiresPin: boolean
  reason:
    | 'allowed'
    | 'adult-hidden'
    | 'age-restricted'
    | 'unrated'
    | 'session-unlocked'
}

export interface ParentalSettings {
  hideAdult: boolean
  maximumAge?: number
  unrated: 'allow' | 'require-pin'
  pin?: PinVerifier
}

export interface SyncExclusionSettings {
  categoryKeys: CategoryKey[]
  warningVersion: 1
  acknowledgedAt: number
}

export interface LibraryPreferenceSettings {
  schemaVersion: 1
  preferredLanguages: string[]
  unknownLanguagePolicy: UnknownLanguagePolicy
  preferredQualities: MediaQuality[]
  versionMode: VersionMode
  audioPreference: AudioPreference
  subtitlePreference: SubtitlePreference
  parental: ParentalSettings
  syncExclusions?: SyncExclusionSettings
}

export interface AdultEvidence {
  source:
    | 'provider-category'
    | 'provider-title'
    | 'metadata-certification'
    | 'manual'
  value: string
  confidence: number
  profileId?: ProfileId
}

export interface RatingEvidence {
  source: 'tmdb' | 'trakt' | 'provider' | 'manual'
  region?: string
  rating: string
  minimumAge?: number
}

export interface VersionEvidence {
  languageCodes: string[]
  audio: AudioPreference
  subtitles: SubtitlePreference
  quality: MediaQuality
  source: 'provider-name' | 'category' | 'metadata' | 'manual'
  confidence: number
}

export interface PreferenceScore {
  languageRank: number
  manualEvidenceRank: number
  audioRank: number
  subtitleRank: number
  qualityRank: number
  providerOrder: number
  providerAssetKey: ProviderAssetKey
}

export type ProfileEvidenceKind =
  | 'language'
  | 'adult'
  | 'rating'
  | 'version'

export interface ProfileEvidenceOverrideRecord {
  schemaVersion: 1
  key: [ProfileId, ProviderIdentitySubjectKey, ProfileEvidenceKind]
  profileId: ProfileId
  identitySubjectKey: ProviderIdentitySubjectKey
  kind: ProfileEvidenceKind
  action: 'replace' | 'append' | 'suppress-inferred'
  language?: LanguageEvidence[]
  adult?: AdultEvidence[]
  ratings?: RatingEvidence[]
  versions?: VersionEvidence[]
  updatedAt: number
}

export interface ProfilePolicyStateRecord {
  schemaVersion: 1
  profileId: ProfileId
  evidenceEpoch: number
  policyFingerprint: string
  updatedAt: number
}

export interface VersionGroupRecord {
  schemaVersion: 1
  key: string
  profileId: ProfileId
  canonicalTitleKey: CanonicalTitleKey
  providerAssetKeys: ProviderAssetKey[]
  preferredProviderAssetKey?: ProviderAssetKey
  policyVersion: number
  updatedAt: number
}

export interface UserStateProjectionRecord {
  schemaVersion: 1
  key: string
  profileId: ProfileId
  sourceKind: 'favorite' | 'resume'
  sourceKey: string
  sourceFingerprint: string
  providerAssetKey?: ProviderAssetKey
  canonicalTitleKey?: CanonicalTitleKey
  favorite: boolean
  watched: boolean
  resumePositionSeconds?: number
  sourceUpdatedAt: number
  availability: 'attached' | 'detached' | 'remapped'
  remappedProviderAssetKey?: ProviderAssetKey
}

export interface UserStateSourceSnapshot {
  profileId: ProfileId
  favoritesJson: string
  resumeJson: string
  sourceFingerprint: string
  capturedAt: number
}

export interface UserStateProjectionReport {
  profileId: ProfileId
  sourceFavorites: number
  sourceResumeRecords: number
  projectedFavorites: number
  projectedResumeRecords: number
  detachedRecords: number
  sourceFingerprintBefore: string
  sourceFingerprintAfter: string
  sourceMutated: false
}

export interface SettingsMigrationBackup {
  schemaVersion: 1
  profileId: ProfileId
  createdAt: number
  sourceFingerprint: string
  settingsJson: string
}

export interface PersistedCatalogQuery {
  schemaVersion: 1
  query: string
  sections?: LibrarySection[]
  categoryKeys?: CategoryKey[]
  languageCodes?: string[]
  countryCodes?: string[]
  genreIds?: string[]
  personKeys?: PersonKey[]
  qualities?: MediaQuality[]
  yearFrom?: number
  yearTo?: number
  watched?: boolean
  favorite?: boolean
  availability?: Array<'available' | 'detached' | 'removed'>
  includeAdult: boolean
  sort: SearchSort
}

export interface SavedCollectionRecord {
  schemaVersion: 1
  id: string
  profileId: ProfileId
  name: string
  query: PersistedCatalogQuery
  createdAt: number
  updatedAt: number
}

export interface DynamicCollectionDefinition {
  id:
    | 'favorites'
    | 'continue-watching'
    | 'unwatched'
    | 'recently-added'
    | 'new-episodes'
    | 'four-k'
  profileId: ProfileId
  windowDays?: number
}

export interface EpisodeExternalIdValue {
  namespace: EpisodeExternalIdNamespace
  value: string
}

export interface EpisodeExternalIdMappingRecord {
  schemaVersion: 1
  physicalKey: EpisodeExternalIdPhysicalKey
  metadataScope: MetadataScope
  metadataScopeKey: MetadataScopeKey
  namespace: EpisodeExternalIdNamespace
  value: string
  canonicalEpisodeKey: CanonicalEpisodeKey
}

export interface CanonicalEpisodeRecord {
  schemaVersion: 1
  key: CanonicalEpisodeKey
  metadataScope: MetadataScope
  metadataScopeKey: MetadataScopeKey
  canonicalSeriesKey: CanonicalTitleKey
  seasonNumber: number
  episodeNumber: number
  title?: string
}

export interface EpisodeObservationRecord {
  schemaVersion: 1
  key: EpisodeObservationKey
  profileId: ProfileId
  canonicalEpisodeKey: CanonicalEpisodeKey
  providerAssetKey?: ProviderAssetKey
  firstSeenAt: number
  lastSeenAt: number
  availability: 'available' | 'detached'
}

export interface CollectionAcknowledgementRecord {
  schemaVersion: 1
  key: string
  profileId: ProfileId
  collectionId: DynamicCollectionDefinition['id'] | string
  acknowledgedThrough: number
  updatedAt: number
}

export interface CatalogDiagnosticSnapshot {
  schemaVersion: 1
  profileId: ProfileId
  capturedAt: number
  runner: SyncRunRecord['runner']
  schemaVersionNumber: number
  coverage: CoverageSummary
  storageUsageBytes?: number
  storageQuotaBytes?: number
  activeRevisionCount: number
  stagingRevisionCount: number
  lastSyncState?: SyncRunState
  lastErrorCode?: SyncErrorCode
  redacted: true
}
```

Phase 4 policy:

- existing playback settings remain preserved by the existing `AppSettings` migration; `LibraryPreferenceSettings` is nested per profile and defaults to include/deprioritize rather than destructive exclusion;
- preferred-language order is primary, then manual evidence, audio/subtitle preference, preferred-quality order, provider order, and finally `ProviderAssetKey`;
- unknown language is never deleted; `exclude-read-model` hides it only from reads;
- manual version/language/adult/rating evidence is persisted only in `profileEvidenceOverrides`; immutable provider revisions retain inferred observations and are never rewritten;
- effective evidence is computed by joining the active provider asset to its identity subject, profile override, and `profilePolicyState`; every override mutation atomically increments `evidenceEpoch`;
- adult hiding applies at every category, browse, search, detail, collection, existing metadata recommendation-card, and availability-choice boundary;
- conflicting/unknown age evidence follows `unrated`; a valid PIN unlock is session-scoped and never logged;
- plaintext legacy PIN is migrated only after successful PBKDF2 verifier creation and readback validation; a temporary non-secret migration backup is retained until the new settings parse and verify, and failure restores the exact prior value;
- `recently-added` uses `firstSeenAt`, not refresh time; provider `addedAtProvider` may be a secondary sort only; default window is 30 days and is stored in the collection definition;
- `new-episodes` includes available `EpisodeObservationRecord`s whose `firstSeenAt` is greater than the profile collection acknowledgement; if stable canonical episode identity cannot be formed, the record is excluded rather than guessed;
- a canonical episode has exactly the metadata scope of its canonical series. An episode external-ID mapping must carry the same scope as its target episode; a public mapping may reference only an episode whose series is public, while a profile-scoped mapping may reference only the same profile's private series;
- user-state projection is derived from `localStorage`; IndexedDB is not its authority. Projection rebuild compares before/after source fingerprints and never writes back to, truncates, or clears user state;
- detached favorite/resume records remain visible and remappable;
- collections save query definitions, never private result snapshots;
- deleting a profile deletes its catalog/projections/collections/overrides only after explicit confirmation; saved profiles and credentials follow the existing profile-storage flow.

### Cross-phase operational invariants

- The current credential and legacy parental-PIN storage boundary is browser `localStorage`; it is an inherited risk, not secure credential storage. No phase may describe it as encrypted or hardware-backed.
- Catalog rebuild, DB corruption, quota pressure, or feature rollback must not clear or rewrite profiles, settings, favorites, or resume history.
- Before a settings migration, keep the exact prior settings string in memory or the same localStorage boundary, verify the new value, then remove the temporary backup. Favorite/resume data is not migrated or copied for this operation. Never copy credentials or migration backups into IndexedDB.
- Profile removal is explicit and two-part: remove catalog/projections/overrides/collections from IndexedDB, then invoke the existing profile-storage removal flow only after separate user confirmation.
- Profile switch cancels queries, hybrid sessions, enrichment, sync, PIN unlock, and index work before activating the next profile.
- All persisted timestamps are Unix milliseconds in UTC. Day/window presentation uses the current device time zone; changing time zone never rewrites stored observations.
- Clock rollback cannot make stale coverage current, resurrect expired leases, or advance deletion. Monotonic durations are used where available; wall-clock anomalies are diagnosed.
- Diagnostics retain aggregate records for 14 days by default and are pruned before active catalog data.
- A controlled catalog rebuild accepts only `RebuildableLibraryStoreName`, deletes only affected-profile rows, preserves every `ProtectedLibraryStoreName`, reconstructs projections from authoritative `localStorage`, and records the reason/result.
- Multi-provider support is not implemented in Phases 0–4. Existing `profileId` is the provider-account isolation boundary; adding multiple providers to one profile requires a change-controlled key/schema ADR.

### Physical store and index closure

The table below is the normative physical registry from which `LIBRARY_SCHEMA_STEPS` is constructed. Key paths are literal IndexedDB key paths. Every index definition explicitly gives `name => keyPath; unique; multiEntry`; `—` means the store has no secondary index. No undeclared index may be created under the same schema version.

| DB / phase | Store | Object-store keyPath | Exact secondary indexes (`name => keyPath; unique; multiEntry`) |
| --- | --- | --- | --- |
| 1 / 1A | `databaseMetadata` | `"key"` | — |
| 1 / 1A | `profileLibraryMetadata` | `"profileId"` | — |
| 1 / 1A | `backfillCheckpoints` | `"key"` | `by-profile-state` => `["profileId","state"]`; false; false · `by-profile-read-gate` => `["profileId","readGate"]`; false; false |
| 1 / 1A | `catalogRevisions` | `"id"` | `by-profile-scope-state` => `["profileId","scopeKey","state"]`; false; false · `by-sync-run` => `"syncRunId"`; false; false |
| 1 / 1A | `activeSections` | `"key"` | `by-profile` => `"profileId"`; false; false · `by-profile-generation` => `["profileId","generation"]`; false; false |
| 1 / 1A | `sectionPasses` | `"id"` | `by-profile-section-state` => `["profileId","section","state"]`; false; false · `by-sync-run` => `"syncRunId"`; false; false |
| 1 / 1A | `syncRuns` | `"id"` | `by-profile-state` => `["profileId","state"]`; false; false |
| 1 / 1A | `syncCheckpoints` | `"key"` | `by-sync-run` => `"syncRunId"`; false; false · `by-profile` => `"profileId"`; false; false |
| 1 / 1A | `syncLeases` | `"key"` | `by-state-expires-at` => `["state","expiresAt"]`; false; false |
| 1 / 1A | `coverage` | `"key"` | `by-profile-section` => `["profileId","section"]`; false; false |
| 1 / 1A | `providerCapabilities` | `"key"` | `by-profile-endpoint` => `["profileId","endpoint"]`; true; false |
| 1 / 1A | `tombstones` | `["profileId","providerAssetKey"]` | `by-profile-eligible-after` => `["profileId","eligibleAfter"]`; false; false · `by-profile-proof-scope` => `["profileId","proofScopeKey"]`; false; false |
| 1 / 1A | `profileAvailabilityState` | `"profileId"` | `by-current-epoch` => `"currentEpoch"`; false; false |
| 1 / 1A | `availabilityOverlayEpochs` | `"key"` | `by-profile-state` => `["profileId","state"]`; false; false · `by-profile-retired-at` => `["profileId","retiredAt"]`; false; false |
| 1 / 1A | `availabilityOverlays` | `"key"` | `by-profile-epoch` => `["profileId","epoch"]`; false; false · `by-profile-epoch-state` => `["profileId","epoch","state"]`; false; false · `by-profile-asset-epoch` => `["profileId","providerAssetKey","epoch"]`; false; false |
| 1 / 1A | `providerAssets` | `"physicalKey"` | `by-profile-revision-section` => `["profileId","revisionId","section"]`; false; false · `by-profile-revision-key` => `["profileId","revisionId","key"]`; true; false |
| 1 / 1A | `providerCategories` | `"physicalKey"` | `by-profile-revision-section` => `["profileId","revisionId","section"]`; false; false · `by-profile-revision-key` => `["profileId","revisionId","key"]`; true; false |
| 1 / 1A | `categoryMemberships` | `"physicalKey"` | `by-profile-revision-category` => `["profileId","revisionId","categoryKey"]`; false; false · `by-profile-revision-asset` => `["profileId","revisionId","providerAssetKey"]`; false; false |
| 1 / 1A | `searchDocuments` | `"physicalKey"` | `by-profile-revision-section` => `["profileId","revisionId","section"]`; false; false · `by-profile-revision-title` => `["profileId","revisionId","normalizedTitle"]`; false; false |
| 2 / 2B | `providerSearchTokens` | `"physicalKey"` | `by-profile-revision-token` => `["profileId","revisionId","token"]`; false; false · `by-profile-revision-asset` => `["profileId","revisionId","providerAssetKey"]`; false; false |
| 2 / 2B | `providerSearchPrefixes` | `"physicalKey"` | `by-profile-revision-prefix` => `["profileId","revisionId","prefix"]`; false; false · `by-profile-revision-asset` => `["profileId","revisionId","providerAssetKey"]`; false; false |
| 2 / 2B | `providerSearchFacets` | `"physicalKey"` | `by-profile-revision-facet` => `["profileId","revisionId","kind","value"]`; false; false · `by-profile-revision-asset` => `["profileId","revisionId","providerAssetKey"]`; false; false |
| 3 / 3A | `canonicalTitles` | `"key"` | `by-scope-media-title` => `["metadataScopeKey","mediaType","normalizedPrimaryTitle"]`; false; false · `by-scope-media-title-year` => `["metadataScopeKey","mediaType","normalizedPrimaryTitle","year"]`; false; false |
| 3 / 3A | `titleExternalIds` | `"physicalKey"` | `by-scope-canonical-title` => `["metadataScopeKey","canonicalTitleKey"]`; false; false |
| 3 / 3A | `titleAliases` | `"key"` | `by-scope-normalized-value` => `["metadataScopeKey","normalizedValue"]`; false; false · `by-scope-canonical-title` => `["metadataScopeKey","canonicalTitleKey"]`; false; false |
| 3 / 3A | `canonicalSearchDocuments` | `"key"` | `by-scope-normalized-title` => `["metadataScopeKey","normalizedTitle"]`; false; false |
| 3 / 3A | `canonicalSearchTokens` | `"key"` | `by-scope-token` => `["metadataScopeKey","token"]`; false; false · `by-scope-canonical-title` => `["metadataScopeKey","canonicalTitleKey"]`; false; false |
| 3 / 3A | `availabilityLinks` | `"key"` | `by-profile-title-state` => `["profileId","canonicalTitleKey","state"]`; false; false · `by-profile-asset` => `["profileId","providerAssetKey"]`; false; false |
| 3 / 3A | `identityCandidates` | `"key"` | `by-profile-state-policy` => `["profileId","state","policyVersion"]`; false; false · `by-profile-asset` => `["profileId","providerAssetKey"]`; false; false |
| 3 / 3A | `providerIdentitySubjects` | `"key"` | `by-profile` => `"profileId"`; false; false |
| 3 / 3A | `providerIdentitySubjectAssets` | `"key"` | `by-profile-subject-state` => `["profileId","identitySubjectKey","state"]`; false; false |
| 3 / 3A | `providerAssetLineage` | `"key"` | `by-profile-subject` => `["profileId","identitySubjectKey"]`; false; false · `by-profile-predecessor` => `["profileId","predecessorProviderAssetKey"]`; false; false · `by-profile-successor` => `["profileId","successorProviderAssetKey"]`; false; false |
| 3 / 3A | `identityOverrides` | `"key"` | `by-profile` => `"profileId"`; false; false · `by-profile-canonical-title` => `["profileId","canonicalTitleKey"]`; false; false |
| 3 / 3A | `identityOverrideSubjects` | `"key"` | `by-profile-override` => `["profileId","overrideKey"]`; false; false |
| 3 / 3A | `canonicalRedirects` | `"fromCanonicalTitleKey"` | `by-target` => `"toCanonicalTitleKey"`; false; false |
| 3 / 3A | `enrichmentJobs` | `"id"` | `by-state-priority-not-before` => `["state","priority","notBefore"]`; false; false · `by-profile-state` => `["profileId","state"]`; false; false |
| 4 / 3B | `people` | `"key"` | `by-scope-normalized-name` => `["metadataScopeKey","normalizedName"]`; false; false |
| 4 / 3B | `personExternalIds` | `"physicalKey"` | `by-scope-person` => `["metadataScopeKey","personKey"]`; false; false |
| 4 / 3B | `personAliases` | `"key"` | `by-scope-normalized-value` => `["metadataScopeKey","normalizedValue"]`; false; false · `by-scope-person` => `["metadataScopeKey","personKey"]`; false; false |
| 4 / 3B | `credits` | `"key"` | `by-scope-person` => `["metadataScopeKey","personKey"]`; false; false · `by-scope-title` => `["metadataScopeKey","canonicalTitleKey"]`; false; false |
| 4 / 3B | `personSearchDocuments` | `"key"` | `by-scope-normalized-name` => `["metadataScopeKey","normalizedName"]`; false; false |
| 4 / 3B | `personSearchTokens` | `"key"` | `by-scope-token` => `["metadataScopeKey","token"]`; false; false · `by-scope-person` => `["metadataScopeKey","personKey"]`; false; false |
| 5 / 4A | `versionGroups` | `"key"` | `by-profile-canonical-title` => `["profileId","canonicalTitleKey"]`; false; false |
| 5 / 4A | `profileEvidenceOverrides` | `"key"` | `by-profile` => `"profileId"`; false; false · `by-profile-subject` => `["profileId","identitySubjectKey"]`; false; false |
| 5 / 4A | `profilePolicyState` | `"profileId"` | `by-evidence-epoch` => `"evidenceEpoch"`; false; false |
| 6 / 4B | `userStateProjection` | `"key"` | `by-profile` => `"profileId"`; false; false · `by-profile-provider-asset` => `["profileId","providerAssetKey"]`; false; false · `by-profile-canonical-title` => `["profileId","canonicalTitleKey"]`; false; false |
| 6 / 4B | `savedCollections` | `"id"` | `by-profile` => `"profileId"`; false; false |
| 6 / 4B | `canonicalEpisodes` | `"key"` | `by-scope-series-position` => `["metadataScopeKey","canonicalSeriesKey","seasonNumber","episodeNumber"]`; true; false |
| 6 / 4B | `episodeExternalIds` | `"physicalKey"` | `by-scope-canonical-episode` => `["metadataScopeKey","canonicalEpisodeKey"]`; false; false |
| 6 / 4B | `episodeObservations` | `"key"` | `by-profile-canonical-episode` => `["profileId","canonicalEpisodeKey"]`; false; false · `by-profile-first-seen` => `["profileId","firstSeenAt"]`; false; false · `by-profile-provider-asset` => `["profileId","providerAssetKey"]`; false; false |
| 6 / 4B | `collectionAcknowledgements` | `"key"` | `by-profile` => `"profileId"`; false; false |
| 6 / 4B | `diagnostics` | `["profileId","capturedAt"]` | `by-captured-at` => `"capturedAt"`; false; false |

Registry construction is mechanical and frozen:

- DB versions map to owned phases as `1→1A`, `2→2B`, `3→3A`, `4→3B`, `5→4A`, and `6→4B`;
- each row creates exactly one `LibraryStoreDefinition`; each listed index creates exactly one `LibraryIndexDefinition`;
- `autoIncrement=false` for every store, `deleteIndexes=[]` for versions 1–6, and minimum readers/backfills/read gates are exactly those in the preceding schema-sequence table;
- schema tests compare the exported `LIBRARY_SCHEMA_STEPS` value against this registry, assert every `LibraryStoreName` occurs exactly once, reject duplicate index names within a store, and open every version in sequence;
- primary compound external-ID keys enforce one mapping per `(scope, namespace, value)`; secondary entity indexes are intentionally non-unique because one entity may own multiple external IDs;
- public-only Phase 3B rows always use the canonical public `MetadataScopeKey`; their scope fields and the global public-metadata lease are still validated rather than omitted;
- profile deletion/rebuild may range-delete only matching profile/scope rows. `PublicMetadataLibraryStoreName` is not accepted by profile rebuild, and mixed-scope stores must preserve public rows;
- Phase 1A owns creation of all four provider revision stores. Phase 1B exclusively populates provider assets, categories, memberships, and format-1 provider search documents during shadow sync;
- Phase 2B creates the three provider join stores, migrates each active revision to format 2, and atomically writes a format-2 document with its complete token/prefix/facet rows. Verification recomputes every expected join key, proves no missing/extra rows for every active revision, and only then enables `provider-search`; interrupted revisions remain on the prior accepted read path;
- Phase 3A/3B own separate canonical/public-person search projections joined to confirmed profile availability; immutable provider revision documents are never rewritten with later metadata.

## Catalog revisions and active pointers

```ts
export type RevisionState =
  | 'writing'
  | 'sealed'
  | 'superseded'
  | 'abandoned'
  | 'deleting'

export interface CatalogRevisionRecord {
  schemaVersion: 1
  id: RevisionId
  profileId: ProfileId
  section: LibrarySection
  scope: CatalogScope
  scopeKey: ScopeKey
  syncRunId: SyncRunId
  sectionPassId: SectionPassId
  requestAttemptId: RequestAttemptId
  generation: SyncGeneration
  state: RevisionState
  createdAt: number
  sealedAt?: number
  itemCount: number
  byteEstimate: number
  completionProof?: ProviderCompletionProof
}

export interface SectionPassRecord {
  schemaVersion: 1
  id: SectionPassId
  profileId: ProfileId
  section: LibrarySection
  syncRunId: SyncRunId
  generation: SyncGeneration
  categoryManifestRevisionId?: RevisionId
  expectedScopeKeys: ScopeKey[]
  completedScopeKeys: ScopeKey[]
  failedScopeKeys: ScopeKey[]
  state: 'running' | 'complete' | 'failed' | 'cancelled'
  deletionQualified: boolean
  startedAt: number
  completedAt?: number
}

export interface SyncLeaseRecord {
  schemaVersion: 1
  key: LeaseKey
  leaseEpoch: LeaseEpoch
  ownerId: string
  kind: 'sync' | 'maintenance'
  scope: LeaseScope
  maintenanceReason?: MaintenanceReason
  state: 'active' | 'released'
  acquiredAt: number
  expiresAt: number
  heartbeatAt: number
  releasedAt?: number
}
```

Required stores/indexes in Phase 1A:

- `catalogRevisions` keyed by `id`, indexed by `[profileId, scopeKey, state]` and `syncRunId`;
- `activeSections` keyed by `[profileId, section]` is the sole active read-routing store; there is no second active-pointer authority;
- Phase 1A creates revision-owned `providerAssets`, `providerCategories`, `categoryMemberships`, and provider-only `searchDocuments` with compound physical keys beginning with `[profileId, revisionId, ...]`; Phase 1B starts populating them;
- `sectionPasses`, `syncRuns`, `syncCheckpoints`, `coverage`, `providerCapabilities`, and `tombstones` have the exact profile indexes in the registry; `syncLeases` is keyed by deterministic `LeaseKey` so it also represents the global public-metadata lease without pretending that every lease has a profile field;
- later canonical/person stores use opaque local keys plus unique/multi-entry indexes for entity-compatible external IDs.

No active query scans “latest” rows. It resolves `ActiveSectionRecord` and then only the referenced immutable revisions.

Scope and activation invariants:

- `ScopeKey` is built only by `scopeKey(scope)`; its encoded form includes `scope.kind`, `profileId`, `section`, and category key where applicable. Manifest and whole-section catalog scopes cannot collide.
- A category-manifest revision uses the section manifest scope. A category-catalog revision uses one category scope. A section-catalog revision uses the section catalog scope.
- `ActiveSectionRecord` is the sole routing authority for whether reads use one whole-section revision or a category-revision set.
- Within `category-crawl` mode, `ActivateCategoryRevisionInput` atomically replaces only that category pointer in `ActiveSectionRecord`, coverage, revision metadata, and checkpoint while other category revisions remain readable.
- A transition between `section-catalog` and `category-crawl` mode occurs only after a complete target section pass; `ActivateSectionLayoutInput` atomically switches `ActiveSectionRecord`, all matching coverage, revision metadata, and checkpoint.
- Until a mode transition commits, the previous complete active layout remains authoritative; incomplete target-mode revisions are staging only.
- Section search/browse captures the active-section layout and complete referenced revision set in `ReadSnapshot`, preventing mixed layouts or accidental latest-generation scans.

## Provider assets

```ts
export interface ProviderAssetRecord {
  schemaVersion: 1
  physicalKey: ProviderAssetPhysicalKey
  revisionId: RevisionId
  scopeKey: ScopeKey
  key: ProviderAssetKey
  profileId: ProfileId
  section: LibrarySection
  providerItemId: string
  categoryId: string
  name: string
  externalIdEvidence: ProviderTitleExternalIdEvidence[]
  normalizedName: string
  originalName?: string
  year?: number
  languageCandidates: LanguageEvidence[]
  countryCodes: string[]
  adultEvidence: AdultEvidence[]
  ratingEvidence: RatingEvidence[]
  versionEvidence: VersionEvidence[]
  quality?: MediaQuality
  iconUrl?: DurableArtworkUrl
  coverUrl?: DurableArtworkUrl
  containerExtension?: string
  directSource?: DurableDirectSourceUrl
  streamType?: string
  seriesId?: string
  providerOrder: number
  ratingSortKey?: number
  addedAtProvider?: number
  firstSeenAt: number
  lastSeenAt: number
  lastSeenGeneration: SyncGeneration
  availability: 'available' | 'missing-candidate' | 'removed'
  contentFingerprint: string
  searchDocumentVersion: ProviderSearchDocumentFormatVersion
}
```

Rules:

- `key = profileId + section + providerItemId`, encoded by one helper.
- `contentFingerprint` is based on normalized non-secret fields and is used to skip unchanged derived work.
- `DurableArtworkUrl` permits only `https` or measured-compatible `http`, with no userinfo/query/fragment and no credential-equivalent path segment.
- `DurableDirectSourceUrl` is allowed only for a provider-declared credential-free direct source with the same restrictions; all signed/tokenized/userinfo/query URLs are discarded and regenerated ephemerally.
- Playback URLs are always `EphemeralPlaybackUrl`, generated on demand from `EphemeralProviderAccess` plus non-secret asset fields, kept out of IndexedDB/Worker batches/traces/errors, and released when playback ends or the profile changes.
- Raw JSON is not retained.
- `availability='removed'` does not erase user history.

## Categories and membership

```ts
export interface ProviderCategoryRecord {
  schemaVersion: 1
  physicalKey: ProviderCategoryPhysicalKey
  revisionId: RevisionId
  key: CategoryKey
  profileId: ProfileId
  section: LibrarySection
  providerCategoryId: string
  name: string
  normalizedName: string
  languageCandidates: LanguageEvidence[]
  adultEvidence: AdultEvidence[]
  adult: boolean
  providerOrder: number
  lastSeenAt: number
  lastSeenGeneration: SyncGeneration
}

export interface CategoryMembershipRecord {
  schemaVersion: 1
  physicalKey: CategoryMembershipPhysicalKey
  revisionId: RevisionId
  profileId: ProfileId
  categoryKey: CategoryKey
  providerAssetKey: ProviderAssetKey
}
```

Membership is separate to support provider duplication or future multi-category sources without duplicating asset rows.

## Language and quality

```ts
export type LanguageEvidenceSource =
  | 'provider-prefix'
  | 'category-name'
  | 'title-script'
  | 'metadata'
  | 'manual'

export interface LanguageEvidence {
  code: string
  confidence: number
  source: LanguageEvidenceSource
}

export type MediaQuality =
  | 'sd'
  | 'hd'
  | 'fhd'
  | 'uhd'
  | '4k'
  | 'unknown'
```

Validation:

- language codes are normalized BCP-47-like lower-case identifiers where possible;
- confidence is finite and clamped to 0–1;
- manual evidence outranks inferred evidence;
- unknown language is valid and must not be silently excluded.

## Coverage and completion proof

```ts
export interface ProviderCompletionProof {
  schemaVersion: 1
  requestAttemptId: RequestAttemptId
  transportCompleted: boolean
  parserReachedEof: boolean
  decoderFlushed: boolean
  topLevelResponseClosed: boolean
  parsedRecordCount: number
  acceptedRecordCount: number
  ignoredInvalidRecordCount: number
  coverageAffectingRejectionCount: number
  timedOut: boolean
  cancelled: boolean
  completedAt: number
}

export interface CoverageRecord {
  schemaVersion: 1
  key: ScopeKey
  profileId: ProfileId
  section: LibrarySection
  scope: CatalogScope
  activeRevisionId?: RevisionId
  activeGeneration?: SyncGeneration
  sectionPassId?: SectionPassId
  completeness: 'none' | 'partial' | 'complete'
  freshness: 'current' | 'stale'
  lastAttemptOutcome: 'none' | 'success' | 'failed' | 'cancelled'
  deletionProof: 'none' | 'qualified'
  completedAt?: number
  staleAt?: number
  expectedUnits?: number
  completedUnits: number
  failedUnits: number
  itemCount: number
  sourceMode: 'whole-library' | 'category-crawl' | 'mixed'
  completionProof?: ProviderCompletionProof
  lastErrorCode?: SyncErrorCode
}
```

A failed refresh preserves the prior active revision and may change freshness/attempt outcome without changing its proven completeness. Category coverage is complete only with a valid request completion proof. Aggregate section coverage is complete only when its `SectionPassRecord` is complete, every expected scope is complete, and no scope failed. An empty result is authoritative only for matching, current, complete coverage whose proof has all completion flags, zero coverage-affecting rejections, and no timeout/cancellation. Harmless invalid records may be counted and ignored only under an explicit tested validation policy; any rejection that could hide a valid asset blocks authoritative coverage and deletion.

## Provider capability health

```ts
export type ProviderEndpoint =
  | 'validate'
  | 'live-categories'
  | 'vod-categories'
  | 'series-categories'
  | 'live-all'
  | 'vod-all'
  | 'series-all'
  | 'live-category'
  | 'vod-category'
  | 'series-category'

export interface ProviderCapabilityRecord {
  schemaVersion: 1
  key: string
  profileId: ProfileId
  endpoint: ProviderEndpoint
  state: 'unknown' | 'healthy' | 'degraded' | 'backoff' | 'unsupported'
  successCount: number
  failureCount: number
  timeoutCount: number
  consecutiveFailures: number
  lastSuccessAt?: number
  lastFailureAt?: number
  averageDurationMs?: number
  backoffUntil?: number
  lastErrorCode?: SyncErrorCode
}
```

Backoff must be bounded, persist across launches, and reset after a proven success.

## Sync runs, checkpoints, and errors

```ts
export type SyncRunState =
  | 'planned'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'abandoned'

export type SyncErrorCode =
  | 'timeout'
  | 'network'
  | 'http'
  | 'invalid-response'
  | 'quota'
  | 'cancelled'
  | 'database'
  | 'unsupported'
  | 'unknown'

export interface SyncRunRecord {
  schemaVersion: 1
  id: SyncRunId
  profileId: ProfileId
  generation: SyncGeneration
  reason: 'initial' | 'daily' | 'manual' | 'repair'
  state: SyncRunState
  startedAt: number
  updatedAt: number
  completedAt?: number
  runner: 'worker-idb' | 'worker-main-idb' | 'cooperative-main'
  plannedUnits: number
  completedUnits: number
  failedUnits: number
  inserted: number
  updated: number
  unchanged: number
  removalCandidates: number
  lastErrorCode?: SyncErrorCode
}

export interface SyncCheckpointRecord {
  schemaVersion: 1
  key: string
  syncRunId: SyncRunId
  profileId: ProfileId
  unitKey: string
  section: LibrarySection
  categoryKey?: CategoryKey
  stage:
    | 'manifest'
    | 'fetch'
    | 'normalize'
    | 'write'
    | 'seal'
    | 'activate'
    | 'finalize'
  requestAttemptId?: RequestAttemptId
  sealedRevisionId?: RevisionId
  localCursor?: string
  processedRecords: number
  updatedAt: number
}
```

`localCursor` is only for resumable local IndexedDB scans or an explicitly proven paginated provider. It must never imply byte/record resume within a standard non-paginated Xtream response. A durable checkpoint advances only after sealing or activation.

## Tombstones

```ts
export interface TombstoneCandidateRecord {
  schemaVersion: 1
  providerAssetKey: ProviderAssetKey
  profileId: ProfileId
  proofScopeKey: ScopeKey
  firstMissingGeneration: SyncGeneration
  lastConfirmedMissingGeneration: SyncGeneration
  firstMissingSectionPassId: SectionPassId
  lastConfirmedSectionPassId: SectionPassId
  completePassCount: number
  eligibleAfter: number
  protectedByUserState: boolean
}
```

Deletion requires comparable complete section-level proof, a later confirming pass, and the grace policy. Category-only, partial, malformed, failed, timed-out, or cancelled runs cannot create or advance deletion eligibility. New immutable provider revisions carry forward previously known missing assets until confirmation: reads join revision rows with the exact profile overlay epoch captured in `ReadSnapshot`.

Each overlay epoch is an immutable full snapshot of all current `missing-candidate` and `removed` entries for the profile. First absence creates a new epoch containing the previous entries plus `missing-candidate`; confirmed grace creates a new epoch with `removed`; reappearance creates a new epoch omitting that asset. `applyConfirmedRemovals` atomically compare-and-swaps `ProfileAvailabilityStateRecord.currentEpoch`, writes the complete new epoch, deletes corresponding tombstones, and updates protected projections/checkpoint without mutating provider revisions. Partial epoch writes are unreachable because the current-epoch pointer changes only in the final transaction.

Pruning retains every overlay epoch until at least the maximum five-minute cursor TTL has elapsed after it stopped being current, and longer while an in-memory hybrid session references it. Relaunch discards cursor/session registries, so an old cursor then returns `snapshot-expired`. Physical provider rows are reclaimed only after no active revision, retained cursor window, hybrid session, overlay epoch, or protected user reference requires them.

## Canonical title identity

```ts
export type CanonicalMediaType = 'movie' | 'series'

export type CanonicalTitleProvenanceField =
  | 'primaryTitle'
  | 'originalTitle'
  | 'year'
  | 'overview'
  | 'genreIds'
  | 'countryCodes'
  | 'originalLanguage'
  | 'posterUrl'
  | 'backdropUrl'
  | 'rating'

export interface CanonicalTitleProvenance {
  field: CanonicalTitleProvenanceField
  source: 'tmdb' | 'tvmaze' | 'trakt' | 'provider' | 'manual'
  metadataScope: MetadataScope
  sourceExternalId?: TitleExternalIdValue
  observedAt: number
}

export interface CanonicalTitleRecord {
  schemaVersion: 1
  key: CanonicalTitleKey
  metadataScope: MetadataScope
  metadataScopeKey: MetadataScopeKey
  mediaType: CanonicalMediaType
  primaryTitle: string
  normalizedPrimaryTitle: string
  originalTitle?: string
  year?: number
  overview?: string
  genreIds: string[]
  countryCodes: string[]
  originalLanguage?: string
  posterUrl?: DurableArtworkUrl
  backdropUrl?: DurableArtworkUrl
  rating?: string
  provenance: CanonicalTitleProvenance[]
  metadataUpdatedAt?: number
}

export interface TitleExternalIdRecord {
  schemaVersion: 1
  entity: 'title'
  physicalKey: TitleExternalIdPhysicalKey
  metadataScope: MetadataScope
  metadataScopeKey: MetadataScopeKey
  namespace: TitleExternalIdNamespace
  value: string
  canonicalTitleKey: CanonicalTitleKey
}

export interface PersonExternalIdRecord {
  schemaVersion: 1
  entity: 'person'
  physicalKey: PersonExternalIdPhysicalKey
  metadataScope: PublicMetadataScope
  metadataScopeKey: MetadataScopeKey
  namespace: PersonExternalIdNamespace
  value: string
  personKey: PersonKey
}

export interface TitleAliasRecord {
  schemaVersion: 1
  key: string
  canonicalTitleKey: CanonicalTitleKey
  metadataScope: MetadataScope
  metadataScopeKey: MetadataScopeKey
  value: string
  normalizedValue: string
  language?: string
  source: 'provider' | 'tmdb' | 'tvmaze' | 'trakt' | 'manual'
}
```

Physical external-ID and alias stores are authoritative; canonical records do not embed duplicate mapping rows. `MetadataScope` is always tagged, so a real profile ID cannot collide with public metadata. A public canonical record's identity-bearing fields require public TMDB/TVmaze/Trakt provenance. Provider/manual-only data creates or updates a profile-scoped canonical record and cannot become shared metadata. Provider/manual aliases derived from a private playlist use `{ kind: 'profile', profileId }`; externally sourced aliases use `{ kind: 'public' }`. Manual identity decisions are profile-scoped and do not mutate global canonical identity.

TVmaze IDs must never be stored in a field named `tmdbId`.

## Availability links

```ts
export type IdentityMatchMethod =
  | 'provider-external-id'
  | 'exact-title-year'
  | 'original-title-year'
  | 'alias-title-year'
  | 'normalized-title'
  | 'fuzzy-title-year'
  | 'manual'

export interface AvailabilityLinkRecord {
  schemaVersion: 1
  key: string
  profileId: ProfileId
  canonicalTitleKey: CanonicalTitleKey
  providerAssetKey: ProviderAssetKey
  policyVersion: number
  confidence: number
  matchMethod: IdentityMatchMethod
  evidence: IdentityEvidence[]
  state: 'candidate' | 'confirmed' | 'rejected' | 'superseded'
  preferred: boolean
  manuallyConfirmed: boolean
  supersededByProviderAssetKey?: ProviderAssetKey
  createdAt: number
  updatedAt: number
}
```

Rules:

- exact provider external IDs can auto-confirm;
- exact normalized title plus exact year may auto-confirm above a defined threshold;
- title-only/fuzzy candidates must not silently navigate;
- manual confirmation/rejection outranks automated rematching;
- multiple assets may link to one canonical title.

## People and credits

```ts
export interface PersonRecord {
  schemaVersion: 1
  key: PersonKey
  metadataScope: PublicMetadataScope
  metadataScopeKey: MetadataScopeKey
  name: string
  normalizedName: string
  provenance: Array<{
    field: 'name' | 'portraitUrl' | 'biography'
    source: 'tmdb' | 'tvmaze' | 'trakt'
    sourceExternalId?: PersonExternalIdValue
    observedAt: number
  }>
  portraitUrl?: DurableArtworkUrl
  biography?: string
  metadataUpdatedAt?: number
}

export interface PersonAliasRecord {
  schemaVersion: 1
  key: string
  personKey: PersonKey
  metadataScope: PublicMetadataScope
  metadataScopeKey: MetadataScopeKey
  value: string
  normalizedValue: string
  source: 'tmdb' | 'tvmaze' | 'trakt'
}

export interface CreditRecord {
  schemaVersion: 1
  key: string
  metadataScope: PublicMetadataScope
  metadataScopeKey: MetadataScopeKey
  personKey: PersonKey
  canonicalTitleKey: CanonicalTitleKey
  source: 'tmdb' | 'tvmaze' | 'trakt'
  sourceCreditId?: string
  character?: string
  job?: string
  department?: string
  order?: number
  observedAt: number
}
```

People, person external IDs, person aliases, person search projections, and credits are public-only in Phases 0–4. Their constructors require `{ kind: 'public' }`, authoritative external provenance, and the public metadata lease. A credit is accepted only when both its person and target canonical title are public records. Provider-derived or manual private person aliases/credits are not persisted; supporting private people is a future schema ADR rather than an implicit cross-profile bridge.

## Search documents and filters

```ts
export type ProviderSearchDocumentFormatVersion = 1 | 2

export interface SearchDocumentRecord {
  schemaVersion: 1
  formatVersion: ProviderSearchDocumentFormatVersion
  physicalKey: SearchDocumentPhysicalKey
  revisionId: RevisionId
  key: string
  profileId: ProfileId
  providerAssetKey: ProviderAssetKey
  normalizedTitle: string
  normalizedAliases: string[]
  tokenSet: string[]
  year?: number
  languageCodes: string[]
  countryCodes: string[]
  genreIds: string[]
  quality: MediaQuality
  section: LibrarySection
  categoryKeys: CategoryKey[]
  adult: boolean
  ratingSortKey?: number
  addedSortKey: number
}

export interface ProviderSearchTokenRecord {
  schemaVersion: 1
  physicalKey: ProviderSearchTokenPhysicalKey
  profileId: ProfileId
  revisionId: RevisionId
  token: string
  providerAssetKey: ProviderAssetKey
}

export interface ProviderSearchPrefixRecord {
  schemaVersion: 1
  physicalKey: ProviderSearchPrefixPhysicalKey
  profileId: ProfileId
  revisionId: RevisionId
  prefix: string
  providerAssetKey: ProviderAssetKey
}

export interface ProviderSearchFacetRecord {
  schemaVersion: 1
  physicalKey: ProviderSearchFacetPhysicalKey
  profileId: ProfileId
  revisionId: RevisionId
  kind: ProviderSearchFacetKind
  value: string
  providerAssetKey: ProviderAssetKey
}

export interface ProviderSearchProjectionBatch {
  formatVersion: 2
  tokens: ProviderSearchTokenRecord[]
  prefixes: ProviderSearchPrefixRecord[]
  facets: ProviderSearchFacetRecord[]
}

export interface CatalogSearchRequest extends PageRequest {
  profileId: ProfileId
  query: string
  sections?: LibrarySection[]
  categoryKeys?: CategoryKey[]
  languageCodes?: string[]
  countryCodes?: string[]
  genreIds?: string[]
  personKeys?: PersonKey[]
  qualities?: MediaQuality[]
  yearFrom?: number
  yearTo?: number
  watched?: boolean
  favorite?: boolean
  availability?: Array<'available' | 'detached' | 'removed'>
  includeAdult: boolean
  sort: SearchSort
  signal?: AbortSignal
}

export interface CatalogSearchResponse extends PageResult {
  results: CatalogSearchResult[]
  coverage: CoverageSummary
  source: ReadSource
  issues: ReadIssue[]
  durationMs: number
  snapshot: ReadSnapshot
}
```

The first index should support exact aliases, tokens, prefixes, and facets. Trigrams are a later measured optimization.

The active-profile in-memory index must have explicit limits:

```ts
export interface LocalSearchIndexLimits {
  maxDocuments: number
  maxUniqueTokens: number
  maxPrefixEntries: number
  maxEstimatedBytes: number
  loadPageSize: number
}
```

It is populated incrementally from IndexedDB cursors/pages, never by first materializing all search documents into an array. If a limit is reached, remaining queries use paged persisted search plus bounded ranking rather than silently dropping results. Limits, fallback use, approximate bytes, load duration, and release on profile switch are measurable acceptance data.

## Repository contracts

```ts
export interface CatalogRepository {
  open(profileId: ProfileId): Promise<void>
  close(): Promise<void>
  getCoverage(scope: CoverageQueryScope): Promise<CoverageSummary>
  listCategories(request: CategoryListRequest): Promise<CategoryListResponse>
  listAssets(request: AssetListRequest): Promise<AssetListResponse>
  search(request: CatalogSearchRequest): Promise<CatalogSearchResponse>
  getAsset(key: ProviderAssetKey): Promise<ProviderAssetRecord | null>
  getCanonicalTitle(key: CanonicalTitleKey): Promise<CanonicalTitleRecord | null>
  getPerson(key: PersonKey): Promise<PersonRecord | null>
  findAvailability(
    canonicalTitleKey: CanonicalTitleKey,
    profileId: ProfileId,
  ): Promise<AvailabilityLinkRecord[]>
}

export interface CatalogAdminRepository {
  acquireProfileMaintenanceLease<R extends MaintenanceReason>(
    request: ProfileMaintenanceLeaseRequest<R>,
  ): Promise<
    MaintenanceLeaseGuard<R> & {
      scope: { kind: 'profile'; profileId: ProfileId }
    }
  >
  acquirePublicMetadataLease<R extends PublicMetadataMaintenanceReason>(
    request: PublicMetadataMaintenanceLeaseRequest<R>,
  ): Promise<
    MaintenanceLeaseGuard<R> & {
      scope: { kind: 'public-metadata' }
    }
  >
  renewMaintenanceLease<G extends MaintenanceLeaseGuard>(
    guard: G,
  ): Promise<G>
  releaseMaintenanceLease(guard: MaintenanceLeaseGuard): Promise<void>
  deleteProfileCatalog(input: ProfileCatalogDeletionInput): Promise<void>
  controlledRebuild(input: ControlledRebuildInput): Promise<RecoveryReport>
  recoverAbandonedSyncRuns(
    input: ProfileMaintenanceInputFor<'startup-recovery'>,
  ): Promise<RecoveryReport>
  pruneRebuildableData(input: PruneInput): Promise<PruneReport>
}

export interface CatalogMaintenanceRepository {
  assertCurrentMaintenanceLease(input: MaintenanceInput): Promise<void>
  runMaintenanceTransaction<T>(
    input: MaintenanceInput,
    stores: LibraryStoreName[],
    work: LibraryTransactionWork<T>,
  ): Promise<T>
}

export interface CatalogWriteRepository {
  acquireSyncLease(
    profileId: ProfileId,
    ownerId: string,
  ): Promise<SyncLeaseGuard>
  renewSyncLease(guard: SyncLeaseGuard): Promise<SyncLeaseGuard>
  releaseSyncLease(guard: SyncLeaseGuard): Promise<void>
  allocateSyncRun(
    lease: SyncLeaseGuard,
    reason: SyncReason,
    runner: SyncRunRecord['runner'],
  ): Promise<SyncRunRecord>
  getSyncRun(profileId: ProfileId, runId: SyncRunId): Promise<SyncRunRecord | null>
  putSyncRun(lease: SyncLeaseGuard, run: SyncRunRecord): Promise<void>
  putCheckpoint(
    lease: SyncLeaseGuard,
    checkpoint: SyncCheckpointRecord,
  ): Promise<void>
  deleteCheckpoint(lease: SyncLeaseGuard, key: string): Promise<void>
  putSectionPass(lease: SyncLeaseGuard, pass: SectionPassRecord): Promise<void>
  putCoverage(lease: SyncLeaseGuard, coverage: CoverageRecord): Promise<void>
  putProviderCapability(
    lease: SyncLeaseGuard,
    capability: ProviderCapabilityRecord,
  ): Promise<void>
  putTombstone(
    lease: SyncLeaseGuard,
    candidate: TombstoneCandidateRecord,
  ): Promise<void>
  deleteTombstone(
    lease: SyncLeaseGuard,
    profileId: ProfileId,
    providerAssetKey: ProviderAssetKey,
  ): Promise<void>
  beginRevision(input: BeginRevisionInput): Promise<CatalogRevisionRecord>
  appendRevisionBatch(
    lease: SyncLeaseGuard,
    revisionId: RevisionId,
    batch: RevisionWriteBatch,
  ): Promise<void>
  sealRevision(
    lease: SyncLeaseGuard,
    revisionId: RevisionId,
    proof: ProviderCompletionProof,
  ): Promise<CatalogRevisionRecord>
  activateRevision(input: ActivateRevisionInput): Promise<void>
  abandonRevision(
    lease: SyncLeaseGuard,
    revisionId: RevisionId,
    reason: SyncErrorCode,
  ): Promise<void>
  applyConfirmedRemovals(input: ApplyRemovalInput): Promise<void>
  pruneSupersededRevisions(
    lease: SyncLeaseGuard,
    policy: StoragePolicy,
  ): Promise<PruneReport>
}
```

`allocateSyncRun` executes under the current fenced profile lease and atomically allocates the next generation as one greater than every committed run/active-section generation for that profile. Resume reuses the persisted run ID/generation and fails if profile, complete lease guard, or resumable state does not match. Every sync mutation compares `leaseKey`, `leaseEpoch`, owner, kind, scope, state, and repository-clock expiry in the same transaction as its write. Caller timestamps are diagnostic observations only. Release changes the matching epoch to `released` without deleting its fencing history; a takeover atomically increments the scope's epoch, so stale callers can never write, renew, or release a later lease.

Every Phase 3/4 mutator—including identity candidates/subjects/lineage/overrides, public convergence, enrichment jobs, evidence overrides, policy state, version groups, user-state projections, episode observations, collections, acknowledgements, and diagnostics—accepts a reason-narrowed profile or public-metadata maintenance input plus an explicit `CatalogMaintenanceRepository`. `runMaintenanceTransaction` always includes `syncLeases` with exactly the requested stores, validates lease key/epoch/owner/kind/scope/reason/state and repository-clock expiry at transaction start, and aborts the whole transaction on mismatch. `observedAt` is diagnostic only and never authorizes a write. Long-running queues renew through `CatalogAdminRepository` between bounded batches and pass the returned guard to every later batch. Sync and maintenance operations for one profile share the same deterministic profile `LeaseKey` and are mutually exclusive. Shared public canonical/person/credit/episode/redirect writes use the distinct global `public-metadata` lease key; a profile lease cannot authorize them. `initiatingProfileId` on a public request is optional attribution for scheduling only, never authorization or row scope. One transaction never mixes profile-private and public-metadata writes. Protected stores are never accepted by `ControlledRebuildInput`; explicit profile deletion removes only matching profile-scoped rows and never public metadata.

## Worker protocol

```ts
export type LibraryWorkerRequest =
  | CapabilityProbeRequest
  | StartSyncRequest
  | { type: 'pause-sync'; reason: SyncControlReason }
  | { type: 'cancel-sync'; reason: SyncControlReason }
  | {
      type: 'resume-sync'
      profileId: ProfileId
      runId: SyncRunId
      lease: SyncLeaseGuard
    }
  | WorkerMainWriteAcknowledgement
  | { type: 'shutdown' }

export type LibraryWorkerEvent =
  | { type: 'probe-fetch-ack'; tested: boolean }
  | { type: 'probe-progress'; stage: ProbeStage; metrics?: Record<string, number> }
  | { type: 'probe-result'; report: CapabilityProbeReport }
  | {
      type: 'credentials-accepted'
      profileId: ProfileId
      runId: SyncRunId
    }
  | WorkerMainWriteBatch
  | { type: 'sync-state'; state: SyncRunState; runId?: SyncRunId }
  | { type: 'sync-progress'; progress: SyncProgress }
  | { type: 'coverage-updated'; coverage: CoverageRecord }
  | { type: 'sync-error'; error: SerializedSyncError }
```

The envelope `messageId` is the only protocol message ID; payloads do not define a second `id`. Credential-bearing paths are exactly `payload.options.fetch` for `probe` and `payload.profile` for `start-sync`. Generic inspection/logging replaces those complete values before serialization. The Worker emits one correlated sanitized acknowledgement before either sender releases its temporary credential reference.

For `worker-main-idb`, the Worker emits at most one `WorkerMainWriteBatch` at a time and awaits its correlated acknowledgement before parsing/emitting the next batch. The main thread validates run/profile/lease/revision, commits the whole batch transaction, and only then acknowledges. Cancellation rejects the outstanding batch, aborts its transaction, and emits no later batch.

`WorkerProfileInput` contains credentials only in memory and must never be persisted.

## Capability probe

```ts
export interface CapabilityProbeOptions {
  recordCounts: number[]
  batchSizes: number[]
  fetch?: EphemeralProbeFetchInput
  testWorkerIndexedDb: boolean
  cleanup: boolean
}

export interface CapabilityProbeReport {
  schemaVersion: 1
  device: {
    userAgent: string
    webOsRuntime: boolean
  }
  worker: {
    classicSupported: boolean
    packagedUrlResolved: boolean
    startupSupported: boolean
    messagingSupported: boolean
    startupError?: ProbeStartupErrorCode
  }
  fetch: {
    mainThreadTested: boolean
    mainThreadSupported: boolean
    workerTested: boolean
    workerSupported: boolean
    workerFailureKind?: 'cors' | 'network' | 'http' | 'unsupported' | 'unknown'
  }
  indexedDb: {
    mainThreadSupported: boolean
    workerSupported: boolean
    persistsAcrossRelaunch: 'unknown' | 'yes' | 'no'
    indexesSupported: boolean
    cursorsSupported: boolean
    compoundKeysSupported: boolean
  }
  workerToMainWrites: {
    tested: boolean
    supported: boolean
    p50BatchMs?: number
    p95BatchMs?: number
  }
  cooperativeMain: {
    tested: boolean
    supported: boolean
    p95SliceMs?: number
    longTaskCount?: number
  }
  storage: {
    estimateSupported: boolean
    persistSupported: boolean
    quotaBytes?: number
    usageBytes?: number
    persistenceGranted?: boolean
  }
  measurements: CapabilityMeasurement[]
  cancellation: {
    workerTerminated: boolean
    transactionRecovered: boolean
  }
  recommendation:
    | 'worker-idb'
    | 'worker-main-idb'
    | 'cooperative-main'
    | 'no-go'
  warnings: CapabilityWarningCode[]
}
```

The probe uses a separate disposable database. Provider credentials appear only in the explicit ephemeral `options.fetch` stage, are transferred directly to the probe Worker, are redacted from generic envelope inspection, are never persisted, and are released by both sender and Worker after sanitized acknowledgement/result. The report preserves separate outcomes for main-thread fetch, Worker fetch, Worker IndexedDB, main-thread IndexedDB, Worker-to-main write throughput, cooperative scheduling, packaged URL resolution, and close/relaunch persistence; one boolean must not collapse these independent decisions.

[Files]

Create a modular Library Engine beside the existing app, preserve the current network implementation through feature flags, and avoid deleting migration paths until parity is proven.

## Permanent planning and documentation files

- `implementation_plan.md`
  - This document is the canonical architecture, phase order, contracts, gates, and future-session reference.
  - Future sessions must reread the relevant sections before editing code.
- `PERFORMANCE_CAPTURE.md`
  - Extend during implementation with Library Engine trace scenarios and device acceptance evidence.
- New `LIBRARY_ENGINE_STATUS.md`
  - Append phase completion records, dates, commit references, device reports, accepted deviations, open risks, and rollback status.
  - Do not replace this plan with status notes.

## Phase 0 files: capability probe

New:

- `src/library/capability-types.ts`
  - Probe contracts and validation.
- `src/library/capability-probe.ts`
  - Main-thread orchestrator and report aggregation.
- `src/library/capability-probe-worker.ts`
  - Classic worker probe entry; no production sync behavior.
- `vite.worker.config.ts`
  - Separate no-code-splitting ES2015 IIFE build producing deterministic `webos-app/library-capability-worker.js`.
- `tsconfig.worker.json` if file-local Worker library references are insufficient.
- `src/library/capability-probe.test.ts`
  - Unit tests with fake IndexedDB/Worker boundaries where practical.
- `src/library/idb-probe.ts`
  - Disposable DB open/write/index/cursor/batch/delete helpers.
- `scripts/library-capability-report.md`
  - Human-readable instructions for physical-device execution and report interpretation.

Modify:

- `vite.config.ts`
  - Preserve the existing single-entry application IIFE build.
  - Add build-info capability-probe availability.
- `package.json`
  - Chain the separate Worker build after the current application build and propagate either build's failure.
- `src/performance-trace.ts`
  - Accept bounded non-sensitive probe events.
- `src/main.ts`
  - Expose a development-only `window.__NOVA_LIBRARY_PROBE__` API or hidden launch-param route.
  - Do not alter normal UI behavior.
- `public/appinfo.json`
  - No service declaration in Phase 0.
- `.gitignore`
  - Ignore exported device reports if they can contain device-specific timing; commit only summarized findings.

Probe artifacts must clean up their disposable IndexedDB database.

## Phase 1 files: schema and shadow sync

New:

- `src/library/types.ts`
  - Permanent Library Engine contracts described in `[Types]`.
- `src/library/keys.ts`
  - Provider, category, canonical, person, credit, and availability key builders.
- `src/library/database.ts`
  - IndexedDB open/upgrade/transaction primitives.
- `src/library/schema.ts`
  - DB name, schema version, object-store names, indexes, and migration definitions.
- `src/library/repository.ts`
  - `IndexedDbCatalogRepository`.
- `src/library/repository-memory.ts`
  - Deterministic test/reference repository, not a production full-catalog RAM store.
- `src/library/provider-capabilities.ts`
  - Health state and exponential/bounded backoff policy.
- `src/library/sync-planner.ts`
  - Chooses whole-library versus category crawl and prioritizes units.
- `src/library/sync-engine.ts`
  - Runner-independent state machine.
- `src/library/sync-runner.ts`
  - Cooperative main-thread runner.
- `src/library/sync-worker.ts`
  - Worker entry if Gate 0 selects worker operation.
- `src/library/sync-controller.ts`
  - Main-thread worker lifecycle, playback pause, page lifecycle, and status events.
- `src/library/normalization.ts`
  - Provider record-to-`ProviderAssetRecord` conversion.
- `src/library/search-document.ts`
  - Search projection generation.
- `src/library/coverage.ts`
  - Coverage computation and authoritative-scope rules.
- `src/library/tombstones.ts`
  - Removal candidate/grace logic.
- `src/library/telemetry.ts`
  - Safe Library Engine trace helpers.
- Matching `*.test.ts` files for every pure policy/state module.

Modify:

- `src/xtream-client.ts`
  - Extract/reuse the incremental object parser through a callback/async batch API suitable for ingestion.
  - Preserve current public methods during migration.
- `src/types.ts`
  - Keep UI/playback types; reference library types only where stable UI contracts require it.
- `src/main.ts`
  - Initialize shadow sync after profile activation.
  - Pause/cancel via `beginPlayback`, profile switches, `pagehide`, and settings changes.
  - Keep UI reads on the existing path in Phase 1.
- `src/storage.ts`
  - Keep credentials/settings/favorites/resume behavior.
  - Do not move user data into IndexedDB in Phase 1.
- `vite.config.ts`
  - Emit production sync worker if Gate 0 permits it.
- `PERFORMANCE_CAPTURE.md`
  - Add shadow sync, DB, transaction, and parity scenarios.

## Phase 2 files: local browse/search cutover

New:

- `src/library/catalog-service.ts`
  - Coverage-aware read router over local repository and current network fallback.
- `src/library/search-index.ts`
  - Compact in-memory token/prefix/facet index built from persisted search documents.
- `src/library/search-index.test.ts`
  - Query semantics, facets, ranking, cancellation, and memory-bound tests.
- `src/library/parity.ts`
  - Shadow comparison and discrepancy summaries.
- `src/library/feature-flags.ts`
  - `shadow`, `hybrid`, and `local-first` modes with rollback support.

Modify:

- `src/main.ts`
  - Route `openSection`, `loadCategory`, and `runGlobalSearch` through `CatalogService`.
  - Keep `localStreamForCredit` unchanged until Phase 3B.
  - Render coverage/staleness/sync states.
  - Preserve playback URL generation through `XtreamClient`.
- `src/search.ts`
  - Share normalization/token behavior with persistent search document creation.
- `src/search-catalog-queue.ts`
  - Retire or narrow after local sync parity; do not delete until local-first mode is stable.
- `src/lru-ttl-cache.ts`
  - Retain only for bounded session result caching if measurements still justify it.
- `src/style.css`
  - Add TV-friendly sync/coverage/partial-result indicators.
- `TV_UX_REGRESSION_CHECKLIST.md`
  - Add local/partial/stale/offline search and D-pad checks.

## Phase 3 files: identity and people graph

New:

- `src/library/identity/types.ts`
- `src/library/identity/normalization.ts`
- `src/library/identity/matcher.ts`
- `src/library/identity/policy.ts`
- `src/library/identity/overrides.ts`
- `src/library/identity/availability.ts`
- `src/library/identity/*.test.ts`

Modify:

- `src/types.ts`
  - Introduce namespaced external IDs in UI metadata contracts while retaining compatibility adapters.
- `src/metadata-client.ts`
  - Preserve source namespace for TMDB/TVmaze IDs.
  - Stop storing TVmaze IDs in TMDB-named fields.
- `src/provider-metadata.test.ts`
  - Add namespace and collision tests.
- `metadata-proxy/worker.ts`
  - Return explicitly namespaced title/person IDs.
- `metadata-proxy/worker.test.ts`
  - Verify identity namespaces and bounded availability inputs.
- `src/main.ts`
  - Replace `knownStreams`-only `localStreamForCredit` behavior with repository availability lookup.
  - Add unavailable and ambiguous-version UI outcomes.
- `src/style.css`
  - Add compact version chooser and availability states.

## Phase 4 files: advanced library UX

New:

- `src/library/preferences.ts`
  - Validate and apply `LibraryPreferenceSettings`; deterministic language/audio/subtitle/quality precedence.
- `src/library/parental-policy.ts`
  - Aggregate adult/rating evidence and enforce policy at every read/navigation boundary.
- `src/library/version-groups.ts`
  - Deterministic canonical version groups and preferred-version selection.
- `src/library/user-state-projection.ts`
  - Read-only projection of authoritative localStorage favorites/resume into IndexedDB joins.
- `src/library/episodes.ts`
  - Stable canonical episode identity, first-seen observations, and acknowledgement policy.
- `src/library/collections.ts`
  - Saved query definitions, dynamic collection evaluation, facets, and acknowledgements.
- `src/library/diagnostics.ts`
  - Redacted bounded provider/storage/sync/coverage snapshots and export.
- A matching `*.test.ts` for every Phase 4 policy module.

`src/library/recommendations.ts` is deferred and must not be created in Phase 4.

Modify:

- `src/types.ts`
  - Nest schema-versioned `LibraryPreferenceSettings` under the existing per-profile `AppSettings`; preserve all playback fields.
- `src/storage.ts`
  - Validate/migrate settings, create/readback-verify PBKDF2 PIN verifiers, and preserve exact prior values on migration failure.
  - Expose nonmutating favorite/resume snapshot and fingerprint functions for projection.
- `src/main.ts`
  - Add filter UI, version chooser, saved collections, and diagnostics.
- `src/style.css`
  - Remote-first filters and collection layouts.
- `README.md`
  - User-facing local library behavior and privacy.
- `TV_UX_REGRESSION_CHECKLIST.md`
  - Language/version/filter and remote-navigation scenarios.

## Phase 5 discovery files

Phase 5 discovery creates documentation only:

- `docs/adr/ADR-005-background-sync-topology.md`
  - Evidence, option matrix, threat model, compatibility decision, rejection reasons, and explicit implementation authorization state.
- `docs/adr/ADR-005-evidence-template.md`
  - Sanitized aggregate measurement template; no provider/private data.

Potential implementation paths remain prohibited until a later separately approved implementation ADR:

- `services/library-sync/` for a packaged webOS service; or
- `nova-hub/` as a separate opt-in local companion project.

No service/Hub code, manifest declaration, Activity Manager registration, discovery client, external protocol endpoint, credential migration, or closed-app scheduler may be added in Phase 5 discovery.

## Files to retire only after stable local-first cutover

Potential later removals from `src/main.ts`:

- `CompleteSearchCatalog`
- `completeSearchCatalogs`
- `SearchCatalogWarmQueue` integration
- direct catalog `streamCache` responsibilities
- provider-driven global-search orchestration

Do not remove these in shadow mode. Record removal in `LIBRARY_ENGINE_STATUS.md` after rollback tests prove the replacement.

[Functions]

Add capability, database, synchronization, repository, identity, and search APIs while progressively redirecting existing browse/search functions through coverage-aware services.

## Phase 0 functions

### `src/library/idb-probe.ts`

```ts
export declare function openProbeDatabase(name: string, version: number): Promise<IDBDatabase>
export declare function deleteProbeDatabase(name: string): Promise<void>
export declare function writeProbeBatch(
  db: IDBDatabase,
  records: CapabilityProbeRecord[],
  batchSize: number,
): Promise<CapabilityMeasurement>
export declare function readProbeKeys(
  db: IDBDatabase,
  expectedCount: number,
): Promise<CapabilityMeasurement>
export declare function queryProbeIndex(
  db: IDBDatabase,
  token: string,
): Promise<CapabilityMeasurement>
export declare function iterateProbeCursor(db: IDBDatabase): Promise<CapabilityMeasurement>
```

### `src/library/capability-probe.ts`

```ts
export interface CapabilityProbeFunctions {
  runLibraryCapabilityProbe(
    options: CapabilityProbeOptions,
    reporter?: (
      stage: ProbeStage,
      metrics?: Record<string, number>,
    ) => void,
  ): Promise<CapabilityProbeReport>

  recommendLibraryRunner(
    report: CapabilityProbeReport,
  ): CapabilityProbeReport['recommendation']
}
```

### Worker API

```ts
export declare function createCapabilityProbeWorker(): Worker
export declare function runWorkerProbe(
  worker: Worker,
  options: CapabilityProbeOptions,
  signal?: AbortSignal,
): Promise<CapabilityProbeReport>
```

### Global development API

```ts
export interface LibraryCapabilityProbeApi {
  run(
    options?: Partial<CapabilityProbeOptions>,
  ): Promise<CapabilityProbeReport>
  cleanup(): Promise<void>
}

declare global {
  interface Window {
    __NOVA_LIBRARY_PROBE__?: LibraryCapabilityProbeApi
  }
}
```

The global API must exist only in a debug/probe-enabled build or explicit launch-param mode.

## Database functions

### `src/library/database.ts`

```ts
export declare function openLibraryDatabase(): Promise<IDBDatabase>
export declare function closeLibraryDatabase(): Promise<void>
export declare function runReadonlyTransaction<T>(
  stores: LibraryStoreName[],
  work: LibraryTransactionWork<T>,
): Promise<T>
export declare function runReadwriteTransaction<T>(
  stores: LibraryStoreName[],
  work: LibraryTransactionWork<T>,
): Promise<T>
export declare function acquireSyncLease(
  profileId: ProfileId,
  ownerId: string,
): Promise<SyncLeaseGuard>
export declare function renewSyncLease(
  guard: SyncLeaseGuard,
): Promise<SyncLeaseGuard>
export declare function releaseSyncLease(guard: SyncLeaseGuard): Promise<void>
export declare function recoverAbandonedSyncRuns(
  input: ProfileMaintenanceInputFor<'startup-recovery'>,
): Promise<RecoveryReport>
export declare function pruneRebuildableData(input: PruneInput): Promise<PruneReport>
```

Transaction helpers must reject on abort/error and never resolve before transaction completion.

### `src/library/schema.ts`

```ts
export declare function upgradeLibrarySchema(
  database: IDBDatabase,
  transaction: IDBTransaction,
  oldVersion: number,
  newVersion: number,
): void
```

Every version step is the exact numeric `LibrarySchemaStep` sequence in `[Types]`. The database metadata records schema/reader compatibility, timestamps, active named backfills, and read gates. `upgradeLibrarySchema` performs only versionchange-transaction schema work; `runPendingBackfills` performs bounded, dependency-ordered, checkpointed transformations afterward.

```ts
export declare function runPendingBackfills(
  repository: CatalogAdminRepository,
  definitions: BackfillDefinition[],
  maintenance: ProfileMaintenanceInputFor<'post-open-backfill'>,
  signal?: AbortSignal,
): Promise<BackfillCheckpointRecord[]>
```

## Key functions

### `src/library/keys.ts`

```ts
export declare function providerAssetKey(
  profileId: ProfileId,
  section: LibrarySection,
  providerItemId: string,
): ProviderAssetKey
export declare function categoryKey(
  profileId: ProfileId,
  section: LibrarySection,
  providerCategoryId: string,
): CategoryKey
export declare function scopeKey(scope: CatalogScope): ScopeKey
export declare function createCanonicalTitleKey(random: CryptoRandomSource): CanonicalTitleKey
export declare function createPersonKey(random: CryptoRandomSource): PersonKey
export declare function createCanonicalEpisodeKey(
  seriesKey: CanonicalTitleKey,
  seasonNumber: number,
  episodeNumber: number,
): CanonicalEpisodeKey
export declare function metadataScopeKey(scope: MetadataScope): MetadataScopeKey
export declare function externalTitleIdIndexKey(
  metadataScope: MetadataScope,
  namespace: TitleExternalIdNamespace,
  value: string,
): TitleExternalIdPhysicalKey
export declare function externalPersonIdIndexKey(
  metadataScope: PublicMetadataScope,
  namespace: PersonExternalIdNamespace,
  value: string,
): PersonExternalIdPhysicalKey
export declare function externalEpisodeIdIndexKey(
  metadataScope: MetadataScope,
  namespace: EpisodeExternalIdNamespace,
  value: string,
): EpisodeExternalIdPhysicalKey
export declare function availabilityLinkKey(
  canonicalTitleKey: CanonicalTitleKey,
  providerAssetKey: ProviderAssetKey,
): string
export declare function creditKey(
  personKey: PersonKey,
  canonicalTitleKey: CanonicalTitleKey,
  roleDiscriminator: string,
): string
```

Inputs are escaped/encoded deterministically; display names are never identity keys.

### `src/library/safe-urls.ts`

```ts
export declare function parseProviderBaseUrl(
  raw: string,
  secrets: UrlSecretContext,
): ProviderBaseUrl
export declare function sanitizeArtworkUrl(
  raw: string | undefined,
  secrets: UrlSecretContext,
): DurableArtworkUrl | undefined
export declare function sanitizeDirectSourceUrl(
  raw: string | undefined,
  secrets: UrlSecretContext,
): DurableDirectSourceUrl | undefined
export declare function buildPlaybackUrl(
  access: EphemeralProviderAccess,
  asset: ProviderAssetRecord,
): EphemeralPlaybackUrl
export declare function disposePlaybackUrl(url: EphemeralPlaybackUrl): void
```

URL rules are centralized:

- use the platform `URL` parser; accept only `https`, or `http` where Gate 0 confirms provider compatibility;
- `ProviderBaseUrl` rejects userinfo, query, fragment, control characters, and path segments equal to the active username/password or their percent-encoded forms;
- durable artwork/direct-source constructors reject userinfo, query, fragment, token/signature/key/password parameter patterns, active credential equivalents, overlength values, and unsupported schemes;
- a rejected optional artwork/direct source becomes `undefined` and records only a safe aggregate rejection code;
- `buildPlaybackUrl` is the only playback URL constructor, combines ephemeral access with non-secret asset identifiers at playback time, and never returns its value to persistence, telemetry, diagnostics, cursors, cache keys, or Worker write batches;
- `disposePlaybackUrl` drops app references; profile switch, playback end, and cancellation invoke it.

## Provider capability functions

### `src/library/provider-capabilities.ts`

```ts
export declare function recordEndpointSuccess(
  record: ProviderCapabilityRecord,
  durationMs: number,
  now: number,
): ProviderCapabilityRecord
export declare function recordEndpointFailure(
  record: ProviderCapabilityRecord,
  code: SyncErrorCode,
  durationMs: number,
  now: number,
): ProviderCapabilityRecord
export declare function backoffDuration(consecutiveFailures: number): number
export declare function endpointIsEligible(record: ProviderCapabilityRecord, now: number): boolean
export declare function selectProviderMode(
  section: LibrarySection,
  capabilities: ProviderCapabilityRecord[],
  now: number,
): 'whole-library' | 'category-crawl'
```

Backoff must include jitter only if deterministic tests can inject randomness; otherwise use deterministic bounded intervals initially.

## Synchronization functions

### `src/library/sync-planner.ts`

```ts
export declare function planSync(input: SyncPlanningInput): SyncPlan
export declare function prioritizeSyncUnits(units: SyncUnit[], preferences: SyncPreferences): SyncUnit[]
```

### `src/library/sync-engine.ts`

```ts
export declare function startSync(
  input: StartSyncInput,
  runtime: SyncRuntime,
): Promise<SyncRunRecord>
export declare function resumeSync(
  input: ResumeSyncInput,
  runtime: SyncRuntime,
): Promise<SyncRunRecord>
export declare function pauseSync(
  profileId: ProfileId,
  runId: SyncRunId,
  lease: SyncLeaseGuard,
  reason: SyncControlReason,
  runtime: SyncRuntime,
): Promise<void>
export declare function cancelSync(
  profileId: ProfileId,
  runId: SyncRunId,
  lease: SyncLeaseGuard,
  reason: SyncControlReason,
  runtime: SyncRuntime,
): Promise<void>
export declare function processSyncUnit(
  unit: SyncUnit,
  context: SyncExecutionContext,
): Promise<SyncUnitResult>
export declare function finalizeSync(
  context: SyncExecutionContext,
): Promise<SyncRunRecord>
```

### Provider ingestion API in `src/xtream-client.ts`

Add an additive method or extracted adapter:

```ts
export declare function iterateStreams(
  section: LibrarySection,
  options: {
    categoryId?: string
    signal?: AbortSignal
    timeoutMs?: number
    batchSize: number
    onBatch(batch: StreamItem[], stats: ProviderReadStats): Promise<void> | void
  },
): Promise<ProviderReadSummary>
```

`ProviderReadSummary` must include the `ProviderCompletionProof` and a restart capability of `'unit-only'` unless a provider-specific adapter has proven pagination.

Requirements:

- reuse the incremental balanced-object parser;
- publish bounded batches and apply backpressure by awaiting `onBatch`;
- support match-all ingestion without collecting the whole array;
- honor cancellation;
- restart interrupted non-paginated responses from byte zero into a fresh revision;
- count harmless invalid records separately from coverage-affecting rejections;
- never seal authoritative coverage after timeout, cancellation, unclosed top-level syntax, decoder failure, or coverage-affecting rejection;
- emit request/parse/normalization telemetry;
- never log query URLs containing credentials.

## Normalization and fingerprints

### `src/library/normalization.ts`

```ts
export declare function normalizeProviderAsset(
  profileId: ProfileId,
  stream: StreamItem,
  context: NormalizationContext,
): ProviderAssetRecord

export declare function detectLanguageEvidence(input: LanguageDetectionInput): LanguageEvidence[]
export declare function detectMediaQuality(name: string): MediaQuality
export declare function contentFingerprint(asset: ProviderAssetRecord): string
```

## Coverage functions

### `src/library/coverage.ts`

```ts
export declare function coverageIsAuthoritative(
  coverage: CoverageRecord[],
  scope: CoverageQueryScope,
  now: number,
): boolean

export declare function summarizeCoverage(
  records: CoverageRecord[],
  scope: CoverageQueryScope,
): CoverageSummary

export declare function markUnitComplete(input: UnitCoverageCompleteInput): CoverageRecord
export declare function markUnitFailed(input: UnitCoverageFailureInput): CoverageRecord
export declare function markCoverageStale(
  current: CoverageRecord,
  staleAt: number,
): CoverageRecord
```

## Tombstone functions

### `src/library/tombstones.ts`

```ts
export declare function observeMissingAsset(
  input: ObserveMissingAssetInput,
): TombstoneCandidateRecord
export declare function confirmRemovalCandidate(
  input: ConfirmRemovalInput,
): TombstoneCandidateRecord
export declare function cancelRemovalCandidate(
  candidate: TombstoneCandidateRecord,
): null
export declare function eligibleTombstones(
  candidates: TombstoneCandidateRecord[],
  now: number,
): TombstoneCandidateRecord[]
export declare function applyConfirmedRemovals(
  input: ApplyRemovalInput,
  repository: CatalogWriteRepository,
): Promise<void>
```

No function may advance removals from a partial/failed sync.

## Repository functions

### `src/library/repository.ts`

`IndexedDbCatalogRepository` implements `CatalogRepository`, `CatalogWriteRepository`, and `CatalogAdminRepository`.

Write operations must:

- require and transactionally validate the complete current fenced profile lease guard;
- write only to a `writing` revision;
- validate completion proof before sealing;
- activate `ActiveSectionRecord` routing, coverage, revision metadata, and checkpoint in one transaction;
- make pruning prove that no `ActiveSectionRecord` references a revision.

Queries must:

- always include `profileId`;
- page results;
- avoid loading full libraries into the UI thread;
- return coverage alongside data;
- support abort signals where iteration may be long;
- keep canonical and provider identities separate.

## Search functions

### `src/library/search-document.ts`

```ts
export declare function buildSearchDocument(
  asset: ProviderAssetRecord,
): SearchDocumentRecord
```

### `src/library/search-index.ts`

```ts
export declare function createSearchIndex(
  profileId: ProfileId,
  limits: LocalSearchIndexLimits,
): LocalSearchIndex
export declare function searchPersistedDocuments(
  repository: CatalogRepository,
  request: CatalogSearchRequest,
  signal?: AbortSignal,
): Promise<CatalogSearchResponse>
export declare function rankSearchResult(
  document: SearchDocumentRecord,
  tokens: string[],
  preferences: SearchRankingPreferences,
): number
```

Load pages through an IndexedDB cursor, stop at explicit document/token/prefix/estimated-byte limits, and route overflow scope to paged persisted search. The initial implementation indexes tokens/prefixes/facets. A trigram implementation requires a later plan amendment and physical-device storage/memory evidence.

## Catalog service functions

### `src/library/catalog-service.ts`

```ts
export declare function createCatalogService(
  dependencies: CatalogServiceDependencies,
): CatalogService
export declare function listCategories(
  request: CategoryListRequest,
): Promise<CategoryListResponse>
export declare function listAssets(
  request: AssetListRequest,
): Promise<AssetListResponse>
export declare function search(
  request: CatalogSearchRequest,
): Promise<CatalogSearchResponse>
export declare function getTitleAvailability(
  profileId: ProfileId,
  canonicalTitleKey: CanonicalTitleKey,
  signal?: AbortSignal,
): Promise<AvailabilityChoice[]>
```

Routing:

- local complete/current → local authoritative;
- local partial → local plus bounded network fallback;
- no local coverage → network path;
- DB unavailable/corrupt → network path plus diagnostics;
- feature flag can force current network behavior.

## Identity and enrichment functions

### `src/library/identity/matcher.ts`

```ts
export declare function generateIdentityCandidates(
  asset: ProviderAssetRecord,
  providerExternalIds: ProviderTitleExternalIdEvidence[],
  canonicalRecords: CanonicalTitleRecord[],
  policyVersion: number,
): IdentityCandidateRecord[]

export declare function resolveIdentityCandidate(
  candidate: IdentityCandidateRecord,
  overrides: IdentityOverrideRecord[],
): AvailabilityLinkRecord

export declare function applyProfileCanonicalMerge(
  maintenance: ProfileMaintenanceInputFor<'identity-write'>,
  repository: CatalogMaintenanceRepository,
  from: CanonicalTitleKey,
  to: CanonicalTitleKey,
  override: IdentityOverrideRecord,
): Promise<void>

export declare function applyProfileCanonicalSplit(
  maintenance: ProfileMaintenanceInputFor<'identity-write'>,
  repository: CatalogMaintenanceRepository,
  source: CanonicalTitleKey,
  assetKeys: ProviderAssetKey[],
  override: IdentityOverrideRecord,
): Promise<CanonicalTitleKey>

export declare function convergePublicCanonicalTitles(
  maintenance: PublicMetadataMaintenanceInputFor<'identity-write'>,
  repository: CatalogMaintenanceRepository,
  from: CanonicalTitleKey,
  to: CanonicalTitleKey,
  evidence: PublicCanonicalConvergenceEvidence,
): Promise<CanonicalRedirectRecord>
```

Profile merge/split changes only that profile's candidates, availability, private aliases, search projection, and override view; it creates no global redirect and cannot affect another profile. Public convergence is separate and allowed only for public canonical records with matching authoritative external IDs; it redirects public references transactionally and preserves the old public key. Neither operation rewrites public external IDs without collision validation. Manual overrides are never discarded by automated backfill.

### `src/library/identity/availability.ts`

```ts
export declare function availabilityChoices(
  profileId: ProfileId,
  canonicalTitleKey: CanonicalTitleKey,
  preferences?: LibraryPreferenceSettings,
): Promise<AvailabilityChoice[]>

export declare function remapDetachedAsset(
  maintenance: ProfileMaintenanceInputFor<'projection-write'>,
  repository: CatalogMaintenanceRepository,
  detachedAssetKey: ProviderAssetKey,
  replacementAssetKey: ProviderAssetKey,
  confirmedByUser: boolean,
): Promise<void>
```

Choice order is manual preferred, deterministic Phase 4 preference score, provider order, then `ProviderAssetKey`. Direct play requires exactly one confirmed playable choice. Remapping protected source state requires explicit user confirmation.

### Enrichment queue

```ts
export declare function enqueueEnrichment(
  maintenance: ProfileMaintenanceInputFor<'enrichment-write'>,
  repository: CatalogMaintenanceRepository,
  job: EnrichmentJobRecord,
): Promise<void>
export declare function runEnrichmentQueue(
  profileMaintenance: ProfileMaintenanceInputFor<'enrichment-write'>,
  publicMaintenance: PublicMetadataMaintenanceInputFor<'enrichment-write'>,
  repository: CatalogMaintenanceRepository,
  adminRepository: CatalogAdminRepository,
  budget: EnrichmentBudget,
  signal: AbortSignal,
): Promise<EnrichmentQueueReport>
```

The initial budget is fixed at two concurrent requests, 50 requests per foreground session, three attempts, one-second exponential base backoff capped at one minute, and a seven-day successful metadata TTL. A Gate 3 status decision may lower these limits for provider/API constraints but cannot authorize bulk private-catalog upload. Each bounded queue iteration claims/updates the profile-scoped job only under `profileMaintenance`, performs network work outside an IndexedDB transaction, and writes shared public records only under `publicMaintenance`; it never opens a transaction spanning both scopes. A dual-scope workflow acquires the global public lease before its profile lease, never waits for the public lease while holding a profile lease, and releases in reverse order, preventing cross-profile lock-order deadlock. Renewals return replacement guards used by later batches. Phase 3A builds canonical title/alias search projections; Phase 3B builds public-only person/alias projections and joins public credits to confirmed profile availability without mutating provider revision search documents.

## Phase 4 preference, user-state, and collection functions

### `src/library/preferences.ts`

```ts
export declare function migrateLibraryPreferences(input: unknown): LibraryPreferenceSettings
export declare function saveProfileEvidenceOverride(
  maintenance: ProfileMaintenanceInputFor<'evidence-write'>,
  repository: CatalogMaintenanceRepository,
  record: ProfileEvidenceOverrideRecord,
): Promise<void>
export declare function deleteProfileEvidenceOverride(
  maintenance: ProfileMaintenanceInputFor<'evidence-write'>,
  repository: CatalogMaintenanceRepository,
  identitySubjectKey: ProviderIdentitySubjectKey,
  kind: ProfileEvidenceKind,
): Promise<void>
export declare function saveProfilePolicyState(
  maintenance: ProfileMaintenanceInputFor<'policy-write'>,
  repository: CatalogMaintenanceRepository,
  record: ProfilePolicyStateRecord,
): Promise<void>
export declare function rankAvailabilityChoice(
  choice: AvailabilityChoice,
  asset: ProviderAssetRecord,
  settings: LibraryPreferenceSettings,
): PreferenceScore
export declare function selectPreferredVersion(
  choices: AvailabilityChoice[],
  settings: LibraryPreferenceSettings,
): AvailabilityChoice | null
```

`selectPreferredVersion` returns `null` when `versionMode='ask'`, evidence is tied/insufficient, or no confirmed playable choice exists.

### `src/library/parental-policy.ts`

```ts
export declare function evaluateParentalVisibility(
  adultEvidence: AdultEvidence[],
  ratings: RatingEvidence[],
  settings: ParentalSettings,
  sessionUnlock: ParentalSessionUnlock | null,
): ParentalDecision

export declare function createPinVerifier(pin: string, random: CryptoRandomSource): Promise<PinVerifier>
export declare function verifyPin(pin: string, verifier: PinVerifier): Promise<boolean>
```

`ParentalDecision` is checked before rendering metadata, counts, focusable elements, collection membership, existing metadata recommendation cards, availability choices, and deep-link playback—not only after opening details.

### `src/library/user-state-projection.ts`

```ts
export declare function projectUserState(
  maintenance: ProfileMaintenanceInputFor<'projection-write'>,
  repository: CatalogMaintenanceRepository,
  sourceSnapshot: UserStateSourceSnapshot,
): Promise<UserStateProjectionReport>

export declare function rebuildUserStateProjection(
  maintenance: ProfileMaintenanceInputFor<'projection-write'>,
  repository: CatalogMaintenanceRepository,
): Promise<UserStateProjectionReport>
```

Projection is idempotent and read-only with respect to `localStorage`. Source fingerprints before and after must match. On mismatch or write failure, abort the projection and leave the previous projection active. Projection writes require a `projection-write` maintenance lease and atomically replace only the profile's projection rows.

### `src/library/version-groups.ts`

```ts
export declare function buildVersionGroup(
  profileId: ProfileId,
  canonicalTitleKey: CanonicalTitleKey,
  links: AvailabilityLinkRecord[],
  assets: ProviderAssetRecord[],
  settings: LibraryPreferenceSettings,
): VersionGroupRecord

export declare function chooseVersion(
  group: VersionGroupRecord,
  settings: LibraryPreferenceSettings,
): AvailabilityChoice[]
export declare function saveVersionGroup(
  maintenance: ProfileMaintenanceInputFor<'policy-write'>,
  repository: CatalogMaintenanceRepository,
  record: VersionGroupRecord,
): Promise<void>
```

### `src/library/collections.ts`

```ts
export declare function saveCollection(
  maintenance: ProfileMaintenanceInputFor<'collection-write'>,
  repository: CatalogMaintenanceRepository,
  record: SavedCollectionRecord,
): Promise<void>
export declare function deleteCollection(
  maintenance: ProfileMaintenanceInputFor<'collection-write'>,
  repository: CatalogMaintenanceRepository,
  id: string,
): Promise<void>
export declare function evaluateSavedCollection(
  profileId: ProfileId,
  id: string,
  page: PageRequest,
  signal?: AbortSignal,
): Promise<CatalogSearchResponse>
export declare function evaluateDynamicCollection(
  definition: DynamicCollectionDefinition,
  page: PageRequest,
  signal?: AbortSignal,
): Promise<CatalogSearchResponse>
export declare function acknowledgeCollection(
  maintenance: ProfileMaintenanceInputFor<'collection-write'>,
  repository: CatalogMaintenanceRepository,
  collectionId: string,
  through: number,
): Promise<void>
```

Saved definitions are revalidated against the current schema. Unsupported or removed filters produce an explicit issue and migration prompt; they are not ignored. Save/delete/acknowledge operations require a `collection-write` maintenance lease; evaluation is read-only.

### `src/library/episodes.ts`

```ts
export declare function upsertProfileCanonicalEpisodes(
  maintenance: ProfileMaintenanceInputFor<'episode-write'>,
  repository: CatalogMaintenanceRepository,
  episodes: CanonicalEpisodeRecord[],
  mappings: EpisodeExternalIdMappingRecord[],
): Promise<void>
export declare function upsertPublicCanonicalEpisodes(
  maintenance: PublicMetadataMaintenanceInputFor<'episode-write'>,
  repository: CatalogMaintenanceRepository,
  episodes: CanonicalEpisodeRecord[],
  mappings: EpisodeExternalIdMappingRecord[],
): Promise<void>
export declare function upsertEpisodeObservations(
  maintenance: ProfileMaintenanceInputFor<'episode-write'>,
  repository: CatalogMaintenanceRepository,
  observations: EpisodeObservationRecord[],
): Promise<void>
export declare function retireEpisodeObservations(
  maintenance: ProfileMaintenanceInputFor<'episode-write'>,
  repository: CatalogMaintenanceRepository,
  observationKeys: EpisodeObservationKey[],
): Promise<void>
```

Episode writes are bounded and idempotent. Profile canonical rows/mappings must match the input profile lease; public canonical rows/mappings require the global public lease. Constructors and repository validation enforce that an episode and every mapping have the same metadata scope as the canonical series. Observations are always profile-scoped, may link only stable canonical episode identities visible to that profile, and uncertain episodes remain unlinked and cannot advance a collection acknowledgement.

### `src/library/diagnostics.ts`

```ts
export declare function captureCatalogDiagnostics(
  maintenance: ProfileMaintenanceInputFor<'diagnostics-write'>,
  repository: CatalogMaintenanceRepository,
): Promise<CatalogDiagnosticSnapshot>
export declare function exportSanitizedDiagnostics(
  snapshot: CatalogDiagnosticSnapshot,
): Promise<string>
export declare function pruneDiagnostics(
  maintenance: ProfileMaintenanceInputFor<'retention-prune'>,
  repository: CatalogMaintenanceRepository,
  retentionDays: number,
): Promise<number>
```

## Modified existing functions

### `src/main.ts`

- `activateProfile()`
  - Open profile repository.
  - Start/resume shadow sync after Home renders.
  - Never block activation on DB/sync.
- `beginPlayback()`
  - Pause worker/cooperative sync before player setup.
- `openSection()`
  - Phase 2: use `CatalogService.listCategories()`.
- `loadCategory()`
  - Phase 2: use `CatalogService.listAssets()`.
- `runGlobalSearch()`
  - Phase 2: use `CatalogService.search()`, render source/coverage status, preserve cancellation.
- `localStreamForCredit()`
  - Phase 3: replace bounded `knownStreams` lookup with canonical availability lookup.
- `openFilmographyTitle()`
  - Handle direct availability, multiple versions, ambiguity, and unavailable state.
- `saveCurrentSettings()`
  - Phase 4: invalidate only affected derived indexes/coverage, not the full catalog unnecessarily.
- `pagehide` listener
  - Pause/checkpoint sync before disabling traces.
- `visibilitychange` listener
  - Pause heavy sync when hidden; resume according to lifecycle policy.
- `renderGlobalSearch()` / search status rendering
  - Show complete/partial/stale/local/network state without exposing implementation jargon.

### `src/metadata-client.ts`

- `readIdentifier()`
  - Preserve namespace/source.
- `titleFromPayload()`
  - Produce namespaced canonical candidates.
- `personFromPayload()`
  - Produce namespaced person identity.

### `src/storage.ts`

- Keep profile credentials, settings, favorites, and resume state in the current storage during initial phases.
- Add settings migration only in Phase 4.
- Do not silently migrate credentials into IndexedDB.

## Removed functions

No functions are removed in Phases 0–2.

After stable local-first acceptance, obsolete in-memory complete-catalog functions may be removed in a dedicated cleanup phase:

- `completeSearchCatalogItemCount`
- `pruneExpiredCompleteSearchCatalogs`
- `cachedCompleteSearchCatalog`
- `clearCompleteSearchCatalogs`
- `pauseCompleteSearchCatalogWarming`
- `loadCompleteSearchCatalog`
- `warmCompleteSearchCatalog`

Migration strategy:

- retain feature-flagged network fallback;
- remove only after local-first rollback tests pass;
- document removal and replacement in `LIBRARY_ENGINE_STATUS.md`.

[Classes]

Add focused database, repository, synchronization, and controller classes while retaining `XtreamClient` as the provider transport and avoiding unnecessary inheritance.

## New classes

### `IndexedDbCatalogRepository`

Path: `src/library/repository.ts`

Responsibilities:

- implement `CatalogRepository`, `CatalogWriteRepository`, and `CatalogAdminRepository`;
- profile-isolated reads/writes and single-writer lease enforcement;
- coverage-aware queries;
- transactional category activation;
- paged search-document reads;
- storage pruning;
- recovery helpers.

Key methods are the `CatalogRepository` contract plus internal transaction/index helpers.

No inheritance is required beyond interface implementation.

### `LibrarySyncEngine`

Path: `src/library/sync-engine.ts`

Responsibilities:

- runner-independent sync state machine;
- create/resume/checkpoint/finalize runs;
- process one sync unit at a time;
- provider capability updates;
- staged/active activation;
- deletion-candidate policy;
- emit progress through injected callbacks.

Dependencies are injected:

```ts
export declare class LibrarySyncEngine {
  constructor(
    repository: CatalogRepository & CatalogWriteRepository,
    provider: CatalogProviderAdapter,
    clock: Clock,
    telemetry: LibraryTelemetry,
  )
}
```

### `LibrarySyncController`

Path: `src/library/sync-controller.ts`

Responsibilities:

- choose Worker or cooperative runner from capability decision;
- start daily/initial/manual sync;
- pass active credentials ephemerally;
- pause/cancel on playback, profile switch, pagehide, and settings changes;
- surface progress/coverage to `main.ts`;
- acquire/renew/release the profile lease;
- restart only from persisted sealed/activated unit checkpoints;
- abandon incomplete non-paginated writing revisions on recovery.

### `CatalogService`

Path: `src/library/catalog-service.ts`

Responsibilities:

- stable read API for UI;
- feature-flag routing;
- coverage-aware local/network/hybrid reads;
- result deduplication;
- rollback to current network path;
- availability lookup.

### `LocalSearchIndex`

Path: `src/library/search-index.ts`

Responsibilities:

- bounded token/prefix/facet maps for the active profile;
- cursor/page-based loading with explicit document/token/prefix/estimated-byte limits;
- persisted-search fallback when in-memory limits are reached;
- incremental document updates;
- query ranking/filtering;
- expose approximate memory metrics;
- release memory on profile switch/playback pressure if policy requires it.

Implement it as a concrete class satisfying `LocalSearchIndex`; `createSearchIndex` is the only construction boundary. No alternative factory-returned internal representation is left for a phase session to redesign.

### `IdentityResolver`

Path: `src/library/identity/matcher.ts`

Responsibilities:

- generate candidates;
- calculate deterministic confidence;
- honor manual overrides/rejections;
- never auto-confirm below policy threshold;
- return evidence suitable for diagnostics.

## Modified classes

### `XtreamClient`

Path: `src/xtream-client.ts`

Add additive batched ingestion support and preserve existing methods:

- `validate`
- `categories`
- `streams`
- `searchStreams`
- metadata/detail/EPG/playback URL methods.

Do not make `XtreamClient` responsible for IndexedDB, sync state, canonical identity, or UI coverage.

### `PerformanceTrace`

Path: `src/performance-trace.ts`

Add bounded Library Engine trace event support without storing:

- credentials;
- provider URLs;
- title/person/search text;
- raw catalog payloads.

## Removed classes

No classes are removed in the planned phases.

`SearchCatalogWarmQueue` may become unused after Phase 2 parity, but removal requires an explicit cleanup task and rollback evidence.

[Dependencies]

Prefer browser standards and small internal abstractions; add a test-only IndexedDB implementation only if it materially improves deterministic coverage.

## Runtime dependencies

Initial recommendation: add no database wrapper dependency.

Use native:

- `indexedDB`;
- `IDBDatabase`;
- `Worker`;
- `AbortController`;
- `TextDecoder`;
- `navigator.storage` through feature detection.

Reasons:

- unknown old-webOS compatibility is easier to diagnose without a wrapper;
- schema/transaction behavior remains explicit;
- bundle size stays controlled;
- custom fallback behavior is required regardless.

A later plan amendment may adopt a tiny wrapper only after Phase 0 if native boilerplate impedes correctness and the wrapper’s transpiled output is verified on webOS.

## Test dependencies

Recommended:

- `fake-indexeddb` as a pinned development dependency for repository/schema tests.

Requirements:

- do not treat fake IndexedDB as proof of webOS compatibility;
- physical device Gate 0 remains mandatory;
- pin the exact package version in `package-lock.json`.

Worker messaging can be tested through injected worker ports/fakes without adding a heavy Worker framework.

## Build configuration

Preserve the current application build: `src/main.ts` remains the single ES2015 IIFE entry producing `webos-app/app.js`, and packaged `public/index.html` remains a classic-script document.

Build each classic Worker through a separate Vite configuration/build step:

- `target: 'es2015'`;
- IIFE output with no code splitting, imports, or dynamic imports;
- deterministic Phase 0 output `webos-app/library-capability-worker.js`;
- `emptyOutDir: false` so the application bundle remains present;
- build failure propagated through `npm run build`;
- no second input added to the existing multi-entry-incompatible IIFE library build;
- no module Worker, Blob/data URL, or hashed runtime filename.

Construct the packaged probe Worker using:

```ts
const url = new URL('./library-capability-worker.js', document.baseURI)
const worker = new Worker(url.href)
```

The physical probe, not desktop Vite development, decides whether that packaged `file://` URL works. Build info records:

- `libraryCapabilityProbeAvailable`;
- `libraryWorkerIncluded`;
- `librarySchemaVersion`.

Do not switch the main application to module scripts without a separate compatibility decision.

## TypeScript configuration

`tsconfig.json` must include Worker typings without breaking DOM typing.

Possible approaches:

- worker files include `/// <reference lib="webworker" />`; or
- use a dedicated `tsconfig.worker.json`.

Avoid globally mixing conflicting DOM and WebWorker declarations if it causes duplicate globals.

`erasableSyntaxOnly` remains enabled; avoid constructor parameter properties and runtime enums.

## Optional future dependencies

Not approved during current phases:

- full-text search libraries;
- Dexie/idb wrappers;
- artwork caching libraries;
- webOS service SDK packages;
- server/database dependencies for Nova Hub.

Each requires a measured justification and plan amendment.

## External services and enrichment budget

- IPTV provider remains the private replication/playback source.
- Existing metadata Worker remains the bounded metadata enrichment boundary.
- Do not send IPTV credentials or full catalogs to the metadata Worker.
- TMDB/TVmaze/Trakt identities must be explicitly namespaced.
- Metadata enrichment is demand-driven, not an automatic full-catalog sweep.
- Initial priorities are opened details, favorites/resume titles, visible Known For entries, and explicit identity ambiguities.
- Each enrichment queue has a concurrency limit, per-session/request budget, retry/backoff, cache TTL, cancellation, and safe minimal outbound-field policy.
- Aggregate telemetry may record counts/timings/error codes, never private title/person/query text.
- Optional Nova Hub is a separate opt-in local-network architecture, not a hidden dependency.

[Testing]

Use layered unit, integration, fault-injection, parity, build, package, emulator, and physical-TV validation with phase-specific acceptance reports.

## Common future-session protocol

Every phase prompt inherits these requirements even when its short prompt does not repeat them:

1. Read the canonical plan and all prior entries in `LIBRARY_ENGINE_STATUS.md`.
2. Confirm the prerequisite phase/gate is explicitly accepted and the selected runner/schema version is recorded.
3. Record exact `HEAD`, branch/upstream, dirty-tree inventory, tool versions, and the files intentionally in scope.
4. Use `npm ci` when dependencies are not already installed from the accepted lockfile.
5. Run baseline tests/build before edits and append a dated “phase started” entry.
6. Implement only the named phase; unapproved later-phase work is a failure.
7. Run automated, packaging, and physical-device verification required for that phase.
8. Exercise and record the rollback procedure.
9. Append commands, sample sizes, p50/p95 metrics, deviations, risks, privacy review, and acceptance decision.
10. Stop at the phase gate. A later phase requires a separate session and explicit acceptance.

A phase must not rewrite prior status evidence; corrections are appended and linked to the superseded entry.

## Baseline commands

Every implementation phase runs before and after its edits:

```cmd
rtk npm test
rtk npm run build
rtk git diff --check
```

Packaging/device phases also run:

```cmd
rtk npm run package:webos
rtk ares-install -d lg-oled-g1 packages\com.arash.novaplay_1.0.3_all.ipk
rtk ares-launch -d lg-oled-g1 com.arash.novaplay
rtk ares-inspect -d lg-oled-g1 com.arash.novaplay
```

The existing non-blocking Dash.js CommonJS-in-ESM warning should be documented but is not a Library Engine failure.

## Phase 0 capability tests

Automated:

- probe schema creation and deletion;
- batched writes at representative sizes;
- indexed lookup and cursor iteration;
- cancellation during a batch;
- aborted transaction recovery;
- deterministic recommendation selection;
- cleanup after success/failure.

Physical OLED G1:

1. Build/package with the separate classic probe Worker enabled; inspect the package to confirm the deterministic asset exists and has no ESM imports.
2. Resolve `new URL('./library-capability-worker.js', document.baseURI)` under packaged `file://`.
3. Record Worker startup, startup-error, and round-trip messaging independently.
4. Run main-thread IndexedDB CRUD, compound-key/index queries, and cursors.
5. Test main-thread fetch and Worker fetch separately. Provider-boundary Worker fetch is mandatory before recommending a Worker runner; credentials must not be logged.
6. Test IndexedDB in Worker.
7. Test bounded Worker-to-main batches and cooperative-main slices even if Worker IndexedDB succeeds, so fallback evidence is available.
8. Write/read:
   - 10,000 compact records;
   - 50,000 compact records;
   - 100,000 compact records if prior tiers remain stable.
9. Measure batch sizes such as 100, 250, 500, and 1,000.
10. Measure indexed exact/prefix-like lookup and full cursor scan.
11. Write a random non-sensitive persistence marker, record its hash/count, fully close the app, relaunch it, and verify the same marker before any rewrite.
12. Abort during a write batch, terminate the Worker, reopen the DB, and verify transaction atomicity plus continued CRUD.
13. Start every viable runner then start playback; record cancellation p50/p95 and playback-startup delta against an idle baseline.
14. Capture quota/usage/persistence APIs where available.
15. Delete the disposable DB, verify deletion, and build/package once with normal probe exposure disabled.
16. Save only a sanitized summarized report and deterministic runner decision in `LIBRARY_ENGINE_STATUS.md`.

Gate 0 failure behavior:

- worker-side IndexedDB failure → try Worker parsing + main-thread DB writes;
- Worker failure → cooperative main-thread runner;
- IndexedDB persistence/stability failure → stop; do not implement durable local-first catalog on this target without a companion backend.

## Schema/repository tests

Use `fake-indexeddb` plus explicit fault injection:

- fresh DB creation;
- every schema migration, aborted upgrade, blocked-version handling, and post-open resumable backfill;
- successful incompatible upgrade followed by controlled rebuild/rollback behavior;
- profile isolation;
- compound/indexed query correctness;
- transaction abort;
- quota-like write rejection;
- `ActiveSectionRecord`/revision atomicity before, during, and after activation;
- two-controller lease exclusion, expiry, and takeover;
- abandoned writing revision recovery and unreferenced superseded-revision pruning;
- active revision never pruned during quota recovery;
- profile deletion;
- rebuildable-store pruning;
- user-state stores untouched.

## Sync engine tests

- healthy whole-library plan;
- whole-library timeout → capability backoff → category crawl;
- category timeout and later retry;
- duplicate category records;
- malformed provider records classified as harmless invalid versus coverage-affecting rejection;
- transport EOF, decoder flush, top-level closure, timeout, and cancellation completion-proof permutations;
- non-paginated interruption restarts from byte zero and never resumes from `processedRecords`;
- app cancellation;
- playback cancellation;
- crash between write and activation;
- crash after activation before checkpoint;
- resume from checkpoint;
- exact unchanged record fingerprint;
- additions/updates;
- incomplete sync cannot delete;
- category absence or category move does not create a provider-level tombstone;
- complete comparable section pass creates a tombstone candidate;
- later comparable complete section pass plus grace confirms deletion;
- reappearance cancels deletion;
- oversized catalog remains durable without full RAM materialization;
- credentials absent from persistent records and traces;
- provider URL constructors reject userinfo/query/fragment, active credential equivalents, signed/tokenized URLs, unsupported schemes, and overlength values;
- optional unsafe artwork/direct sources become absent without exposing the rejected value;
- playback URLs are produced only at playback time and are absent from IndexedDB, Worker write batches, telemetry, errors, cursors, diagnostics, and caches;
- Worker batches at and over every record/byte/string/array limit are accepted or rejected atomically, with locally recomputed size and no checkpoint/coverage advance on rejection;
- telemetry/error allowlists reject unknown event fields, raw exception strings, stacks, causes, request objects, and URLs.

## Coverage and hybrid-read tests

- no coverage;
- partial category coverage;
- complete category coverage;
- complete section coverage;
- complete-but-stale coverage after a failed refresh;
- failed attempt does not erase prior completeness/active revision;
- section completeness requires every expected category scope;
- empty authoritative local result;
- empty non-authoritative partial result;
- local/network merge;
- duplicate suppression;
- cancellation;
- profile switch during query;
- DB failure fallback.

## Search tests

- accent folding parity with current `foldText`;
- multi-token order-independent matching;
- exact title and alias ranking;
- prefix behavior;
- Phase 2B provider title/alias tokens;
- Phase 3A canonical title/alias projections;
- Phase 3B actor/director person/credit tokens joined through confirmed profile availability;
- language/country/genre/year/quality facets;
- adult filtering;
- unknown-language handling;
- result cap/paging;
- cursor/page-based index loading without a full documents array;
- explicit document/token/prefix/estimated-byte limits;
- overflow falls back to persisted search without dropping authoritative results;
- index incremental update and release on profile switch;
- approximate memory metric and p50/p95 query/load timings;
- 10k/50k/100k document benchmarks on target hardware;
- no trigram index unless a later acceptance report approves it.

## Identity tests

- opaque canonical/person ID stability while external IDs are added or merged;
- title/person namespace type separation;
- profile-scoped provider aliases do not leak into another profile's shared canonical metadata;
- namespaced external-ID index construction;
- TMDB movie versus TV collision prevention;
- TMDB versus TVmaze collision prevention;
- provider external-ID auto-confirmation;
- exact title/year confidence;
- original-title/year confidence;
- ambiguous remake handling;
- same title/different year;
- language variants;
- quality duplicates;
- manual confirm/reject persistence;
- provider asset ID replacement;
- multiple availability choices;
- unavailable title;
- Known For navigation opens the correct provider asset;
- ambiguous match opens a chooser, never an arbitrary title.

## Phase 4 policy and collection tests

- migrate every historical `AppSettings` shape while preserving unrelated playback fields;
- successful plaintext-PIN migration creates a PBKDF2 verifier and removes plaintext only after readback validation;
- PIN migration failure restores the byte-equivalent prior settings value;
- language evidence conflicts, unknown policy, manual override, and deterministic preference tie-breaks;
- original/dubbed/subtitled and quality-version grouping;
- unavailable preferred version falls back to chooser, never arbitrary direct play;
- adult/rating evidence provenance and manual precedence;
- adult/rating enforcement at category, browse, search, detail, collection, existing metadata recommendation-card, choice, deep-link, and playback boundaries;
- session unlock expiry/profile switch and no PIN/verifier leakage;
- user-state projection source fingerprints remain unchanged on success, abort, quota failure, and DB rebuild;
- every favorite/resume record projects exactly once; detached/remapped lifecycle;
- saved collection profile isolation, migration, relaunch, invalid filter, and deletion;
- deterministic facet counts, sorting, paging, and count relation;
- recently-added does not reset on refresh;
- new-episode identity, first-seen, acknowledgement, detached, and unknown-identity exclusion;
- diagnostics redaction, retention, quota fields, and sanitized export;
- Phase 4 rollback preserves settings, source user state, identity overrides, and rebuildable records.

## UI and remote tests

- Home renders before sync starts;
- search works during sync;
- partial/stale/local/network labels;
- sync progress does not steal focus;
- D-pad navigation through filters;
- version chooser;
- Back behavior;
- profile switch;
- adult setting changes;
- playback cancels sync;
- app hidden/visible lifecycle;
- provider unavailable with local catalog present;
- DB unavailable falls back to network;
- storage-full diagnostics;
- filter sheet, collection, version chooser, diagnostics, PIN, empty/error, and detached-item focus paths;
- focus restoration after closing every Phase 4 overlay;
- no protected title/image/metadata is rendered or focusable before authorization;
- 1920x1080 safe-area and overscan verification for all Phase 4 views.

## Performance acceptance

Track:

- app startup to stable Home;
- sync queue wait/duration;
- records/sec;
- transaction duration;
- worker message overhead;
- main-thread long tasks;
- frame gaps;
- local search duration;
- index build time;
- heap before/after active search index;
- IndexedDB usage;
- cancellation latency;
- playback startup while sync was pending.

Initial targets are provisional and must be tuned from Phase 0:

- no new main-thread task over 50 ms attributable to ingestion;
- playback cancellation acknowledged within 250 ms where platform scheduling permits;
- Home never waits for sync;
- local common-query search target under 100 ms on OLED G1;
- no unbounded in-memory full catalog;
- zero credential/raw-title leakage in exported traces.

## Shadow parity tests

For sampled queries/categories:

- compare provider IDs from current path against local active coverage;
- classify differences as partial coverage, provider mutation, parser difference, or bug;
- never log title text in general telemetry;
- retain a local developer-only diagnostic mode for detailed comparison;
- require documented parity acceptance before Phase 2.

## Rollback tests

At each cutover phase:

- disable Library Engine feature flag;
- verify current provider browse/search remains operational;
- corrupt/delete the local DB;
- verify controlled rebuild or network fallback;
- ensure user favorites/resume remain intact.

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
