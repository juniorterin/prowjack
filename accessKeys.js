"use strict";
const crypto = require("crypto");
const fs     = require("fs");
const path   = require("path");
const { getPgPool } = require("./dbPool");
const { getClientIp } = require("./routeHelpers");

// Chaves de acesso por pessoa: quem tem uma chave válida trancada no próprio
// IP pode buscar/assistir; sem chave (ou IP diferente do travado), só o
// catálogo funciona. Mesmo padrão dual-backend (Postgres ou arquivo) que
// configStore.js usa pras configs, mas com CRUD/listagem de verdade — coisa
// que configStore.js não tem porque nunca precisou.

function getKeysDbUrl() {
  return process.env.ACCESS_KEYS_DATABASE_URL || process.env.CONFIG_DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL || "";
}
function getKeysDbTable() {
  const table = process.env.ACCESS_KEYS_DATABASE_TABLE || "prowjack_access_keys";
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(table)) throw new Error("ACCESS_KEYS_DATABASE_TABLE inválida");
  return table;
}
function shouldUseKeysDb() {
  return !!getKeysDbUrl();
}

// ─── Postgres ────────────────────────────────────────────────────────────────
let keysPgInit = null;

async function ensureKeysDb() {
  const url = getKeysDbUrl();
  if (!shouldUseKeysDb()) return null;
  const pool = getPgPool(url);
  if (!pool) return null;
  const table = getKeysDbTable();
  if (!keysPgInit) {
    keysPgInit = pool.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).catch((err) => {
      keysPgInit = null;
      console.error(`[KEYS] Falha ao inicializar a tabela Postgres '${table}':`, err?.message || err);
      throw err;
    });
  }
  await keysPgInit;
  return pool;
}

async function dbList() {
  const pool = await ensureKeysDb();
  if (!pool) return null;
  const table = getKeysDbTable();
  const r = await pool.query(`SELECT payload FROM ${table} ORDER BY created_at DESC`);
  return r.rows.map(row => row.payload);
}

async function dbGet(id) {
  const pool = await ensureKeysDb();
  if (!pool) return null;
  const table = getKeysDbTable();
  const r = await pool.query(`SELECT payload FROM ${table} WHERE id = $1`, [id]);
  return r.rows[0]?.payload || null;
}

async function dbUpsert(record) {
  const pool = await ensureKeysDb();
  if (!pool) return false;
  const table = getKeysDbTable();
  await pool.query(
    `INSERT INTO ${table} (id, payload, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [record.id, JSON.stringify(record)]
  );
  return true;
}

async function dbDelete(id) {
  const pool = await ensureKeysDb();
  if (!pool) return false;
  const table = getKeysDbTable();
  await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
  return true;
}

// ─── Arquivo ─────────────────────────────────────────────────────────────────
const KEYS_FILE = (() => {
  let dir = process.env.CONFIG_DATA_DIR || "";
  if (!dir || /^[a-z][a-z0-9+.-]*:\/\//i.test(dir)) dir = "/data";
  return path.join(dir, "prowjack_access_keys.json");
})();

function fileLoad() {
  try {
    if (!fs.existsSync(KEYS_FILE)) return {};
    return JSON.parse(fs.readFileSync(KEYS_FILE, "utf8"));
  } catch { return {}; }
}
function fileSave(store) {
  try {
    const dir = path.dirname(KEYS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(KEYS_FILE, JSON.stringify(store), "utf8");
  } catch (err) {
    console.error(`[KEYS] Falha ao salvar chaves: ${err.message}`);
  }
}
let _store = null;
function store() {
  if (!_store) _store = fileLoad();
  return _store;
}

// ─── API pública ─────────────────────────────────────────────────────────────
function newKeyId() {
  return "key_" + crypto.randomBytes(12).toString("base64url");
}

async function createAccessKey(label) {
  const record = {
    id: newKeyId(),
    label: String(label || "").trim().slice(0, 80),
    ip: null,
    createdAt: Date.now(),
    lockedAt: null,
    lastUsedAt: null,
  };
  if (shouldUseKeysDb()) {
    await dbUpsert(record);
  } else {
    const s = store();
    s[record.id] = record;
    fileSave(s);
  }
  return record;
}

async function listAccessKeys() {
  if (shouldUseKeysDb()) return await dbList();
  return Object.values(store()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function getAccessKey(id) {
  if (!id) return null;
  if (shouldUseKeysDb()) return await dbGet(id);
  return store()[id] || null;
}

async function deleteAccessKey(id) {
  if (shouldUseKeysDb()) return await dbDelete(id);
  const s = store();
  const existed = !!s[id];
  delete s[id];
  fileSave(s);
  return existed;
}

async function saveAccessKey(record) {
  if (shouldUseKeysDb()) return await dbUpsert(record);
  const s = store();
  s[record.id] = record;
  fileSave(s);
  return true;
}

async function resetAccessKeyIp(id) {
  const record = await getAccessKey(id);
  if (!record) return null;
  record.ip = null;
  record.lockedAt = null;
  await saveAccessKey(record);
  return record;
}

// Gate usado em routes/stream.js e routes/play.js. Sem chave -> nega. Chave
// desconhecida -> nega. Primeiro uso -> trava no IP atual e libera. IP
// diferente do travado -> nega.
async function checkAccessKey(prefs, req) {
  const keyId = prefs?.accessKey;
  if (!keyId) return false;
  const record = await getAccessKey(keyId);
  if (!record) return false;
  const ip = getClientIp(req);
  if (!record.ip) {
    record.ip = ip;
    record.lockedAt = Date.now();
    record.lastUsedAt = Date.now();
    await saveAccessKey(record);
    return true;
  }
  if (record.ip !== ip) return false;
  record.lastUsedAt = Date.now();
  saveAccessKey(record).catch(() => {});
  return true;
}

module.exports = {
  createAccessKey,
  listAccessKeys,
  getAccessKey,
  deleteAccessKey,
  resetAccessKeyIp,
  checkAccessKey,
};
