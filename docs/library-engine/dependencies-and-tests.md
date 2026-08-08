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

