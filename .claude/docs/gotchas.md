# Known gotchas

Things discovered while working in this codebase that aren't visible from reading any single file in isolation, and aren't (yet) fixed — flagging them so they don't get rediscovered the hard way, and so a future change doesn't accidentally depend on the broken behavior.

## `decodeBencode`'s unbounded colon scan can hang the process

`torrentUtils.js`'s `decodeBencode` parses a bencoded string value by scanning forward for a `:` (`while (buf[colon] !== 0x3a) colon++`) with **no bound against `buf.length`**. Node's `Buffer` returns `undefined` for an out-of-range index, and `undefined !== 0x3a` is always true — so a colon-less malformed buffer makes this loop run forever. It's synchronous, so it doesn't just hang one request, it blocks the entire Node process (nothing else can run).

In production this is only reachable through `resolveInfoHash`, behind a `buf[0] === 0x64` check (must look like a bencode dict) before `extractTorrentFiles(buf)` is called — so a truly arbitrary garbage response is safe. But a **truncated or corrupted** `.torrent` download that starts with `d` and then has a malformed string-length field somewhere inside its structure would still hit this and hang the server. Not fixed here; whoever next touches this parser should add a bound to that loop (e.g. `while (colon < buf.length && buf[colon] !== 0x3a) colon++` plus a check that it actually found one).

This is also why `test/unit/torrentUtils.test.js`'s garbage-input tests are careful to only use colon-bearing garbage (`"not:a:torrent"`) or well-formed-but-wrong-shape bencode (`"i123e"`, `"le"`, `"4:spam"`) — genuinely colon-less input would hang that test file, and did, before this was diagnosed.

## Two un-`unref()`'d timers that fire the moment a module is `require()`'d

- `cache.js` had a module-top-level `setInterval(cleanExpiredMemory, 60000)` with no `.unref()` — harmless in the real server (which stays alive via `app.listen` regardless), but it silently hung any short-lived script or test process that required `cache.js` (directly or transitively), since Node won't exit while a timer is still pending. **This one was fixed** — it's now `.unref()`'d.
- `torrentEnrich.js` was **not** fixed, and is worse: it fires a real outbound HTTP request (`updateDynamicTrackers()`, fetching a tracker list from GitHub/jsdelivr) and starts an un-`unref()`'d 12-hour `setInterval`, both unconditionally at module load, not behind any function call. Don't `require()` it from a script, a REPL, or a test — it makes a real network call and keeps the process alive for up to 12 hours on its own.

## Env vars are read once, at `require()` time

`constants.js` computes its `ENV` object once, the first time it's required in a process — not lazily on each property access. Nothing in this codebase re-reads `process.env` later or supports a config reload; changing an env var and expecting a running (non-Docker-restarted, non-nodemon-restarted) process to pick it up won't work. This matters for tests specifically (see `.claude/docs/testing.md`'s `clearProjectCache()`/`setEnv()` section) and is worth remembering generally when debugging "I changed the `.env` and nothing happened" — in the Docker dev setup (`.claude/docs/dev-workflow.md`) nodemon's restart is what actually picks up a changed env var, not anything in the app's own code.
