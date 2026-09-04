# Three separate auth mechanisms — don't conflate them

**Question:** a route returns 403/401/503 for what looks like an auth reason — which of the three systems is actually responsible, and are they related?

**Answer: no, they're independent, gate different things, and were clearly designed for different audiences.**

## `ACCESS_TOKEN` — operational API gate

`routeHelpers.hasAdminAccess(req)`/`requireAdminAccess` (middleware). A single shared-secret string, read from `ENV.accessToken` (`constants.js`), compared against `X-Access-Token` header or `?token=` query param (`getRequestAccessToken`). Gates a handful of operational/debug routes: `/api/indexers`, `/api/test`, `/api/metrics` (`routes/api.js`). **Open by default** — `hasAdminAccess` returns `true` whenever `ACCESS_TOKEN` isn't configured at all (`!ENV.accessToken` short-circuits). This is the lightest-weight of the three: it exists to stop a stranger from poking at your Prowlarr indexer list or search metrics if this instance is reachable from the internet, not to protect anything sensitive.

## `ADMIN_PASSWORD` — the `/admin` UI

`adminAuth.js`. Gates the whole `/admin` page and `/admin/api/*` (access-key and curated-catalog management — `routes/admin.js`, `routes/adminApi.js`) via an HMAC-signed session cookie (`pj_admin_session`), not a token header. Login is `POST /admin/login` with the password; the session secret is `sha256(ENV.adminPassword)` — deliberately derived from the password itself rather than a separate `SESSION_SECRET` env var, so rotating the password invalidates every existing session for free, with no separate secret to remember to rotate too.

**Closed by default** — the opposite of `ACCESS_TOKEN`: `requireAdminSession`/`requireAdminPage` respond `503` ("ADMIN_PASSWORD não configurado") whenever the password isn't set, rather than opening up. The asymmetry is intentional: an unset `ACCESS_TOKEN` means "I didn't bother locking this down," while an unset `ADMIN_PASSWORD` means the entire admin surface (which can create/delete access keys and edit curated catalogs) should be unreachable, not open.

## Per-viewer access keys — gating `/stream` and `/play` for end users

`accessKeys.js`, admin-created and managed through the `/admin` UI above (so this is a third layer sitting *behind* `ADMIN_PASSWORD`, not a replacement for it). Each key has a label, an optional expiry, and — the interesting part — an optional IP lock (`ipLimited`, default `true`): the **first** IP that successfully uses a key gets it permanently bound to that key (`record.ip`/`record.lockedAt`) until an admin calls `resetAccessKeyIp`; every subsequent request from a different IP is denied outright, even with the correct key string. `checkAccessKey(prefs, req)` is called at the very top of both `/:userConfig/stream/...` (`routes/stream.js`) and `/:userConfig/play/...` (`routes/play.js`) — independently in each, since the play link is reachable on its own and can't assume the stream request already checked it.

This is the mechanism that actually matters for the "don't let this instance's link get passed around" use case the README frames as a core feature — a shared Stremio addon URL becomes single-viewer (or single-household, effectively single-IP) enforced without needing real user accounts. It's unrelated to `ACCESS_TOKEN` and `ADMIN_PASSWORD`; a request can pass either of those and still get an empty stream list here for lack of a valid key, or vice versa.
