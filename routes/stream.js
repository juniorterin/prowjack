const express = require("express");
const router = express.Router();
const { ENV, CACHE_VERSION, STREAM_CACHE_VERSION, BAD_RE, BAD_EXT_RE, MIN_STREAM_SEEDS } = require("../constants");
const { rc, saveQbitJob } = require("../cache");
const { resolvePrefs } = require("../configStore");
const {
  getPublicBase,
  fetchScrapStreams,
  extractScrapIndexer,
  scrapExternalDescription,
  isPrivateTrackerCandidate
} = require("../routeHelpers");
const {
  RESOLUTION, QUALITY,
  first, getLangs, score,
  titleMatchScore, relaxedTitleMatchScore,
  extractReleaseYear, normalizeImdbId, getResultImdbId,
  looksLikeEpisodeRelease,
  episodeMatchRank, animeEpisodeMatchRank,
  seriesEpisodeMatches, animeEpisodeMatches,
  dedupeWithCachePriority,
  renameIndexer,
  visibleSeedCount, matchesKeywordBoost,
  isPriorityIndexerResult,
  hasDirectInfoHash, formatStream
} = require("../scoring");

const streamWaiters = new Map();
const { pickEpisodeFile, infoHashQueue, resolveInfoHash, buildMagnet } = require("../torrentUtils");
const { jackettSearch, buildQueries, resolveSearchIndexers, parseStreamId } = require("../jackettSearch");
const { loadRssItemsForType, findRssItemByToken, matchRssItemsByMarker } = require("../rssHelpers");
const { injectTrackers } = require("../torrentEnrich");

