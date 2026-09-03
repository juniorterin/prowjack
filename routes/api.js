const express = require("express");
const { isConfigured: isTorrServerConfigured } = require("../providers/torrserver");
const { ENV } = require("../constants");
const { rc, redis } = require("../cache");
const { saveStoredConfig, resolvePrefs } = require("../configStore");
const { normalizePrefs, sanitizeUserPrefs, validateServiceUrl, cleanTemplate } = require("../prefs");
const { getPublicBase, getRequestAccessToken, requireAdminAccess } = require("../routeHelpers");
const { jackettFetchIndexers, fetchIndexerPrivacyMap, isProwlarrServer } = require("../jackettSearch");
const { formatStream } = require("../scoring");

const router = express.Router();

router.post("/api/config", async (req, res) => {
  try {
    const rawPrefs = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : null;
    if (!rawPrefs) return res.status(400).json({ ok: false, error: "Configuração inválida" });
    const prefs = sanitizeUserPrefs(rawPrefs);
    if (ENV.accessToken && prefs.token !== ENV.accessToken && getRequestAccessToken(req) !== ENV.accessToken) {
      return res.status(403).json({ ok: false, error: "Acesso negado" });
    }
    const userConfig = await saveStoredConfig(prefs);
    normalizePrefs(prefs);

    const addonUrl = `${getPublicBase(req)}/${userConfig}/manifest.json`;

    res.json({ ok: true, userConfig, addonUrl });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Recarrega uma config salva pra edição na tela de /configure — o token
// cfg_... na URL já é o mesmo segredo usado pra manifest/stream/catálogo,
// então reaproveita o mesmo modelo de acesso do resto do app.
router.get("/api/config/:userConfig", async (req, res) => {
  try {
    const prefs = await resolvePrefs(req.params.userConfig);
    res.json({ ok: true, prefs });
  } catch (err) {
    res.status(404).json({ ok: false, error: "Configuração não encontrada" });
  }
});

router.use("/api/indexers", requireAdminAccess);

router.use("/api/test", requireAdminAccess);

router.use("/api/metrics", requireAdminAccess);

// Preview ao vivo pro construtor de formatação — usa um resultado fictício
// pra renderizar name/description exatamente como o formatStream real faria.
router.post("/api/preview-format", (req, res) => {
  const nameTemplate = cleanTemplate(req.body?.nameTemplate, 300);
  const descriptionTemplate = cleanTemplate(req.body?.descriptionTemplate, 800);
  const addonName = String(req.body?.addonName || "TorrESMIN").slice(0, 80);

  const sampleResult = {
    Title: "The.Matrix.1999.2160p.UHD.BluRay.REMUX.HDR.DDP5.1.Atmos.x265-GROUP",
    Size: 37000000000,
    Seeders: 214,
  };
  const streamMeta = { title: "The Matrix", year: 1999, formattedSeasons: "" };

  try {
    const preview = formatStream(sampleResult, "1337x", false, { addonName, nameTemplate, descriptionTemplate }, true, streamMeta);
    res.json({ ok: true, name: preview.name, description: preview.description, tokens: preview.tokens });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get("/api/env", async (_, res) => {
  let redisOk = false;
  try {
    if (redis) {
      await redis.ping();
      redisOk = true;
    }
  } catch {}
  const jUrl = ENV.jackettUrl;
  const jKey = ENV.apiKey;
  const isProwlarr = isProwlarrServer(jUrl, jKey);
  res.json({
    jackettConfigured: !!ENV.jackettUrl,
    jackettKeyConfigured: !!ENV.apiKey,
    isProwlarr: isProwlarr === true,
    serverType: isProwlarr === true ? "prowlarr" : isProwlarr === false ? "jackett" : "unknown",
    torrServerConfigured: isTorrServerConfigured(),
    redisOk,
    port: ENV.port,
    accessProtected: !!ENV.accessToken,
  });
});

router.get("/api/indexers", async (req, res) => {
  let url;
  try {
    url = req.query.url ? validateServiceUrl(req.query.url) : ENV.jackettUrl;
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message, indexers: [] });
  }
  // Evita expor a chave manual na URL, no histórico do navegador e em logs.
  // O query param permanece como compatibilidade temporária com clientes antigos.
  const key = String(req.headers["x-jackett-api-key"] || req.query.key || "").trim() || ENV.apiKey;
  try   {
    const [indexers, privacyMap] = await Promise.all([
      jackettFetchIndexers(url, key),
      fetchIndexerPrivacyMap(url, key),
    ]);
    const enriched = indexers.map(ix => ({
      ...ix,
      private: !!privacyMap.get(String(ix.id))?.private,
      privacy: privacyMap.get(String(ix.id))?.privacy || null,
    }));
    res.json({ ok: true, count: enriched.length, indexers: enriched });
  }
  catch (err) { res.json({ ok: false, error: err.message, indexers: [] }); }
});

router.get("/api/test", async (_, res) => {
  try   { const indexers = await jackettFetchIndexers(); res.json({ ok: true, count: indexers.length, indexers }); }
  catch (err) { res.json({ ok: false, error: err.message }); }
});

router.get("/api/metrics", async (_, res) => {
  const keys = await rc.keys("metrics:*");
  const out  = {};
  for (const k of keys) {
    const raw = await rc.get(k);
    if (!raw) continue;
    try { out[k.replace("metrics:", "")] = JSON.parse(raw); } catch {}
  }
  res.json(out);
});

module.exports = router;
