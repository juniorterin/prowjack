const express = require("express");
const { isConfigured: isTorrServerConfigured } = require("../providers/torrserver");
const { ENV } = require("../constants");
const { rc, redis } = require("../cache");
const { saveStoredConfig } = require("../configStore");
const { normalizePrefs, sanitizeUserPrefs, validateServiceUrl } = require("../prefs");
const { getPublicBase, getRequestAccessToken, requireAdminAccess } = require("../routeHelpers");
const { jackettFetchIndexers, fetchIndexerPrivacyMap, isProwlarrServer } = require("../jackettSearch");

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

router.use("/api/indexers", requireAdminAccess);

router.use("/api/test", requireAdminAccess);

router.use("/api/metrics", requireAdminAccess);

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
