# Nova Play TMDB Metadata Proxy

This directory contains a compact Cloudflare Worker implementation for the optional Nova Play metadata service. It keeps the TMDB bearer token outside the webOS app and exposes only the normalized routes used by `src/metadata-client.ts`.

## Routes

```text
POST /v1/resolve-title
GET  /v1/person/:personId
```

The worker does not accept IPTV credentials, playlist URLs, stream URLs, or arbitrary TMDB paths.

## Deploy with Cloudflare Workers

1. Create a Worker project using the Cloudflare Wrangler CLI.
2. Copy `worker.ts` into that project's Worker entry point.
3. Store the TMDB API Read Access Token as a secret:

   ```cmd
   npx wrangler secret put TMDB_BEARER_TOKEN
   ```

4. Configure these non-secret environment variables as appropriate:

   ```text
   ALLOWED_ORIGIN=https://your-app-origin.example
   METADATA_LANGUAGE=en-US
   ```

5. Deploy through Wrangler, then configure the TV app before building:

   ```cmd
   set VITE_METADATA_PROXY_URL=https://your-worker.workers.dev
   npm run build
   ```

## Operational requirements

Apply rate limiting, request logging redaction, and cache rules at the Cloudflare account/zone level. The Worker already validates request shapes, bounds returned collections, allows only HTTPS profile links, and returns normalized response payloads. Do not log request bodies because title data can still be personal viewing information.

TMDB attribution must remain visible in the Nova Play metadata UI.