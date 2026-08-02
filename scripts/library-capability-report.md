# Nova Play Library Capability Probe

This disposable probe establishes whether the target webOS device can safely host the future durable Library Engine. It does not download provider catalogs, accept provider credentials, or write to the production catalog database.

## Build a probe-enabled package

The normal production build keeps the probe API unavailable. Build an explicit probe package:

```cmd
set VITE_ENABLE_LIBRARY_PROBE=true
rtk npm run package:webos
```

The package must contain `webos-app/library-capability-worker.js`. It is a deterministic classic-worker IIFE with no external imports.

Install and launch the probe package using the normal webOS workflow:

```cmd
rtk ares-install -d lg-oled-g1 packages\com.arash.novaplay_1.0.3_all.ipk
rtk ares-launch -d lg-oled-g1 com.arash.novaplay
rtk ares-inspect -d lg-oled-g1 com.arash.novaplay
```

## Run the probe

In the inspected page console, confirm that the development-only API exists:

```js
typeof window.__NOVA_LIBRARY_PROBE__
```

Run the initial, bounded probe without any provider networking:

```js
await window.__NOVA_LIBRARY_PROBE__.run({
  recordCounts: [10000],
  batchSizes: [100, 250, 500],
  testWorkerIndexedDb: true,
  cleanup: false,
})
```

Record only sanitized aggregate measurements from the returned report:

- IndexedDB CRUD, index, compound-key, and cursor results;
- Worker URL resolution, startup, messaging, and worker-side IndexedDB results;
- quota/usage/persistence API support;
- batch duration p50/p95 values;
- selected runner recommendation.

Do not record provider URLs, credentials, private catalog titles, searches, or raw payloads.

## Verify persistence after a real relaunch

Before closing the app, record the probe database name and its final record count from the first report. Fully close the app, relaunch it, then run the same named database with the expected count:

```js
await window.__NOVA_LIBRARY_PROBE__.run({
  databaseName: 'the-recorded-probe-database-name',
  persistenceExpectedRecordCount: 10000,
  recordCounts: [10000],
  batchSizes: [250],
  testWorkerIndexedDb: true,
  cleanup: false,
})
```

A result of `indexedDb.persistsAcrossRelaunch === 'yes'` is required before any durable catalog schema work may proceed.

## Stress tiers and cancellation

Only after the previous tier remains stable, repeat with 50,000 and then 100,000 compact synthetic records. Test a range of batch sizes such as 100, 250, 500, and 1,000.

While a probe is active:

1. start playback;
2. close or reload the app;
3. reopen the probe database;
4. verify that IndexedDB remains readable and that aborted transactions did not partially commit.

Worker fetch must be evaluated independently of main-thread fetch. It is intentionally absent from this probe because real IPTV networking is denied by default; any future fetch test must use an explicit test endpoint and must not log credential-bearing URLs.

## Cleanup and decision

Delete the disposable database after measurements are captured:

```js
await window.__NOVA_LIBRARY_PROBE__.cleanup()
```

Then build and package once without `VITE_ENABLE_LIBRARY_PROBE`. Verify that `window.__NOVA_LIBRARY_PROBE__` is absent.

Append only a sanitized summary and one of these decisions to `LIBRARY_ENGINE_STATUS.md`:

- `worker-idb`
- `worker-main-idb`
- `cooperative-main`
- `no-go`

Gate 0 remains pending until physical OLED G1 evidence covers persistence, worker behavior, cancellation, storage capacity, and playback impact.