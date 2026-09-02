const express = require("express");
const { resolvePrefs } = require("../configStore");
const { getPublicBase } = require("../routeHelpers");

const router = express.Router();

router.get("/manifest.json", (req, res) => {
  res.json({
    id: "org.torrstremio.app", version: "1.0.0", name: "TorrStremio",
    logo: `${getPublicBase(req)}/logo.svg`,
    icon: `${getPublicBase(req)}/logo.svg`,
    description: "Prowlarr/Jackett + TorrServer, com filtros por keywords",
    resources: ["stream", "meta"], types: ["movie", "series"],
    idPrefixes: ["tt", "kitsu:", "rssmovie:", "rssmeta:", "rssitem:"],
    catalogs: [], behaviorHints: { configurable: true, configurationRequired: true, p2p: true },
  });
});

router.get("/:userConfig/manifest.json", async (req, res) => {
  const prefs  = await resolvePrefs(req.params.userConfig);

  const types  = [...new Set((prefs.categories || ["movie","series"]).map(c => c==="movies"?"movie":c==="anime"?"series":c))];
  const name   = prefs.addonName || "TorrStremio";

  const enabledCats = Array.isArray(prefs.categories) && prefs.categories.length ? prefs.categories : ["movie", "series"];
  const catalogs = [];
  const catalogFilter = (process.env.RSS_CATALOG_INDEXERS || "").trim();
  // O catálogo aparece apenas se enableCatalog=true E a variável de ambiente estiver configurada
  if (prefs.enableCatalog && catalogFilter) {
    if (enabledCats.includes("movie"))  catalogs.push({ type: "movie",  id: "prowjack_rss_movie",  name: `${name} - Recentes`, extra: [{ name: "skip", isRequired: false }] });
    if (enabledCats.includes("series")) catalogs.push({ type: "series", id: "prowjack_rss_series", name: `${name} - Recentes`, extra: [{ name: "skip", isRequired: false }] });
  }

  res.json({
    id: "org.torrstremio.app", version: "1.0.0", name,
    logo: `${getPublicBase(req)}/logo.svg`,
    icon: `${getPublicBase(req)}/logo.svg`,
    description: "Prowlarr/Jackett + TorrServer, com filtros por keywords",
    resources: [
      "catalog",
      { name: "meta",   types, idPrefixes: ["rssmovie:", "rssmeta:", "prowjack:", "rssitem:"] },
      { name: "stream", types },
    ],
    types, idPrefixes: ["tt", "kitsu:", "rssmovie:", "rssmeta:", "prowjack:", "rssitem:"], catalogs,
    behaviorHints: { configurable: true, configurationRequired: false, p2p: true },
  });
});

module.exports = router;
