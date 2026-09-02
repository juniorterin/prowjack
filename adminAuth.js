"use strict";
const crypto = require("crypto");
const cookie = require("cookie");
const { ENV } = require("./constants");

// Sessão do /admin: cookie assinado por HMAC, sem tabela de sessão nem
// express-session — o segredo de assinatura deriva da própria ADMIN_PASSWORD,
// então trocar a senha invalida toda sessão antiga de graça.
const COOKIE_NAME = "pj_admin_session";
const SESSION_TTL_MS = 12 * 3600 * 1000;

function sessionSecret() {
  return crypto.createHash("sha256").update(ENV.adminPassword).digest();
}

function verifyAdminPassword(password) {
  if (!ENV.adminPassword) return false;
  const a = crypto.createHash("sha256").update(String(password || "")).digest();
  const b = crypto.createHash("sha256").update(ENV.adminPassword).digest();
  return crypto.timingSafeEqual(a, b);
}

function sign(expiresAtMs) {
  const hmac = crypto.createHmac("sha256", sessionSecret()).update(String(expiresAtMs)).digest("hex");
  return `${expiresAtMs}.${hmac}`;
}

// Comportamento deliberadamente diferente do ACCESS_TOKEN global (aberto se
// não configurado) — sem ADMIN_PASSWORD, o /admin recusa tudo, não abre.
function isSecureRequest(req) {
  return (req.headers["x-forwarded-proto"] || req.protocol) === "https";
}

function createSessionCookie(req) {
  const expiresAtMs = Date.now() + SESSION_TTL_MS;
  const token = sign(expiresAtMs);
  return cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: "lax",
    path: "/admin",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

function clearSessionCookie(req) {
  return cookie.serialize(COOKIE_NAME, "", {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: "lax",
    path: "/admin",
    maxAge: 0,
  });
}

function verifyAdminSession(req) {
  if (!ENV.adminPassword) return false;
  const cookies = cookie.parse(req.headers.cookie || "");
  const token = cookies[COOKIE_NAME];
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return false;
  const expiresAtMs = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = sign(Number(expiresAtMs));
  if (expected.length !== token.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token))) return false;
  return Number(expiresAtMs) > Date.now();
}

function requireAdminSession(req, res, next) {
  if (!ENV.adminPassword) return res.status(503).json({ ok: false, error: "ADMIN_PASSWORD não configurado" });
  if (!verifyAdminSession(req)) return res.status(401).json({ ok: false, error: "not authenticated" });
  next();
}

function requireAdminPage(req, res, next) {
  if (!ENV.adminPassword) return res.status(503).send("ADMIN_PASSWORD não configurado no servidor.");
  if (!verifyAdminSession(req)) return res.redirect("/admin/login");
  next();
}

module.exports = {
  verifyAdminPassword,
  createSessionCookie,
  clearSessionCookie,
  verifyAdminSession,
  requireAdminSession,
  requireAdminPage,
};
