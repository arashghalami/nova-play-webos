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

