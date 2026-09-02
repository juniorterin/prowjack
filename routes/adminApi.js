const express = require("express");
const { requireAdminSession } = require("../adminAuth");
const { createAccessKey, listAccessKeys, deleteAccessKey, resetAccessKeyIp } = require("../accessKeys");

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
    const key = await createAccessKey(label);
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

router.delete("/admin/api/keys/:id", async (req, res) => {
  try {
    await deleteAccessKey(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
