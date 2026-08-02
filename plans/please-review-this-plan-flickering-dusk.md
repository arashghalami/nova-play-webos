# Nova Play — local-first catalog plan (reviewed and amended)

## Context

Goal: the catalog is downloaded, normalized, stored locally, and reused. Browse and search must not contact
the provider on every action. Development must stop generating provider traffic.

This document reviews and amends the user's local-first plan. The plan's direction is right and most of it
should be executed as written. Three corrections matter more than anything else in it, because the plan was
written against a stale view of the repository and one of its instructions is actively dangerous.

Verified state: `HEAD = fccb4f2`, working tree effectively clean (`src/main.ts` shows `M` but
`git diff src/main.ts` is **empty** — the flag is CRLF normalization only).

---

## 1. Ground-truth corrections — read before executing anything

### 1.1 There is no uncommitted experiment to revert

Plan item: *"Revert the uncommitted targeted-category experiment."*

There is no uncommitted change. `git diff src/main.ts` returns nothing. Everything was committed:

- `ab3415e` — committed the previously dirty tree, including `src/provider-error.ts`
- `fccb4f2` — *"fix: guard global search provider traffic"*, adding `src/provider-search-guard.ts`

**Do not run `git revert fccb4f2`, and do not instruct an agent to "revert the experiment".** That commit is
what removed the ban amplification. Reverting it would restore every one of the following:

| `fccb4f2` removed | Reverting would restore |
| --- | --- |
| The 12-category-per-section crawl, plus `categorySearchScore` and `boundedEditDistance` | The 39-requests-per-refusal amplification loop |
| `SEARCH_DEBOUNCE_MS` and keystroke-triggered provider search | Provider requests while typing |
| `warmCompleteSearchCatalog` | The whole-library warm trigger |
| — | It would also delete `provider-search-guard.ts` |

All removals from here must be **forward-only edits**, never a git revert.

### 1.2 Most of plan section 1 is already done

`fccb4f2` already delivered:

- Typing is purely local via `localGlobalSearchMatches`; global search is **submit-triggered** only.
- `MIN_GLOBAL_SEARCH_LENGTH` raised 1 → 2.
- The category crawl is deleted outright — not gated, gone.
- Warming trigger deleted.
- Refusal detection wired to `providerSearchBlock` with a cooldown, and a per-query
  `globalSearchRetryAfterByQuery` cooldown.
- Split timeouts: `GLOBAL_SEARCH_RESPONSE_TIMEOUT_MS` (10 s, headers) and `GLOBAL_SEARCH_SCAN_TIMEOUT_MS`
  (45 s, scan). This is why the emulator showed *"never produced response headers, aborted by the timeout"* —
  the new response deadline fired correctly.

So *"disable provider-backed global search"* is now a small, precise edit: in `searchGlobalSection`, delete the
`activeClient.searchStreams(...)` call (`main.ts:5389`) and its try/catch, and return the local result set.
Nothing else in that function contacts the provider.

Provider search is confirmed submit-only: `runGlobalSearch` has exactly two invocation sites — the `Search`
button action (`main.ts:4481`) and Enter on `#global-search-input` (`main.ts:6872`). The `input` listener leads
to `scheduleGlobalSearch`, which despite its name schedules nothing, has no timer, and issues no request.

### 1.4 Catalog warming is already fully inert, not merely inefficient

`completeSearchCatalogQueue.request()` is **never called anywhere** — `fccb4f2` deleted
`warmCompleteSearchCatalog`, its only caller. Consequences:

- `loadCompleteSearchCatalog` (`main.ts:951`) is unreachable; it is only wired as the queue's `load:` option.
- The two `XtreamClient` calls inside it — `categories` (`main.ts:968`) and `searchStreams` (`main.ts:980`) —
  are therefore **already dead**, so the live provider surface is smaller than the raw call-site count suggests.
- `completeSearchCatalogs` is permanently empty, so `cachedCompleteSearchCatalog` always returns `null` and the
  `if (completeCatalog)` branch in `searchGlobalSection` (`main.ts:5359-5382`) is dead.

