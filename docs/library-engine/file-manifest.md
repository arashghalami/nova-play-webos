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

