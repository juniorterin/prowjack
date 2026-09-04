# Dev workflow: Docker, and it hot-reloads

**Question:** how do you actually run this thing while working on it, and does a saved edit show up without extra steps?

**Answer:** `docker compose -f docker-compose.local.yaml up -d` — full local stack (redis + prowlarr + torrserver + this app, env from the gitignored `.env.local-stack`). Once it's up, saving a `.js` file is picked up automatically; nodemon inside the container restarts the app within a few seconds. `npm start`/`npm run dev` exist and work, but they're not how this project is actually developed — the Docker stack is, because the app is only meaningfully useful wired up to a real Prowlarr and TorrServer instance.

`docker-compose.yaml` is a **separate, unrelated** config for a real deploy. Don't confuse the two — they use the same `Dockerfile` but different build targets (see below), and a change to one doesn't imply anything about the other.

## Why hot-reload wasn't free: the multi-stage Dockerfile

`Dockerfile` originally had one stage: `npm ci --omit=dev` then `COPY . .`, baking the source into the image. That's correct for a deploy but means local dev required a manual rebuild after every single code change — no dev deps installed (no `nodemon`), no way to just edit-and-refresh.

The fix was to split `Dockerfile` into two stages:

- **`dev`** (used by `docker-compose.local.yaml` via `build.target: dev`): `npm ci` (full deps, including `nodemon`), and copies nothing — no `COPY . .` at all. The source is supplied at runtime by a bind mount instead (`docker-compose.local.yaml`: `.:/home/node/app`), plus a separate named volume for `node_modules` (`node_modules:/home/node/app/node_modules`) so the container's own Linux-built `node_modules` isn't shadowed by whatever the Windows host happens to have (or not have — the host doesn't need `npm install` run at all for this to work).
- **`production`** (the default/last stage — what `docker-compose.yaml`'s plain `build: .` resolves to, since Docker picks the last stage when no `target:` is given): unchanged behavior, `npm ci --omit=dev` + `COPY . .`, no dev deps, no hot-reload, code frozen into the image.

This was verified end-to-end: built both targets, brought the `dev` stack up, edited a route's response text on disk, and confirmed it changed on the running container without any manual restart — then confirmed `docker compose -f docker-compose.yaml build` still resolves to the `production` stage untouched.

## Why `--legacy-watch`

The container's `CMD` is `npx nodemon --legacy-watch addon.js`, not plain `nodemon addon.js`. Without `--legacy-watch`, nothing happened when a file was edited from the Windows host — a bind mount from a Windows host into a Linux container (via Docker Desktop) doesn't deliver native filesystem-change (inotify) events into the container, so nodemon's default watcher never fires. `--legacy-watch` switches nodemon to polling file mtimes instead, which is slightly slower to notice a change (roughly a second) but actually works across this boundary. This was confirmed by testing both ways — no restart without the flag, restart within a few seconds with it.

## When you actually need to rebuild

- Editing any `.js`/`.json`/`.mjs`/`.cjs` source file: **no rebuild needed**, nodemon picks it up.
- Changing `package.json` (adding/removing a dependency): rebuild the dev image — `docker compose -f docker-compose.local.yaml up -d --build torresmin`. The bind mount doesn't touch `node_modules` (that's the whole point of the separate named volume), so a new dependency won't appear until `npm ci` runs again inside the image build.
- Anything meant for the real deploy path (`docker-compose.yaml`): always rebuild explicitly. That path has no hot-reload at all, on purpose — a deploy image should be immutable, not a dev convenience.
