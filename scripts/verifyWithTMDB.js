#!/usr/bin/env node
// Verifica todos os filmes dos seed JSONs contra o TMDB usando IMDb ID
// Uso: node scripts/verifyWithTMDB.js
// Gera: scripts/verify-report.json e imprime resumo no console

"use strict";
const fs   = require("fs");
const path = require("path");
const https = require("https");

const TMDB_API_KEY = process.env.TMDB_API_KEY || "cb73e2699d2bdb712a804183703ba344";
const SEED_DIR     = path.join(__dirname, "seed-data");
const REPORT_FILE  = path.join(__dirname, "verify-report.json");
const DELAY_MS     = 250; // respeitar rate limit TMDB (~40 req/s)

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    }).on("error", reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function findByImdbId(imdbId) {
  const url = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
  const data = await get(url);
  const results = [...(data.movie_results||[]), ...(data.tv_results||[])];
  if (results.length === 0) return null;
  return { tmdbId: results[0].id, title: results[0].title || results[0].name, year: (results[0].release_date || results[0].first_air_date || "").slice(0, 4) };
}

async function main() {
  const files = fs.readdirSync(SEED_DIR).filter(f => f.endsWith(".json"));
  const report = { ok: [], notFound: [], invalid: [], total: 0, checked: 0 };
  const seen = new Set(); // evitar checar o mesmo imdbId duas vezes

  for (const file of files) {
    const slug = file.replace(".json", "");
    const items = JSON.parse(fs.readFileSync(path.join(SEED_DIR, file), "utf8"));
    if (!Array.isArray(items)) continue;

    for (const item of items) {
      report.total++;
      const imdbId = item.imdbId;

      if (!imdbId || !/^tt\d+$/.test(imdbId)) {
        report.invalid.push({ slug, title: item.title, imdbId });
        continue;
      }
      if (seen.has(imdbId)) continue;
      seen.add(imdbId);
      report.checked++;

      try {
        const result = await findByImdbId(imdbId);
        if (!result) {
          report.notFound.push({ slug, title: item.title, imdbId });
          process.stdout.write(`✗ NOT FOUND [${slug}] ${item.title} (${imdbId})\n`);
        } else {
          const yearMatch = !item.year || Math.abs(parseInt(result.year) - parseInt(item.year)) <= 1;
          if (!yearMatch) {
            report.notFound.push({ slug, title: item.title, imdbId, tmdbTitle: result.title, tmdbYear: result.year, note: "year_mismatch" });
            process.stdout.write(`⚠ YEAR MISMATCH [${slug}] "${item.title}" (${item.year}) → TMDB: "${result.title}" (${result.year})\n`);
          } else {
            report.ok.push({ slug, title: item.title, imdbId, tmdbId: result.tmdbId });
          }
        }
      } catch(e) {
        process.stdout.write(`! ERROR [${slug}] ${item.title} (${imdbId}): ${e.message}\n`);
      }

      await sleep(DELAY_MS);
    }
  }

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  console.log(`\n=== RESULTADO ===`);
  console.log(`Total de entradas : ${report.total}`);
  console.log(`IDs únicos checados: ${report.checked}`);
  console.log(`✓ OK              : ${report.ok.length}`);
  console.log(`✗ Não encontrados : ${report.notFound.length}`);
  console.log(`! IDs inválidos   : ${report.invalid.length}`);
  console.log(`\nRelatório salvo em: ${REPORT_FILE}`);
}

main().catch(err => { console.error(err); process.exit(1); });