router.get("/:userConfig/stream/:type/:id.json", async (req, res) => {
  const prefs = await resolvePrefs(req.params.userConfig);
  const { type, id } = req.params;
  console.log(`\n=========================================`);
  console.log(`NOVA BUSCA: [${type}] ${id}`);

  // Cache de streams resolvidos — retorno instantâneo se já processado antes
  const streamCacheKey = `streams:${STREAM_CACHE_VERSION}:${req.params.userConfig}:${type}:${id}`;
  const cachedStreams = await rc.get(streamCacheKey).catch(() => null);
  if (cachedStreams) {
    try {
      const parsed = JSON.parse(cachedStreams);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`[Stream Cache HIT] ${parsed.length} streams para ${id}`);
        console.log(`=========================================\n`);
        return res.json({ streams: parsed });
      }
    } catch {}
  }
  // Lock atômico: se já existe uma Promise em andamento para este cache key,
  // aguarda ela resolver em vez de disparar nova busca (elimina a race condition).
  if (streamWaiters.has(streamCacheKey)) {
    console.log(`[Stream In-flight] aguardando resultado existente para ${id}`);
    try {
      const inflightStreams = await Promise.race([
        streamWaiters.get(streamCacheKey),
        new Promise(resolve => setTimeout(() => resolve([]), 120000)),
      ]);
      if (Array.isArray(inflightStreams) && inflightStreams.length > 0) {
        console.log(`[Stream In-flight HIT] ${inflightStreams.length} streams para ${id}`);
        console.log(`=========================================\n`);
        return res.json({ streams: inflightStreams });
      }
    } catch {}
    console.log(`[Stream In-flight] timeout; retornando vazio temporario para ${id}`);
    console.log(`=========================================\n`);
    return res.json({ streams: [] });
  }

  // Cria a Promise de lock ANTES de qualquer await — garante atomicidade
  let _resolveLock;
  const lockPromise = new Promise(resolve => { _resolveLock = resolve; });
  streamWaiters.set(streamCacheKey, lockPromise);
  const releaseLock = (streams = []) => {
    _resolveLock(streams);
    streamWaiters.delete(streamCacheKey);
  };
  const _t0 = Date.now();
  const reqCtx = { hasTimedOut: false };

  try {
    const { parsed, displayTitle, aliases = [], queries, episode, year, search } = await buildQueries(type, id);
    const requestedImdbId = normalizeImdbId(search?.imdbId || parsed?.metaId);

    const streamMeta = {
      title: displayTitle,
      year,
      formattedSeasons: (type === "series" && parsed.season != null)
        ? `S${String(parsed.season).padStart(2, "0")}${parsed.episode != null ? `E${String(parsed.episode).padStart(2, "0")}` : ""}`
        : "",
    };

    const enabledCats = Array.isArray(prefs.categories) && prefs.categories.length ? prefs.categories : ["movie", "series"];
    if (parsed.isAnime && !enabledCats.includes("anime"))                       { releaseLock(); return res.json({ streams: [] }); }
    if (!parsed.isAnime && type === "series" && !enabledCats.includes("series")) { releaseLock(); return res.json({ streams: [] }); }
    if (type === "movie" && !enabledCats.includes("movie"))                      { releaseLock(); return res.json({ streams: [] }); }

    const indexers = await resolveSearchIndexers(prefs, parsed.isAnime);

    // Fast-path: tenta encontrar resultados no cache RSS antes de buscar nos indexers
    let results = [];
    let rssMatchedResults = [];
    const rssType = parsed.rssType || (parsed.isAnime ? "anime" : type === "movie" ? "movie" : "series");
    let usedRssFastPath = false;
    const isOwnRssCatalogItem = parsed.source === "rssmovie" || parsed.source === "rssitem";
    const preferredRssIndexers = Array.isArray(prefs.rssIndexers) && prefs.rssIndexers.length
      ? prefs.rssIndexers
      : (Array.isArray(prefs.indexers) && prefs.indexers.length && !prefs.indexers.includes("all") ? prefs.indexers : null);
    const bypassRssFilters = parsed.source === "rssitem" || !!preferredRssIndexers?.length;

    if (parsed.source === "rssmovie") {
      const rssHits = await loadRssItemsForType(prefs, "movie");
      const matched = rssHits.filter(r => normalizeImdbId(r.ImdbId) === normalizeImdbId(parsed.metaId));
      if (matched.length) {
        results = matched.map((item, idx) => ({ ...item, _metaIdMatch: true, _titleMatchScore: 1, _rssPreferred: true, _rssOrder: idx }));
        usedRssFastPath = true;
        console.log(`[RSS Fast-path] ${results.length} resultados do cache RSS para ${parsed.metaId}`);
      } else {
        releaseLock();
        return res.json({ streams: [] });
      }
    } else if (parsed.source === "rssitem" && parsed.rssToken) {
      const rssHits = await loadRssItemsForType(prefs, parsed.rssType || rssType);
      const exactItem = findRssItemByToken(rssHits, parsed.rssToken);
      if (exactItem) {
        results = [{ ...exactItem, _metaIdMatch: true, _titleMatchScore: 1, _rssPreferred: true, _rssOrder: 0 }];
        usedRssFastPath = true;
      } else {
        releaseLock();
        return res.json({ streams: [] });
      }
    } else if (parsed.source === "rssitem") {
      const rssHits = await loadRssItemsForType(prefs, parsed.rssType || rssType);
      const requestedEpisode = parsed.episode ?? 0;
      const exactItems = matchRssItemsByMarker(
        rssHits,
        parsed.rssType || rssType,
        parsed.metaId,
        parsed.season ?? 1,
        requestedEpisode
      );
      if (exactItems.length) {
        results = exactItems.map((item, idx) => ({ ...item, _metaIdMatch: true, _titleMatchScore: 1, _rssPreferred: true, _rssOrder: idx }));
        usedRssFastPath = true;
      } else {
        releaseLock();
        return res.json({ streams: [] });
      }
    } else if (requestedImdbId || aliases.length) {
      const allowedRss = preferredRssIndexers;
      const rssPattern = allowedRss
        ? null
        : `rss:${CACHE_VERSION}:*:${rssType}:*`;
      const rssKeys = allowedRss
        ? await Promise.all(allowedRss.map(ix => rc.keys(`rss:${CACHE_VERSION}:${ix}:${rssType}:*`))).then(a => a.flat())
        : await rc.keys(rssPattern);
      if (rssKeys.length > 0) {
        const rssHits = (await Promise.all(
          rssKeys.map(async key => {
            try { const raw = await rc.get(key); return raw ? JSON.parse(raw) : []; }
            catch { return []; }
          })
        )).flat();

        const matched = rssHits
          .map((r, idx) => {
            const resultImdbId = normalizeImdbId(r.ImdbId);
            const byImdb = !!(requestedImdbId && resultImdbId && resultImdbId === requestedImdbId);
            const titleScore = titleMatchScore(r.Title || "", [displayTitle, ...aliases]);
            const relaxedScore = relaxedTitleMatchScore(r.Title || "", [displayTitle, ...aliases]);
            const effectiveScore = Math.max(titleScore, (parsed.isAnime || type === "series") ? relaxedScore * 0.85 : 0);
            const minAliasScore = parsed.isAnime ? 0.45 : type === "series" ? 0.5 : 0.6;
            const byAlias = effectiveScore >= minAliasScore;
            if (!byImdb && !byAlias) return null;
            return {
              ...r,
              _metaIdMatch: byImdb,
              _titleMatchScore: effectiveScore,
              _rssPreferred: bypassRssFilters,
              _rssOrder: idx,
            };
          })
          .filter(Boolean);

        if (matched.length > 0) {
          console.log(`[RSS Fast-path] ${matched.length} resultados do cache RSS para ${requestedImdbId || displayTitle}`);
          rssMatchedResults = matched;
        }
      }
    }

    // Busca scrap sempre, integrando os resultados na pipeline do ProwJack
    const scrapResults = ENV.scrapManifests.length > 0
      ? await Promise.all(ENV.scrapManifests.map(async (m, idx) => {
          const streams = await fetchScrapStreams(m, type, id, { prefs });
          console.log(`[SCRAP ${idx}] ${m.slice(0, 60)}... → ${streams.length} streams`);
          let scrapName = "Scrap Externo";
          try {
            const host = new URL(m).hostname;
            const parts = host.split('.');
            let rawName = parts.length >= 2 ? (parts[0] === 'www' || parts[0] === 'api' ? parts[1] : parts[0]) : host;
            scrapName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
          } catch {}
          return streams.map(s => {
            const ownName = String(s.name || "").split("\n")[0]
              .replace(/^[^[]*\[[^\]]*\]\s*/, "")
              .trim();
            return { ...s, _scrapName: ownName || scrapName };
          });
        }))
      : [];

    if (!isOwnRssCatalogItem) {
      const _tSearch = Date.now();
      const jackettResults = await jackettSearch({ parsed, queries, search }, indexers, prefs);
      if (jackettResults._incomplete) reqCtx.hasTimedOut = true;
      console.log(`[PERF] search=${Date.now() - _tSearch}ms (${jackettResults.length} resultados)`);
      results = [...rssMatchedResults, ...jackettResults];
      if (rssMatchedResults.length) {
        console.log(`[RSS + Live] ${rssMatchedResults.length} resultados RSS combinados com ${jackettResults.length} resultados ao vivo`);
      }
    }

    // Converte streams do scrap para formato de candidatos Jackett-like
    const scrapStreams = scrapResults.flat();
    const usenetCount = scrapStreams.filter(s => s.externalUrl && !s.url).length;
    const torrentCount = scrapStreams.filter(s => s.url || s.infoHash).length;
    console.log(`[SCRAP] Recebidos ${scrapStreams.length} streams de ${ENV.scrapManifests.length} addon(s) externo(s) (${torrentCount} torrent, ${usenetCount} usenet)`);

    const scrapCandidates = scrapStreams.map(s => {
      const titleText = s._title || [s.title, s.name, s.description, s.behaviorHints?.filename].filter(Boolean).join("\n") || "Scrap Stream";
      const fname = s._filename || s.behaviorHints?.filename || "";
      const hash = s.infoHash || (s.url && s.url.match(/btih:([a-f0-9]{40})/i)?.[1]) || null;
      const streamUrl = s.url || s.externalUrl || null;

      return {
        Title: titleText,
        InfoHash: hash,
        MagnetUri: hash ? `magnet:?xt=urn:btih:${hash}` : null,
        Link: streamUrl || 'scrap-stream',
        Size: s._sizeBytes || s.behaviorHints?.videoSize || 0,
        Seeders: s._seeders || 0,
        _scrapStream: s,
        _scrapSource: true,
        _indexerName: s._scrapName || 'Scrap Externo',
        Tracker: s._scrapName || 'Scrap Externo',
        TrackerId: 'scrap',
        Indexer: s._scrapName || 'Scrap Externo'
      };
    });

    console.log(`[SCRAP] Convertidos ${scrapCandidates.length} candidatos (${scrapCandidates.filter(c => c.InfoHash).length} com hash, ${scrapCandidates.filter(c => c._scrapStream.url || c._scrapStream.externalUrl).length} com url/usenet)`);

    results = [...results, ...scrapCandidates];
    const priorityLang = prefs.priorityLang ?? "pt-br";

    console.log(`Filtros ativos: onlyDubbed=${prefs.onlyDubbed}, priorityLang=${priorityLang}, keywordBoost=${prefs.keywordBoost ? 'SIM' : 'NÃO'}, priorityIndexers=[${(prefs.priorityIndexers||[]).join(",")}], maxPerIndexer=${prefs.maxResultsPerIndexer||0}`);

    const candidates = (bypassRssFilters && usedRssFastPath
      ? results
          .filter(r => r?.InfoHash || r?.MagnetUri || r?.Link)
          .filter(r => {
            if (parsed.source === "rssitem") return true;
            if (parsed.isAnime) return animeEpisodeMatches(r.Title || "", episode);
            if (type === "series") return seriesEpisodeMatches(r.Title || "", parsed.season, parsed.episode);
            return true;
          })
          .map(r => {
            r._originalScore = 1_000_000 - (r._rssOrder || 0);
            return r;
          })
      : results
          .filter(r => r?.InfoHash || r?.MagnetUri || r?.Link)
          .filter(r => {
            const isPrio = isPriorityIndexerResult(r, prefs);
            if (isPrio) r._priorityIndexer = true;
            return isPrio || r._scrapSource || !prefs.skipBadReleases || !BAD_RE.test(r.Title || "");
          })
          .filter(r => r._priorityIndexer || r._scrapSource || type !== "movie" || !looksLikeEpisodeRelease(r.Title || ""))
          .filter(r => {
            if (r._priorityIndexer || r._scrapSource) return true;
            if (parsed.isAnime) return animeEpisodeMatches(r.Title || "", episode);
            if (type === "series") {
              if (r._structuredMatch) {
                const rank = episodeMatchRank(r.Title || "", parsed.season, parsed.episode);
                return rank !== 0;
              }
              const resultImdbId = getResultImdbId(r);
              if (requestedImdbId && resultImdbId && resultImdbId === requestedImdbId) {
                return seriesEpisodeMatches(r.Title || "", parsed.season, parsed.episode);
              }
              return seriesEpisodeMatches(r.Title || "", parsed.season, parsed.episode);
            }
            return true;
          })
          .filter(r => {
            if (prefs.keywordBoost && matchesKeywordBoost(r.Title || "", prefs.keywordBoost)) {
              r._titleMatchScore = 1; r._keywordMatch = true; return true;
            }
            if (r._scrapSource) {
              r._titleMatchScore = Math.max(r._titleMatchScore || 0, 1);
              return true;
            }
            if (prefs.onlyDubbed && priorityLang) {
              const titleForLang = r.Title || r._title || "";
              const langs = getLangs(titleForLang, parsed.isAnime);
              const hasLang = langs.some(l => l.code === priorityLang);
              if (!hasLang) return false;
            }
            if (r._priorityIndexer) {
              r._titleMatchScore = Math.max(r._titleMatchScore || 0, 1);
              return true;
            }
            return true;
          })
          .filter(r => {
            if (r._keywordMatch) return true;
            const resultImdbId = getResultImdbId(r);
            if (requestedImdbId && resultImdbId && resultImdbId === requestedImdbId) {
              if (type === "series") {
                if (!seriesEpisodeMatches(r.Title || "", parsed.season, parsed.episode)) return false;
              }
              r._titleMatchScore = Math.max(r._titleMatchScore || 0, 1);
              r._metaIdMatch = true; return true;
            }
            if (r._priorityIndexer || r._scrapSource || r._metaIdMatch) return true;
            const langs   = getLangs(r.Title || "", parsed.isAnime);
            const hasLang = priorityLang ? langs.some(l => l.code === priorityLang) : false;

            if (prefs.onlyDubbed && priorityLang && hasLang) {
              r._titleMatchScore = Math.max(r._titleMatchScore || 0, 1);
              return true;
            }

            const sc           = titleMatchScore(r.Title || "", [displayTitle, ...aliases]);
            const relaxedScore = relaxedTitleMatchScore(r.Title || "", [displayTitle, ...aliases]);
            const episodeRank  = parsed.isAnime ? animeEpisodeMatchRank(r.Title || "", episode) : episodeMatchRank(r.Title || "", parsed.season, parsed.episode);
            const minScore     = parsed.isAnime ? 0.34 : (type === "series" && episodeRank >= 2 ? 0.2 : 0.45);
            const finalScore   = Math.max(sc, type === "series" ? relaxedScore * 0.8 : 0);
            if (hasLang && finalScore >= 0.1) r._titleMatchScore = Math.max(r._titleMatchScore || 0, 1);
            r._titleMatchScore = Math.max(r._titleMatchScore || 0, finalScore);
            return finalScore >= minScore || (hasLang && finalScore >= 0.1);
          })
          .filter(r => { if (r._priorityIndexer || r._scrapSource) return true; if (type !== "movie" || !year) return true; const ry = extractReleaseYear(r.Title || ""); return !ry || Math.abs(ry - year) <= 1; })
          .map(r => {
            const t       = r.Title || "";
            const langs   = getLangs(t, parsed.isAnime);
            const hasLang = priorityLang ? langs.some(l => l.code === priorityLang) : false;
            const isMulti = /(multi)[-.\\s]?(audio)?/i.test(t);
            const langPriority = (prefs.keywordBoost && matchesKeywordBoost(t, prefs.keywordBoost)) ? 4 : (hasLang ? 3 : (isMulti ? 1 : 0));
            r._originalScore = ((r._priorityIndexer ? 1 : 0) * 5000000) +
              (langPriority * 100000) +
              ((r._metaIdMatch    ? 1 : 0) * 40000) +
              ((r._structuredMatch ? 1 : 0) * 20000) +
              (parsed.isAnime ? animeEpisodeMatchRank(r.Title || "", episode) : episodeMatchRank(r.Title || "", parsed.season, parsed.episode)) * 10000 +
              (r._titleMatchScore || 0) * 1000 +
              score(r, prefs.weights, parsed.isAnime, priorityLang);
            return r;
          })
          .sort((a, b) => b._originalScore - a._originalScore));

    console.log(`Resultados: ${results.length} brutos → ${candidates.length} após filtros (idioma, título, ano)`);
    if (prefs.keywordBoost) {
      const withKeywords = candidates.filter(r => matchesKeywordBoost(r.Title || "", prefs.keywordBoost));
      console.log(`Keywords: ${withKeywords.length}/${candidates.length} releases com boost`);
    }

    const filteredCandidates = candidates;
    const maxOut = prefs.maxResults || 20;

    const candidateHasKeyword = r => !!(prefs.keywordBoost && matchesKeywordBoost(r.Title || "", prefs.keywordBoost));
    const candidateHasPriorityLang = r => {
      const t = r.Title || "";
      const langs = getLangs(t, parsed.isAnime);
      return !!(
        (priorityLang && langs.some(l => l.code === priorityLang)) ||
        ((priorityLang === "pt-br" && /(dublado|dubbed.*pt|pt[-_. ]?br|\bpor\b|\bpt\b|portugu[eê]s|portuguese|brazilian)/i.test(t)))
      );
    };

    // Limita quantos candidatos vão ao resolveInfoHash — mantém idioma/keyword prioritários
    const priority = filteredCandidates.filter(r => r._priorityIndexer || candidateHasPriorityLang(r) || candidateHasKeyword(r) || r._scrapSource);
    const regular = filteredCandidates.filter(r => !r._priorityIndexer && !candidateHasPriorityLang(r) && !candidateHasKeyword(r) && !r._scrapSource).slice(0, Math.max(maxOut * 3, 80));
    const topCandidates = [...priority, ...regular];
    const directCount = topCandidates.filter(hasDirectInfoHash).length;
    console.log(`Extraindo InfoHashes de ${topCandidates.length} candidatos (${directCount} diretos, ${topCandidates.length - directCount} via .torrent)...`);

    const withHashes = (await (async () => {
      const results = new Array(topCandidates.length).fill(null);
      const CONCURRENCY = 10;
      let idx = 0;
      async function worker() {
        while (idx < topCandidates.length) {
          const i = idx++;
          const candidate = topCandidates[i];

          if (candidate._scrapSource) {
            results[i] = { ...candidate, _resolved: { infoHash: candidate.InfoHash || null, files: [] } };
            continue;
          }

          const resolved = await resolveInfoHash(candidate, reqCtx);
          results[i] = resolved?.infoHash ? { ...candidate, _resolved: resolved } : null;
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      return results;
    })()).filter(Boolean);

    const availabilityFiltered = (() => {
      const filtered = withHashes.filter(r => {
        if (r._scrapSource) return true;
        return visibleSeedCount(r) >= MIN_STREAM_SEEDS;
      });
      if (filtered.length < withHashes.length) {
        console.log(`[Seeds] ${withHashes.length - filtered.length} candidato(s) abaixo de MIN_STREAM_SEEDS=${MIN_STREAM_SEEDS} removidos`);
      }
      return filtered;
    })();

    const dedupedWithHashes = (bypassRssFilters || prefs.dedupe === false)
      ? availabilityFiltered
      : dedupeWithCachePriority(availabilityFiltered, false);
    if (!bypassRssFilters && prefs.dedupe !== false && dedupedWithHashes.length < withHashes.length) {
      const removed = withHashes.length - dedupedWithHashes.length;
      console.log(`[DEDUP] ${withHashes.length} → ${dedupedWithHashes.length} candidatos (-${removed} duplicatas)`);
    }
    const candidateLangRank = r => candidateHasPriorityLang(r) ? 0 : 1;
    const candidateKeywordRank = r => candidateHasKeyword(r) ? 0 : 1;
    const candidateResScore = r => { const rr = first(RESOLUTION, r.Title || ""); return rr ? rr.score : 0; };
    const candidateQualScore = r => { const q = first(QUALITY, r.Title || ""); return q ? q.score : 0; };
    const sortedCandidates = dedupedWithHashes
      .slice()
      .sort((a, b) => {
        const dpi = (b._priorityIndexer ? 1 : 0) - (a._priorityIndexer ? 1 : 0); if (dpi !== 0) return dpi;
        const dk = candidateKeywordRank(a) - candidateKeywordRank(b); if (dk !== 0) return dk;
        const dl = candidateLangRank(a) - candidateLangRank(b); if (dl !== 0) return dl;
        const dq = candidateQualScore(b) - candidateQualScore(a); if (dq !== 0) return dq;
        const dr = candidateResScore(b) - candidateResScore(a); if (dr !== 0) return dr;
        const dz = (b.Size || 0) - (a.Size || 0); if (dz !== 0) return dz;
        return (b.Seeders || 0) - (a.Seeders || 0);
      });
    const streamCandidateLimit = Math.max(maxOut * 3, 80);
    const priorityCandidates = sortedCandidates.filter(r => candidateHasPriorityLang(r) || candidateHasKeyword(r));
    const regularCandidates = sortedCandidates.filter(r => !candidateHasPriorityLang(r) && !candidateHasKeyword(r));
    const regularLimit = Math.max(0, streamCandidateLimit - priorityCandidates.length);
    const streamCandidates = [...priorityCandidates, ...regularCandidates.slice(0, regularLimit)];
    if (dedupedWithHashes.length > streamCandidates.length) {
      console.log(`[LIMIT] resolvendo ${streamCandidates.length}/${dedupedWithHashes.length} candidatos (${priorityCandidates.length} idioma/keyword preservados)`);
    }

    const resolvedAll = await Promise.all(
      streamCandidates.map(async (r) => {
        try {
          // Scrap sem infoHash (link direto/usenet) já vem resolvido pelo addon externo.
          if (r._scrapSource && r._scrapStream && !r._resolved?.infoHash) {
            const ss = r._scrapStream;
            return {
              name: ss.name || `[Scrap] ${ss._scrapName || ""}`,
              description: scrapExternalDescription(ss, ss._scrapName || r._indexerName || ""),
              url: ss.url,
              externalUrl: ss.externalUrl,
              behaviorHints: ss.behaviorHints || { notWebReady: false },
              _priorityIndexer: !!r._priorityIndexer,
            };
          }

          const resolved     = r._resolved;
          if (!resolved.infoHash) return null;
          const indexerName  = r._indexerName || r.Tracker || r.TrackerId || r.Indexer || "Unknown";
          const scrapIndexer = r._scrapSource
            ? extractScrapIndexer(r._scrapStream?._title, r._scrapStream?.title, r.Title)
            : "";
          const fmtIndexer   = scrapIndexer || (r._scrapSource ? "" : indexerName);
          const { resLabel } = formatStream(r, fmtIndexer, parsed.isAnime, prefs, false, streamMeta);
          let { description } = formatStream(r, fmtIndexer, parsed.isAnime, prefs, true, streamMeta);
          if (r._scrapSource) {
            const fonteLine = `📡 ${r._scrapStream?._scrapName || indexerName}`;
            description  = [description, fonteLine].filter(Boolean).join("\n");
          }
          const matchedFile  = (type === "series" || parsed.isAnime)
            ? pickEpisodeFile(resolved.files, parsed.season, parsed.episode ?? episode, parsed.isAnime)
            : null;
          if ((type === "series" || parsed.isAnime) && resolved.files?.length && !matchedFile) {
            console.log(`[WARN] pickEpisodeFile: nenhum arquivo encontrado para S${parsed.season}E${parsed.episode ?? episode} em "${r.Title?.slice(0,60)}"`);
          } else if (matchedFile) {
            console.log(`[FILE] Arquivo selecionado: "${matchedFile.name}" (idx=${matchedFile.idx}) para S${parsed.season}E${parsed.episode ?? episode}`);
          }
          const displayFile = matchedFile || (Array.isArray(resolved.files) && resolved.files.length
            ? resolved.files
                .filter(f => /\.(mkv|mp4|avi|ts|m2ts|mov|wmv)$/i.test(f.name || ""))
                .sort((a, b) => (b.size || 0) - (a.size || 0))[0]
              || resolved.files.slice().sort((a, b) => (b.size || 0) - (a.size || 0))[0]
            : null);
          const fallbackTitle = (r.Title && !r.Title.includes('\n')) ? r.Title : "";
          const displayFileName = displayFile?.name || r._scrapStream?._filename || fallbackTitle;
          const filenameLine = displayFileName ? `📂 ${displayFileName}` : "";
          // Descarta streams cujo arquivo selecionado não é reproduzível (iso, rar, zip, etc.)
          if (displayFile?.name && BAD_EXT_RE.test(displayFile.name)) return null;
          const magnet      = buildMagnet(resolved.infoHash, r.MagnetUri, r.Title);
          const publicBase  = getPublicBase(req);
          const isPrivateTracker = isPrivateTrackerCandidate(r, resolved);

          // Salva o buffer .torrent já baixado no job (evita re-download que pode falhar) —
          // para trackers privados sem MagnetUri o re-download frequentemente falha por expiração
          // de sessão do Jackett. O buffer é enriquecido com trackers extras antes de salvar.
          let torrentB64 = null;
          if (resolved.buffer) {
            try { torrentB64 = injectTrackers(resolved.buffer).toString("base64"); }
            catch { torrentB64 = resolved.buffer.toString("base64"); }
          }
          const jobToken = await saveQbitJob({
            infoHash: resolved.infoHash,
            link:     (r.Link && !r.Link.startsWith("magnet:")) ? r.Link : null,
            magnet,
            fileIdx:  matchedFile?.idx  ?? null,
            fileName: matchedFile?.name || null,
            torrentB64,
          });

          return {
            name: `${prefs.addonName || "ProwJack"}\n⬇️ ${resLabel || "Links"} [TS]`,
            description: [description, filenameLine, isPrivateTracker ? "🔒 Tracker Privado" : ""].filter(Boolean).join("\n"),
            url:   `${publicBase}/${req.params.userConfig}/qbit/${jobToken}`,
            indexer: renameIndexer(indexerName),
            _priorityIndexer: !!r._priorityIndexer,
            behaviorHints: {
              filename:   displayFileName,
              videoSize:  displayFile?.size,
              bingeGroup: `prowjack|ts|${resolved.infoHash}`,
              notWebReady: false,
            },
          };
        } catch { return null; }
      })
    );

    const allStreams = resolvedAll.flat().filter(Boolean);

    resolvedAll.forEach((s, i) => {
      const r = streamCandidates[i];
      if (!r || !s) return;
      s._originalScore = r._originalScore || 0;
      s._title   = r.Title   || "";
      s._seeders = r.Seeders || 0;
      s._sizeGb  = (r.Size   || 0) / 1e9;
      if (r._priorityIndexer && !s._priorityIndexer) s._priorityIndexer = true;
      s._indexerKey = String(r.TrackerId || r.Tracker || r._indexerName || r.Indexer || "unknown").toLowerCase();
    });

    const dedupedStreams = prefs.dedupe === false ? allStreams : (() => {
      const out = [];
      const seen = new Set();
      // Dedup scrap vs Jackett: scrap tem prioridade por infoHash idêntico OU tamanho similar (±5%)
      const scrapHashes = new Set(allStreams.filter(s => s._scrapSource && s.infoHash).map(s => s.infoHash.toLowerCase()));
      const scrapSizes  = allStreams.filter(s => s._scrapSource && (s._sizeBytes > 0)).map(s => s._sizeBytes);
      const isSimilarSize = (a, b) => a > 0 && b > 0 && Math.abs(a - b) / Math.max(a, b) < 0.05;
      for (const s of allStreams) {
        if (!s._scrapSource) {
          const hash = s.infoHash?.toLowerCase();
          const size = s.behaviorHints?.videoSize || s._sizeBytes || 0;
          if (hash && scrapHashes.has(hash)) continue;
          if (size > 0 && scrapSizes.some(ss => isSimilarSize(ss, size))) continue;
        }
        const key = `${s.behaviorHints?.bingeGroup || ""}|${s.behaviorHints?.filename || ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(s);
      }
      return out;
    })();

    const _resScore  = (s) => { const r = first(RESOLUTION, s._title || ""); return r ? r.score  : 0; };
    const _qualScore = (s) => { const q = first(QUALITY,    s._title || ""); return q ? q.score  : 0; };
    const _hasKeyword = (s) => !!(prefs.keywordBoost && matchesKeywordBoost([s._title, s.description, s.name, s.behaviorHints?.filename].filter(Boolean).join(" "), prefs.keywordBoost));
    const _hasPriorityLang = (s) => {
      const t = [s._title, s.description, s.name, s.behaviorHints?.filename].filter(Boolean).join(" ");
      const langs = getLangs(t, parsed.isAnime);
      return !!(
        (priorityLang && langs.some(l => l.code === priorityLang)) ||
        ((priorityLang === "pt-br" && /(dublado|dubbed.*pt|pt[-_. ]?br|\bpor\b|\bpt\b|portugu[eê]s|portuguese|brazilian)/i.test(t)))
      );
    };
    const _sizeScore = (s) => { const size = Number(s._sizeGb || 0); return size > 0 ? size : 0; };
    const _priorityIndexerRank = (s) => s._priorityIndexer ? 0 : 1;

    // Ordenação: keywords → idioma prioritário → resolução → demais critérios de desempate.
    dedupedStreams.sort((a, b) => {
      const dk = (_hasKeyword(a) ? 0 : 1) - (_hasKeyword(b) ? 0 : 1); if (dk !== 0) return dk;
      const dl = (_hasPriorityLang(a) ? 0 : 1) - (_hasPriorityLang(b) ? 0 : 1); if (dl !== 0) return dl;
      const dr = _resScore(b)  - _resScore(a);  if (dr !== 0) return dr;
      const dpi = _priorityIndexerRank(a) - _priorityIndexerRank(b); if (dpi !== 0) return dpi;
      const ds = (b._originalScore || 0) - (a._originalScore || 0); if (ds !== 0) return ds;
      const dq = _qualScore(b) - _qualScore(a); if (dq !== 0) return dq;
      const dz = _sizeScore(b) - _sizeScore(a); if (dz !== 0) return dz;
      return (b._seeders || 0) - (a._seeders || 0);
    });

    let finalStreams = (() => {
      const applyCoverage = (pool, limit) => {
        const selected = [];
        const seen = new Set();
        const keyOf = s => s.infoHash || s.url || s.externalUrl || s.behaviorHints?.bingeGroup || s.description || s.name;
        const add = s => {
          if (!s || selected.length >= limit) return;
          const key = keyOf(s);
          if (key && seen.has(key)) return;
          if (key) seen.add(key);
          selected.push(s);
        };
        for (const s of pool) {
          if (_hasPriorityLang(s) || _hasKeyword(s)) add(s);
        }
        for (const s of pool) add(s);
        return selected;
      };

      let pool = dedupedStreams;
      if (!bypassRssFilters && prefs.maxResultsPerIndexer > 0) {
        const applyPerIndexerLimit = p => {
          const countByIndexer = new Map();
          return p.filter(s => {
            const key = s._indexerKey || "unknown";
            const n = (countByIndexer.get(key) || 0) + 1;
            countByIndexer.set(key, n);
            return n <= prefs.maxResultsPerIndexer;
          });
        };
        const priorityPool = applyPerIndexerLimit(pool.filter(s => _hasPriorityLang(s) || _hasKeyword(s)));
        const priorityKeys = new Set(priorityPool.map(s => s.infoHash || s.url || s.externalUrl || s.behaviorHints?.bingeGroup || s.description || s.name).filter(Boolean));
        const regularPool = applyPerIndexerLimit(pool.filter(s => {
          const key = s.infoHash || s.url || s.externalUrl || s.behaviorHints?.bingeGroup || s.description || s.name;
          return !_hasPriorityLang(s) && !_hasKeyword(s) && (!key || !priorityKeys.has(key));
        }));
        pool = [...priorityPool, ...regularPool];
      }

      return applyCoverage(pool, maxOut);
    })();

    if (dedupedStreams.length > 0) {
      const top = dedupedStreams.slice(0, Math.min(5, dedupedStreams.length));
      console.log(`[ORDEM] top${top.length}: ` + top.map(s => `[prio=${s._priorityIndexer?1:0} lang=${_hasPriorityLang(s)?1:0} key=${_hasKeyword(s)?1:0} size=${_sizeScore(s).toFixed(1)} res=${_resScore(s).toFixed(1)} ix=${s._indexerKey||"?"}] ${(s._title||"").slice(0,40)}`).join(" | "));
    }

    finalStreams.forEach(s => {
      delete s._originalScore;
      delete s._title;
      delete s._seeders;
      delete s._sizeGb;
      delete s._priorityIndexer;
      delete s._indexerKey;
      delete s._scrapSource;
      delete s._sizeBytes;
      delete s.indexer;
    });

    if (finalStreams.length > 0) {
      const topFinal = finalStreams.slice(0, Math.min(5, finalStreams.length))
        .map(s => `${(s.name || "").split("\n")[0]} => ${(s.behaviorHints?.filename || s.title || s.description || "").slice(0, 60)}`);
      console.log(`[FINAL] top${topFinal.length}: ${topFinal.join(" | ")}`);
    }
    console.log(`Streams listados: Enviando ${finalStreams.length} torrents!`);
    console.log(`=========================================\n`);

    if (finalStreams.length > 0) {
      const ttl = reqCtx.hasTimedOut ? 5 : 10800; // 5 segundos se incompleto, 3 horas se completo
      rc.set(streamCacheKey, JSON.stringify(finalStreams), ttl).catch(() => {});
    }
    console.log(`[DEBUG] Provider retornou: ${results.length} | Candidatos: ${candidates.length} | Com hash: ${withHashes.length} | Dedupe: ${dedupedWithHashes.length} | Final: ${finalStreams.length}`);
    console.log(`[PERF] total=${Date.now() - _t0}ms`);
    releaseLock(finalStreams);
    res.json({ streams: finalStreams });
  } catch (err) {
    console.log(`Erro no processamento: ${err.message}`);
    releaseLock([]);
    res.json({ streams: [] });
  }
});

module.exports = router;
