const express = require("express");
const path = require("path");
const { ENV } = require("../constants");
const { verifyAdminPassword, createSessionCookie, clearSessionCookie, verifyAdminSession, requireAdminPage } = require("../adminAuth");

const router = express.Router();

router.get("/admin", requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "admin.html"));
});

router.get("/admin/login", (req, res) => {
  if (ENV.adminPassword && verifyAdminSession(req)) return res.redirect("/admin");
  res.sendFile(path.join(__dirname, "..", "public", "admin-login.html"));
});

router.post("/admin/login", (req, res) => {
  if (!ENV.adminPassword) return res.status(503).json({ ok: false, error: "ADMIN_PASSWORD não configurado" });
  const password = req.body?.password;
  if (!verifyAdminPassword(password)) return res.status(401).json({ ok: false, error: "Senha incorreta" });
  res.setHeader("Set-Cookie", createSessionCookie(req));
  res.json({ ok: true });
});

router.post("/admin/logout", (req, res) => {
  res.setHeader("Set-Cookie", clearSessionCookie(req));
  res.json({ ok: true });
});

module.exports = router;
