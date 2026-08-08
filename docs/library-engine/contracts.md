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

