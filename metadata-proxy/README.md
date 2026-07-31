# Nova Play Metadata Proxy

This Cloudflare Worker is the optional secure metadata boundary for Nova Play. It keeps TMDB and optional Trakt credentials out of the webOS application, IPK, DOM, and browser network requests.

## Routes

```text
POST /v1/resolve-title
GET  /v1/person/:personId
```

The Worker never accepts IPTV credentials, playlist URLs, stream URLs, or arbitrary upstream API paths.

## Rating policy

`POST /v1/resolve-title` returns bounded `contentRatings` candidates and a `ratingResolution` containing the selected candidate, age guidance, preferred region, fallback state, and safe provenance.

Selection is deterministic and Netherlands-first:

1. Official recognised Netherlands / Kijkwijzer classification.
2. Official TMDB result for the configured region.
3. Official Trakt result for the configured region.
4. Recognised Trakt fallback.
5. TMDB US result.
6. TMDB GB result.
7. Another recognised official result.
8. Recognised Xtream provider metadata in the browser application.

The Worker only collects classifications from TMDB release dates/content ratings and optional Trakt classification data. It never derives an age rating from IMDb, TMDB voting, or editorial scores. TVMaze remains a browser-side, no-key cast-portrait fallback only.

## Configuration and secrets

`metadata-proxy/wrangler.toml` supplies safe defaults:

```toml
METADATA_LANGUAGE = "en-US"
METADATA_REGION = "NL"
```

Copy `.dev.vars.example` to `.dev.vars` for local development, then set only the necessary values. `.dev.vars` is ignored by Git.

Required Worker secret:

```cmd
npx wrangler secret put TMDB_BEARER_TOKEN --config metadata-proxy/wrangler.toml
```

Optional, recommended fallback secret:

```cmd
npx wrangler secret put TRAKT_CLIENT_ID --config metadata-proxy/wrangler.toml
```

Set `ALLOWED_ORIGINS` as a comma-separated explicit origin list before deployment. Add `null` only when the packaged webOS app requires it; this enables the `null` Origin deliberately rather than as a wildcard.

```toml
ALLOWED_ORIGINS = "https://app.example.com,null"
```

## Commands

```cmd
npm run proxy:dev
npm run test:proxy
npm run proxy:deploy
```

The Worker uses timeout-aware requests and independent rating-source resolution. A TMDB or Trakt classification failure must not remove TMDB title, people, or recommendations data. Responses are cached for six hours and CORS responses vary by `Origin`.

## Build the webOS app with the deployed endpoint

The endpoint is a Vite build-time value. Build after configuring it:

```cmd
set VITE_METADATA_PROXY_URL=https://your-worker.workers.dev
npm run package:webos
```

Without `VITE_METADATA_PROXY_URL`, Nova Play does not call the Worker and continues to use Xtream metadata. The packaged app must not contain TMDB or Trakt secrets.

## Operational requirements

Apply rate limits and redacted request logging at Cloudflare. Do not log request bodies: title lookups can reveal viewing interests. Verify the deployed route with a movie and a series title, then inspect the selected rating, bounded candidate list, provenance, CORS headers, cache headers, and absence of secret values.

TMDB attribution remains visible in Nova Play’s metadata UI.