Removing warming is therefore **pure dead-code deletion with no behavioural change**. Live remnants to clean
up: `clearCompleteSearchCatalogs` (called at `4744`, `6238`, `6273`), `pauseCompleteSearchCatalogWarming`
(called at `4600`, `5778`, `7232`), the permanently-`null` read at `5357`, the
`SearchCatalogWarmQueue` import/instantiation (`main.ts:66`, `492`), and the four
`COMPLETE_SEARCH_CATALOG_*` constants (`main.ts:214-217`).

Note: if `search-catalog-queue.ts` is deleted, its 4 passing tests go with it. Keep the module if it is wanted
as the pacing primitive for the sync engine (§5) — it serializes correctly, it simply has no rate limiting.

### 1.5 `sectionCategories` is write-only — a free request saving

`sectionCategories` is populated by `rememberCategories` but its **only read** is inside the unreachable
`loadCompleteSearchCatalog`. So `openSection` fetches the category list on *every* navigation into
Live/Movies/Series and never consults the cache it just filled. Making `openSection` (`main.ts:4815`) read
`sectionCategories` first is a small, immediate reduction, independent of any IndexedDB work.

`adultCategoryIds` is populated by the same `rememberCategories` and **is** live (`isAdultStream`,
`searchGlobalSection`), so `rememberCategories` must be kept.

### 1.3 An earlier diagnosis of mine is obsolete

I previously reported that one typed character fired three concurrent whole-library requests. That was true of
the code at `e22a2d9`, and `fccb4f2` fixed it. Your emulator observation — typing produced zero requests,
submitting produced one — is correct and supersedes my claim. The remaining provider traffic on search is one
whole-section request per uncovered section on submit.

---

## 2. Amendments to the plan

### 2.1 The daily budget has no path to a populated catalog *(most important gap)*

Plan: hard budget of six catalog requests/day, no category crawl, no retries, and any failed automatic attempt
blocks the next attempt for 24 hours.

The evidence says whole-section requests are exactly what fails: `get_series` returned no headers within 10 s,
and an earlier VOD scan ran 60 s. If the three section-catalog requests stall, the plan forbids every
alternative, so the catalog never populates and the app is permanently empty — worse than today.

Add a **checkpointed multi-day acquisition** that stays inside the budget and is never query-triggered:

- Day 1 spends the budget on category manifests + whole-section catalogs.
- If a section's catalog request fails, record it. The next scheduled sync spends that section's budget on its
  **categories in checkpointed slices**, resuming where it stopped.
- Coverage accumulates across days; each day still costs at most the fixed budget.
- Per-section coverage state (`complete` / `partial` / `none`, plus the next slice cursor) is persisted.

This preserves the plan's intent — no crawl on user action, hard daily ceiling — while giving a flaky provider
a path to completion.

### 2.2 Separate the failure cooldown from the success cooldown

A 24-hour block after a *failed* attempt is stricter than ban-safety requires; ban risk comes from volume, not
from retrying hours later. Recommend:

- success → 24 h
- failure → shorter backoff (start ~6 h, double, cap at 24 h)
- refusal (401/403/429) or `Retry-After` → **absolute**, unchanged, and relaunch cannot clear it

### 2.3 Persist the refusal state that already exists

`providerSearchBlock` is a module variable in `main.ts` and `globalSearchRetryAfterByQuery` is an in-memory
`Map` — both die on relaunch, so the plan's requirement is genuinely unmet. Persist per profile via
`src/storage.ts`. Also note `DEFAULT_PROVIDER_SEARCH_COOLDOWN_MS` is 5 minutes, which is right for search but
far too short for a sync-level block; use a separate, longer sync cooldown.

Generalize `src/provider-search-guard.ts` from search-specific to provider-wide, and have the broker consult it.

### 2.4 Drop M3U+ from the daily path

Plan: *"If a complete M3U+ playlist is proven sufficient: one playlist request."* Recommend removing this:

- M3U+ carries no reliable series/season/episode structure — series cannot be reconstructed from it.
- It embeds credentials and returns direct stream URLs, contradicting the plan's own rule against persisting
  credential-bearing playback URLs.
- It is a single very large response, so it trades request count for a 60 s-plus parse on the TV — the failure
  mode already observed.
