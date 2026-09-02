const express = require("express");
const { requireAdminSession } = require("../adminAuth");
const { createAccessKey, listAccessKeys, deleteAccessKey, resetAccessKeyIp, updateAccessKeySettings } = require("../accessKeys");
const { listCatalogs, createCatalog, renameCatalog, deleteCatalog, addCatalogItem, removeCatalogItem } = require("../catalogs");

const router = express.Router();

router.use("/admin/api", requireAdminSession);

router.get("/admin/api/keys", async (req, res) => {
  try {
    const keys = await listAccessKeys();
    res.json({ ok: true, keys });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/admin/api/keys", async (req, res) => {
  try {
    const label = String(req.body?.label || "").trim();
    if (!label) return res.status(400).json({ ok: false, error: "Rótulo é obrigatório" });
    const { expiresAt, ipLimited } = req.body || {};
    const key = await createAccessKey(label, { expiresAt, ipLimited });
    res.json({ ok: true, key });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/admin/api/keys/:id/reset-ip", async (req, res) => {
  try {
    const key = await resetAccessKeyIp(req.params.id);
    if (!key) return res.status(404).json({ ok: false, error: "Chave não encontrada" });
    res.json({ ok: true, key });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.patch("/admin/api/keys/:id", async (req, res) => {
  try {
    const { expiresAt, ipLimited } = req.body || {};
    const key = await updateAccessKeySettings(req.params.id, { expiresAt, ipLimited });
    if (!key) return res.status(404).json({ ok: false, error: "Chave não encontrada" });
    res.json({ ok: true, key });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete("/admin/api/keys/:id", async (req, res) => {
  try {
    await deleteAccessKey(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/admin/api/catalogs", async (req, res) => {
  try {
    const catalogs = await listCatalogs();
    res.json({ ok: true, catalogs });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/admin/api/catalogs", async (req, res) => {
  try {
    const { id, name, type } = req.body || {};
    if (!id || !name) return res.status(400).json({ ok: false, error: "id e name são obrigatórios" });
    const catalog = await createCatalog(id, name, type);
    res.json({ ok: true, catalog });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.patch("/admin/api/catalogs/:id", async (req, res) => {
  try {
    const catalog = await renameCatalog(req.params.id, req.body?.name);
    if (!catalog) return res.status(404).json({ ok: false, error: "Catálogo não encontrado" });
    res.json({ ok: true, catalog });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.delete("/admin/api/catalogs/:id", async (req, res) => {
  try {
    await deleteCatalog(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/admin/api/catalogs/:id/items", async (req, res) => {
  try {
    const catalog = await addCatalogItem(req.params.id, String(req.body?.imdbId || "").trim());
    res.json({ ok: true, catalog });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.delete("/admin/api/catalogs/:id/items/:imdbId", async (req, res) => {
  try {
    const catalog = await removeCatalogItem(req.params.id, req.params.imdbId);
    res.json({ ok: true, catalog });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
