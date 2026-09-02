"use strict";
require("dotenv").config();
const express = require("express");
const path    = require("path");

const { rc, redis } = require("./cache");
const { isConfigured: isTorrServerConfigured } = require("./providers/torrserver");
const { startRssPoller } = require("./rssPoller");
const { ENV } = require("./constants");
const { checkRateLimit, getClientIp } = require("./routeHelpers");

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: "Rate limit excedido" });
  }
  next();
});

app.use((req, res, next) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || ["*"];
  const origin = req.headers.origin;
  if (allowedOrigins.includes("*") || (origin && allowedOrigins.includes(origin))) {
    res.header("Access-Control-Allow-Origin", origin || "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.use("/", require("./routes/api"));
app.use("/", require("./routes/manifest"));
app.use("/", require("./routes/configure"));
app.use("/", require("./routes/catalog"));
app.use("/", require("./routes/play"));
app.use("/", require("./routes/stream"));
app.use("/", require("./routes/admin"));
app.use("/", require("./routes/adminApi"));

app.listen(ENV.port, "0.0.0.0", () => {
  console.log(`===== Application Startup at ${new Date().toISOString().replace('T', ' ').slice(0, 19)} =====`);
  console.log(`TorrStremio v1.0.0 -> http://localhost:${ENV.port}/configure`);
  console.log(`   Jackett   : ${ENV.jackettUrl}`);
  console.log(`   Redis     : ${ENV.redisUrl}`);
  console.log(`   TorrServer: ${isTorrServerConfigured() ? "ativo" : "desativado"}`);
  startRssPoller(ENV.jackettUrl, ENV.apiKey, rc, redis);
});
