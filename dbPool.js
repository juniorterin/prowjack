"use strict";

// Bootstrap genérico de pool Postgres, extraído de configStore.js — reaproveitado
// por configStore.js, accessKeys.js e catalogs.js pra não abrir um pool por módulo
// quando todos apontam pro mesmo banco (POSTGRES_URL/CONFIG_DATABASE_URL).

function buildPgSslOptions(rawUrl) {
  let connectionString = rawUrl;
  let sslMode = "";
  let hostname = "";
  try {
    const parsed = new URL(rawUrl);
    hostname = parsed.hostname;
    sslMode = String(parsed.searchParams.get("sslmode") || "").toLowerCase();
    // postgres.js e alguns clientes precisam de 'sslmode' na string, mas o
    // node-postgres (pg) usa a opção 'ssl' configurada acima. Removemos para
    // evitar conflito de propagação de 'sslmode' para o backend.
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("uselibpqcompat");
    connectionString = parsed.toString();
  } catch {}

  const isRemote = /^postgres/i.test(rawUrl) && !/^(localhost|127\.0\.0\.1|::1)$/i.test(hostname);
  const isSupabasePooler = /pooler\.supabase\.com|supabase\.co/i.test(hostname);
  // Supabase (pooler) em runtime serverless (Vercel/Functions) exige SSL, mas o
  // bundle de CA do runtime nem sempre contém o certificado → rejectUnauthorized:true
  // dispara "self-signed certificate"/"unable to verify". Para o pooler do Supabase
  // sempre conectamos com rejectUnauthorized:false (não honramos DB_SSL_REJECT_UNAUTHORIZED
  // para esse caso, pois validação de CA não funciona no serverless com o pooler).
  let ssl = undefined;
  if (isRemote && isSupabasePooler) {
    ssl = { rejectUnauthorized: false };
  } else if (isRemote && sslMode && sslMode !== "disable") {
    const reject = process.env.DB_SSL_REJECT_UNAUTHORIZED;
    ssl = reject === "true" ? { rejectUnauthorized: true } : { rejectUnauthorized: false };
  }
  return { connectionString, ssl };
}

const pools = new Map(); // connectionString -> pg.Pool

function getPgPool(rawUrl) {
  if (!rawUrl) return null;
  if (pools.has(rawUrl)) return pools.get(rawUrl);
  let Pool;
  try {
    ({ Pool } = require("pg"));
  } catch (err) {
    throw new Error("Banco Postgres configurado, mas a dependência 'pg' não está instalada. Rode npm install.");
  }
  const opts = buildPgSslOptions(rawUrl);
  let hostname = "";
  try { hostname = new URL(opts.connectionString).hostname; } catch {}
  console.log(`[DB] Postgres inicializado (host=${hostname || '?'}, ssl=${opts.ssl ? JSON.stringify(opts.ssl) : 'off'})`);
  const pool = new Pool(opts);
  pools.set(rawUrl, pool);
  return pool;
}

module.exports = { buildPgSslOptions, getPgPool };
