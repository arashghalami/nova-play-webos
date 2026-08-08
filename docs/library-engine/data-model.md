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

