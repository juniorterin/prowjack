const express = require("express");
const { resolvePrefs } = require("../configStore");
const { getPublicBase } = require("../routeHelpers");
const { listCatalogs } = require("../catalogs");

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
  if (prefs.enableCatalog) {
    const curated = await listCatalogs();
    for (const cat of curated) {
      if (!enabledCats.includes(cat.type)) continue;
      catalogs.push({ type: cat.type, id: `curated_${cat.id}`, name: cat.name, extra: [{ name: "skip", isRequired: false }] });
    }
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
