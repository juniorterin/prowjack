"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

// Precisa ser o primeiro require de qualquer arquivo de teste: neutraliza envs
// que apontariam pra infra real (Postgres, Redis, Jackett, senha de admin
// verdadeira etc.) antes que qualquer módulo do projeto seja exigido.
// dotenv.config() (chamado dentro de constants.js) NUNCA sobrescreve uma env
// que já esteja definida — por isso essas atribuições precisam vir primeiro.
const NEUTRAL_ENV = {
  POSTGRES_URL: "",
  CONFIG_DATABASE_URL: "",
  DATABASE_URL: "",
  ACCESS_KEYS_DATABASE_URL: "",
  CATALOGS_DATABASE_URL: "",
  ADMIN_PASSWORD: "",
  ACCESS_TOKEN: "",
  PORT: "",
  TS_URL: "",
  // Porta improvável: garante ECONNREFUSED rápido em vez de bater num Redis real.
  REDIS_URL: "redis://127.0.0.1:1",
  JACKETT_URL: "http://127.0.0.1:1",
  JACKETT_API_KEY: "",
  SCRAP_MANIFEST_URLS: "",
  ALLOWED_ORIGINS: "*",
  ADDON_PUBLIC_URL: "",
};

for (const [key, value] of Object.entries(NEUTRAL_ENV)) {
  process.env[key] = value;
}

function mkTempDir(prefix = "torresmin-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// accessKeys.js, configStore.js e catalogs.js caem pro backend em arquivo
// (JSON dentro de CONFIG_DATA_DIR) quando não há URL de banco configurada —
// isolamos cada processo de teste num diretório próprio pra não sujar /data
// nem o projeto real, e pra não vazar estado entre execuções.
process.env.CONFIG_DATA_DIR = mkTempDir();

const PROJECT_ROOT = path.join(__dirname, "..", "..");

// Sobrescreve envs temporariamente e devolve uma função que restaura os
// valores originais (inclusive "não estava definida").
function setEnv(overrides) {
  const prev = {};
  for (const [k, v] of Object.entries(overrides)) {
    prev[k] = Object.prototype.hasOwnProperty.call(process.env, k) ? process.env[k] : undefined;
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return function restore() {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

// Remove do require cache todos os módulos do próprio projeto (mas não
// node_modules nem os próprios helpers de teste) — força reavaliação de
// módulos como constants.js, que só lê process.env na primeira vez que é
// exigido. Use isso depois de mudar envs relevantes (ADMIN_PASSWORD etc.)
// e antes de re-exigir o módulo sob teste.
function clearProjectCache() {
  for (const key of Object.keys(require.cache)) {
    if (!key.startsWith(PROJECT_ROOT)) continue;
    if (key.includes(`${path.sep}node_modules${path.sep}`)) continue;
    if (key.includes(`${path.sep}test${path.sep}`)) continue;
    delete require.cache[key];
  }
}

// cache.js abre uma conexão Redis "preguiçosa" (lazyConnect) que só é
// realmente disparada quando algo chama rc.get/set/del (ex.: bustCache em
// catalogs.js). Contra o REDIS_URL inatingível deste harness, o cliente ioredis
// entra no retryStrategy padrão e mantém um timer de reconexão vivo pra sempre
// — sem isso, o processo de teste nunca sai sozinho. Chame isto num after()
// em qualquer arquivo de teste que exercite esse caminho (ex.: catalogs.js).
function closeSharedConnections() {
  try {
    const { redis } = require(path.join(PROJECT_ROOT, "cache"));
    if (redis && typeof redis.disconnect === "function") redis.disconnect();
  } catch {}
}

module.exports = { mkTempDir, setEnv, clearProjectCache, closeSharedConnections, PROJECT_ROOT };
