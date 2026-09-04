#!/usr/bin/env node
// Busca IDs corretos no TMDB por título+ano para os filmes não encontrados
// Lê o verify-report.json e tenta resolver cada notFound via TMDB search
// Gera: scripts/fix-report.json com as correções sugeridas

"use strict";
const fs   = require("fs");
const path = require("path");
const https = require("https");

const TMDB_API_KEY  = process.env.TMDB_API_KEY || "cb73e2699d2bdb712a804183703ba344";
const REPORT_FILE   = path.join(__dirname, "verify-report.json");
const FIX_FILE      = path.join(__dirname, "fix-report.json");
const SEED_DIR      = path.join(__dirname, "seed-data");
const DELAY_MS      = 260;

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on("error", reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function searchTMDB(title, year) {
  const q = encodeURIComponent(title);
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${q}&year=${year}&language=en-US`;
  const data = await get(url);
  if (!data.results || data.results.length === 0) {
    // try without year
    const url2 = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${q}&language=en-US`;
    const data2 = await get(url2);
    return data2.results || [];
  }
  return data.results;
}

async function getImdbId(tmdbId) {
  const url = `https://api.themoviedb.org/3/movie/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
  const data = await get(url);
  return data.imdb_id || null;
}

async function main() {
  const report = JSON.parse(fs.readFileSync(REPORT_FILE, "utf8"));
  const toFix  = [...report.notFound, ...report.invalid];

  // deduplicate by original imdbId
  const seen = new Set();
  const unique = toFix.filter(item => {
    const key = item.imdbId + "|" + item.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`Buscando IDs corretos para ${unique.length} filmes...\n`);

  const fixes   = [];
  const noMatch = [];

  for (const item of unique) {
    try {
      const results = await searchTMDB(item.title, item.year || "");
      await sleep(DELAY_MS);

      if (!results.length) {
        noMatch.push(item);
        console.log(`✗ sem resultado: "${item.title}" (${item.year})`);
        continue;
      }

      // pick best match: same year or closest
      const best = results.find(r => Math.abs(parseInt(r.release_date) - parseInt(item.year)) <= 1)
                || results[0];

      const newImdbId = await getImdbId(best.id);
      await sleep(DELAY_MS);

      if (!newImdbId) {
        noMatch.push({ ...item, tmdbId: best.id, tmdbTitle: best.title });
        console.log(`⚠ sem imdbId no TMDB: "${item.title}" → TMDB: "${best.title}" (${best.release_date?.slice(0,4)})`);
        continue;
      }

      if (newImdbId === item.imdbId) {
        console.log(`= mesmo ID: "${item.title}" (${item.imdbId})`);
        continue;
      }

      fixes.push({ slug: item.slug, title: item.title, oldImdbId: item.imdbId, newImdbId, tmdbTitle: best.title, tmdbYear: best.release_date?.slice(0,4) });
      console.log(`✓ "${item.title}" (${item.imdbId}) → ${newImdbId} [${best.title} ${best.release_date?.slice(0,4)}]`);
    } catch(e) {
      console.log(`! erro: "${item.title}": ${e.message}`);
      noMatch.push(item);
    }
  }

  fs.writeFileSync(FIX_FILE, JSON.stringify({ fixes, noMatch }, null, 2));

  console.log(`\n=== RESULTADO ===`);
  console.log(`Correções encontradas: ${fixes.length}`);
  console.log(`Sem correspondência  : ${noMatch.length}`);
  console.log(`Relatório salvo em   : ${FIX_FILE}`);
}

main().catch(err => { console.error(err); process.exit(1); });
