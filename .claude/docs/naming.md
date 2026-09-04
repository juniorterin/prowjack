# Naming: prowjack / TorrStremio → TorrESMIN

**TorrESMIN** is a backronym: **T**orrent: **E**ntertainment **S**hould **M**ake **I**nclusion **N**atural. Both READMEs carry it as a tagline under the title — keep it in English (it's an acronym expansion, not prose) if either README is ever edited.

**Question:** why do some files/comments say "prowjack" or "TorrStremio" instead of "TorrESMIN" — is one of them wrong, or a leftover that needs cleaning up?

**Answer:** the rebrand is done. "TorrESMIN" is the current, correct name everywhere — in code, comments, docs, env defaults, Docker Compose service/container/volume/network names, and both READMEs. There were actually two names to clear out, not one:

- **"prowjack"** — the project's original internal name. It showed up as the local working directory name, the GitHub repo name, Docker Compose service/container/network/volume names (`prowjack`, `prowjack-net`, `prowjack-data`, ...), the default Postgres table / JSON file names in `configStore.js`/`accessKeys.js`/`catalogs.js` (`prowjack_configs`, `prowjack_access_keys`, `prowjack_catalogs`), a legacy `"prowjack:"` id-prefix alias in `jackettSearch.js`/`rssHelpers.js`/`routes/manifest.js` (dead code — nothing ever generated ids with that prefix, only `rssmeta:`, so it was removed outright rather than renamed), and a handful of Portuguese code comments ("pipeline do ProwJack", "O ProwJack só precisa...").
- **"TorrStremio"** — an interim display name used briefly in both READMEs (title, header, git-clone instructions) before "TorrESMIN" was settled on.

Both are now purged from the repo. If you find a fresh mention of either while working here, it's a genuine miss, not intentional legacy — fix it on sight rather than assuming it's someone else's leftover.

**One deliberate behavioral note:** the default Postgres table names and JSON file names changed (`prowjack_configs.json` → `torresmin_configs.json`, etc.). An existing deployment with real data stored under the old default names needs either its data files/tables renamed to match, or the corresponding `*_DATABASE_TABLE` env var set explicitly to the old name — otherwise it starts from empty state on next boot. Not an issue for a fresh install.

The GitHub repo itself was renamed from `prowjack` to `torresmin` (see the READMEs' clone URL) — that's a hosting-level rename done through GitHub's own repo settings, not something reflected by any file content.