- *"If proven sufficient"* is an open research task that will stall implementation.

Make three manifests + three section catalogs the only path. Revisit M3U+ later, Live-only, if ever.

### 2.5 Add a storage budget and eviction order

The plan stores normalized Live/VOD/Series, search documents, a prefix index, details cache and EPG cache on a
TV, with no byte ceiling and no eviction rule. Add:

- a measured byte ceiling with a headroom check before starting a sync
- eviction order: EPG → details cache → search index → superseded revisions; **never** the active catalog,
  **never** favorites/resume/settings
- probe real quota via `navigator.storage.estimate()` where available, with a conservative
  bytes-per-record fallback

### 2.6 Keep the account screen working without a validation request

The plan removes startup `validate` (correct — it runs unconditionally at module scope in `main.ts`). But the
account view shows expiry and connection limits from `AccountSummary`. Persist the last `AccountSummary` with
its timestamp, display it as "as of <date>", and refresh it only inside the daily sync.

### 2.7 Define the bootstrap experience

*"One explicit bootstrap sync"* needs specifics, or first-run looks broken:

- user-triggered from login/Home, with progress and a request-count display
- resumable across relaunch
- while empty, Search and Browse must say **"Library not downloaded yet — Refresh library"**, never
  "No results"

The same applies during the local-only window before cutover: an empty local index must never render as
"No results".

### 2.8 Make acceptance gate 1 automatable

*"Typing/searching/browsing locally causes zero provider requests"* cannot be automated today — Vitest runs
`environment: 'node'`, there is no jsdom, and `main.ts` has zero tests. Reframe as three layers:

1. **Broker unit tests** — serial execution, budget enforcement, refusal stops everything, cooldown persistence.
2. **A static choke-point test** — assert that no module except the broker imports `XtreamClient`. Cheap,
   automatable today, and it enforces the boundary permanently.
3. **Manual emulator verification** for the UI gates, recorded in `LIBRARY_ENGINE_STATUS.md`.

Add jsdom only if real DOM-level gates are wanted; treat it as a separate prerequisite.

### 2.9 Trim the concurrency design

A single-writer lease with epochs is more than this app needs — one process, one window. A sync-in-progress
flag plus a stale-run timestamp is sufficient. Do not build epoch fencing.

### 2.10 Two smaller items

- **Profile switch must not trigger a sync.** It is an automatic attempt and must respect the same policy.
- **Normalized records must retain playback-URL inputs** so URLs can be regenerated at play time. Reuse the
  existing whitelist in `toStoredStream` (`src/storage.ts:348-375`) rather than inventing a record shape — but
  note it is currently **module-private and must be exported first**. It whitelists 21 fields: `id`, `name`,
  `section`, `categoryId`, `icon`, `cover`, `rating`, `year`, `added`, `containerExtension`, `streamType`,
  `seriesId`, `channelNumber`, `catchup`, `directSource`, `season`, `episodeNumber`, `seriesTitle`,
  `seriesCover`, `searchName`. Keep its deliberate re-folding of `searchName` via `foldText` (do not trust a
  persisted value — older records used accent-preserving lowercase). Its validator counterpart is
  `isStreamItem` (`src/storage.ts:528`).

---

## 3. Execution order

1. **Local-only search, remove startup validate, use the category cache.** Delete the `searchStreams` call in
   `searchGlobalSection` (`main.ts:5389`); remove the module-scope `void refreshAccount(true)`
   (`main.ts:7249`); make `openSection` read `sectionCategories` before fetching (§1.5); add the
   "library not downloaded" empty state. Delete the inert warming machinery (§1.4) — dead code, no behaviour
   change.
