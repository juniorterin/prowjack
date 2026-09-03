const express = require("express");
const axios = require("axios");
const { ENV } = require("../constants");
const { rc } = require("../cache");
const { normalizeImdbId } = require("../scoring");
const { enrichMetaPtBr } = require("../metadata");
const { getCatalog } = require("../catalogs");
const { isPtBrRequest } = require("../routeHelpers");

const router = express.Router();

// Catálogos curados mudam raramente — cache longo, mas catalogs.js invalida
// na hora (rc.del) sempre que o admin edita um catálogo, então isso não vira
// "editei e não apareceu por 6h".
const CATALOG_CACHE_TTL = 6 * 3600;
const CATALOG_PAGE_SIZE = 100;

router.get("/:userConfig/catalog/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;
  if (!id.startsWith("curated_")) return res.json({ metas: [] });
  const slug = id.slice("curated_".length);

  try {
    const catalog = await getCatalog(slug);
    if (!catalog || catalog.type !== type) return res.json({ metas: [] });

    const ptBr = isPtBrRequest(req);
    const cacheKey = `curatedcatalog:${slug}:${ptBr ? "pt" : "en"}`;
    let metas = null;
    const cached = await rc.get(cacheKey).catch(() => null);
    if (cached) {
      try { metas = JSON.parse(cached); } catch { metas = null; }
    }

    if (!metas) {
      metas = (await Promise.all(catalog.items.map(async ({ imdbId }) => {
        try {
          const r = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`, { timeout: 6000 });
          const meta = r.data?.meta;
          if (!meta) return null;
          const enriched = ptBr ? await enrichMetaPtBr(meta, imdbId, type) : meta;
          return {
            id:          imdbId,
            type,
            name:        enriched.name,
            poster:      enriched.poster,
            background:  enriched.background,
            description: enriched.description,
            releaseInfo: enriched.releaseInfo,
            imdbRating:  enriched.imdbRating,
            genres:      enriched.genres,
          };
        } catch { return null; }
      }))).filter(m => m && m.poster);
      rc.set(cacheKey, JSON.stringify(metas), CATALOG_CACHE_TTL).catch(() => {});
    }

    const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
    res.json({ metas: metas.slice(skip, skip + CATALOG_PAGE_SIZE) });
  } catch {
    res.json({ metas: [] });
  }
});

router.get("/:userConfig/meta/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;
  try {
    const targetType = type === "series" ? "series" : "movie";
    const cleanId = normalizeImdbId(id) || id;
    const r = await axios.get(`https://v3-cinemeta.strem.io/meta/${targetType}/${cleanId}.json`, { timeout: 5000 });
    const payload = r.data || { meta: null };
    if (payload.meta && isPtBrRequest(req)) payload.meta = await enrichMetaPtBr(payload.meta, cleanId, targetType);
    return res.json(payload);
  } catch {
    // Fallback: tenta buscar nos addons de scrap
    if (ENV.scrapManifests.length) {
      for (const manifestUrl of ENV.scrapManifests) {
        try {
          const base = manifestUrl.replace(/\/manifest\.json$/i, "");
          const r = await axios.get(`${base}/meta/${type}/${id}.json`, { timeout: 5000 });
          if (r.data?.meta) return res.json(r.data);
        } catch {}
      }
    }
    return res.json({ meta: null });
  }
});

module.exports = router;
