# Testing harness

**Question:** the project had zero tests and no test framework installed — what got added, and why that shape?

**Answer:** `test/` using Node's built-in `node:test` + `node:assert/strict`. No new dependency was added (no Jest/Mocha/Vitest, no supertest) — this matches the project's existing minimal-dependency posture (`package.json`'s only devDependencies before this were `eslint`/`nodemon`/some AST tooling), and Node 22 (what this repo targets) ships a solid built-in test runner, coverage flag included, so there was nothing a third-party framework would have bought that was worth a new dependency.

## Commands

```bash
npm test                                       # everything (node --test, auto-discovers test/)
node --test test/unit/scoring.test.js          # one file
node --test test/unit/*.test.js test/integration/*.test.js   # explicit files/globs
npm run test:coverage                          # node --test --experimental-test-coverage
```

`node --test <bare-directory>` does **not** recurse on this Node build — passing `test/unit` as an argument fails with `Cannot find module`. Either pass no arguments at all (auto-discovery, which correctly walks `test/` and ignores `node_modules`) or pass explicit files/globs. `npm test` uses the no-arguments form.

## Layout

- `test/unit/` — pure-logic modules: `scoring`, `torrentUtils`, `prefs`, `routeHelpers`, `adminAuth`, `accessKeys`, `catalogs`, `configStore`, `constants`, `rssHelpers`.
- `test/integration/` — HTTP routes. Each test mounts *just* the router under test on a bare Express app listening on an ephemeral port (`test/helpers/testApp.js`) and hits it with Node's native `fetch` — no supertest, no full `addon.js` boot.
- `test/helpers/testEnv.js`, `test/helpers/testApp.js` — see below.

## Why every test file starts with `require("../helpers/testEnv")`

This repo's actual `.env` has real credentials (a real Prowlarr URL and API key) and `CONFIG_DATA_DIR=/data`. Several modules (`constants.js`, and transitively almost everything) call `dotenv.config()` at module load — and `dotenv` **never overwrites an env var that's already set**. So `testEnv.js` sets a batch of neutral values (`POSTGRES_URL`, `ADMIN_PASSWORD`, `REDIS_URL`, `JACKETT_URL`, `PORT`, etc. — all forced empty or to an unreachable address) *before* any project module gets required, which is only reliable if it's the very first require in the file. Get the order wrong and a test can silently pick up real config instead of the intended defaults.

It also points `CONFIG_DATA_DIR` at a fresh `fs.mkdtempSync` temp directory per test-file process, so `configStore.js`/`accessKeys.js`/`catalogs.js` (see `.claude/docs/persistence.md`) exercise their file-backed path in complete isolation — never touching `/data`, never touching a real Postgres.

For the handful of tests that need one specific env value at module-load time (e.g. `ADMIN_PASSWORD` set, to test `adminAuth.js`'s password/session logic), `testEnv.js` exports `setEnv(overrides)` (returns a restore function) and `clearProjectCache()` (drops every project-root module — not `node_modules`, not `test/` itself — from `require.cache`, forcing a clean re-require with the new env picked up). This pair is necessary specifically because `constants.js`'s `ENV` object is computed once at require time, not read live from `process.env` on each access.

## Why `closeSharedConnections()` exists

`catalogs.js`'s `renameCatalog`/`deleteCatalog`/`addCatalogItem`/`removeCatalogItem` all call `bustCache()`, which does `rc.del(...)` through `cache.js`. Because `cache.js` uses `lazyConnect`, that's the moment a real Redis connection attempt fires — against `testEnv.js`'s deliberately-unreachable `REDIS_URL`, ioredis's default retry strategy then keeps trying to reconnect forever, and the test process never exits on its own. `testEnv.js` exports `closeSharedConnections()` for exactly this: call it in a `after()` hook (see `test/unit/catalogs.test.js`, `test/integration/adminApi.route.test.js`) to force-disconnect and let the process exit. If a new test starts exercising a `catalogs.js` write path and the suite starts hanging, this is almost certainly why.

## What's deliberately not covered

`jackettSearch.js`, `rssPoller.js`, `torrentEnrich.js`, `routes/stream.js`, `routes/play.js` — all network/IO-heavy orchestration that would need a real mocking layer (not just env isolation) to test meaningfully, and weren't worth building that for in this pass.

`torrentEnrich.js` specifically deserves a standalone warning: it fires a real outbound HTTP request (fetching a tracker list) and starts an un-`unref()`'d 12-hour `setInterval` **the instant it's `require()`'d** — not behind any function call. Never `require` it from a short script or a test file; it will make a real network call and the process won't exit on its own for 12 hours.

## Known flake: `adminApi.route.test.js` under `node --test`

Roughly 1 in 3 runs, `node --test test/integration/adminApi.route.test.js` (alone or as part of the full suite) fails the whole file with `failureType: 'uncaughtException'` / `error: 'Unable to deserialize cloned data due to invalid or unsupported version.'`, reported against the file itself rather than any specific test. This is a Node.js test-runner IPC/reporting bug, not a real defect: running the same file directly with plain `node test/integration/adminApi.route.test.js` (bypassing the `--test` harness's TAP/IPC layer) passes every assertion cleanly every time, and `node --test` itself passes clean the other ~2 times out of 3. If this file fails in CI, re-run before assuming something broke — don't spend time bisecting the test content itself.

## CI

`.github/workflows/test.yml` runs `npm ci && npm test` on push/PR to `main`.