2. **Remove EPG fan-out.** `prefetchNowNext` (`main.ts:5702`) has exactly two direct call sites —
   `renderCatalog` (`main.ts:1636`, live categories only) and `renderGuide` (`main.ts:2484`) — but
   `renderCatalog` is itself invoked from nine places, so the burst re-fires on paging, sorting, favourite
   toggles and back-navigation. Worst case is 48 requests per catalog page (24 cards on webOS × the
   `get_short_epg` → `get_simple_data_table` fallback) and 64 on the guide. Both call sites are unawaited
   floating promises. `nowNextPrefetchController` (`main.ts:415`) already limits this to one batch in flight,
   and `NOW_NEXT_CONCURRENCY` is 4 (`main.ts:205`). Remove the render-triggered prefetch entirely, make
   `loadLiveDetails` (`main.ts:5619`) consult `nowNextCache` before requesting, keep `epg` on explicit Guide
   use only (`showEpg`, `main.ts:5665`), and give `nowNextCache` a TTL — it currently has none, only a
   600-entry LRU cap.
3. **Provider request broker.** Single choke point wrapping both fetch sites; serial, budgeted, priority-aware,
   with persisted refusal/cooldown. Add the static choke-point test.
4. **Dev fixtures + deny real networking by default.** Follow the existing `import.meta.env.VITE_*` +
   `define` precedent (`metadata-client.ts:45`, `vite.config.ts:6-11`). Budget failure throws before fetch.
   Add `fixtures/` to `.gitignore`.
5. **IndexedDB persistence probe** (no provider requests), then the durable schema.
6. **Sync policy + checkpointed multi-day acquisition** per §2.1/§2.2.
7. **Local read cutover** for browse/search/favorites/continue-watching, and the Refresh library UI.
8. **Details/EPG persistence tiers.**

Steps 1–4 are independently shippable and deliver the safety outcome before any IndexedDB work exists.

## 4. Files

| Path | Change |
| --- | --- |
| `src/provider-broker.ts` | **New** — single choke point: serial queue, daily budget, priority lanes, persisted refusal/cooldown |
| `src/provider-search-guard.ts` | Generalize from search-specific to provider-wide; add persistence |
| `src/provider-error.ts` | Reuse as-is — classification, `Retry-After`, credential scrubbing |
| `src/xtream-client.ts` | Route both fetch sites through the broker; accept an injectable transport |
| `src/provider-transport.ts` | **New** — `HttpTransport` / `FixtureTransport` |
| `src/main.ts` | Local-only search; remove startup validate; remove EPG fan-out; Refresh library UI; empty states |
| `src/library/*` | **New** — schema, repository, sync policy, coverage/checkpoint state, local search index |
| `src/storage.ts` | Persist refusal/cooldown, last `AccountSummary`, sync timestamps; reuse `toStoredStream` shape |
| `scripts/record-fixtures.ts` | **New** |
| `.gitignore` | Add `fixtures/` |

## 5. Reuse rather than rewrite

- `src/provider-error.ts` — `classifyHttpStatus`, `parseRetryAfterMs`, `scrubSecrets`, `isProviderRefusal`
- `src/provider-search-guard.ts` — refusal → cooldown logic
- `src/search.ts` — `foldText`, `queryTokens`, `matchesQuery` for the local index (deliberately ES2015-safe;
  do not replace with `String.prototype.normalize`)
- `src/lru-ttl-cache.ts` — bounded session caches, injectable clock
- `src/search-catalog-queue.ts` — existing serialization primitive for paced sync
- `src/performance-trace.ts` — sanitized telemetry; the `xtream-http-failure` event is already wired
- `src/storage.ts` — `toStoredStream` whitelist, quota-halving `persistEntries`

## 6. Verification

- `npm test` and `npx tsc --noEmit` clean; `npm run build` clean apart from the known dashjs warning.
- Broker unit tests: at most one in-flight request; budget exhaustion throws before fetch; first refusal
  cancels all queued work; cooldown survives a simulated relaunch; manual refresh is single-flight and cannot
  bypass a refusal.
- Static test: only the broker imports `XtreamClient`.
- Sync tests: a failed section leaves the previous active revision intact; checkpointed category slices resume;
  the daily ceiling is never exceeded across a simulated week of failures.
- Local search: Downton fixture records return completely from the local index and survive close/relaunch.
- Emulator, recorded in `LIBRARY_ENGINE_STATUS.md`: repeated relaunches produce zero catalog/validation
  requests; rendering Live cards produces no `get_short_epg` fan-out; dev mode refuses real provider URLs
  before any network access.
- Privacy: no credentials or private catalog payloads in fixtures, traces, logs or git.
