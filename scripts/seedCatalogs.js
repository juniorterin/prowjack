"use strict";
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { createCatalog, addCatalogItem, listCatalogs } = require("../catalogs");

// Roda uma vez pra popular os catálogos curados com dados reais. Não é rota
// HTTP -- roda direto: `node scripts/seedCatalogs.js` (compartilha o mesmo
// ambiente do app: CONFIG_DATA_DIR/CONFIG_DATABASE_URL etc.). Idempotente:
// pode rodar de novo à vontade sem duplicar catálogo ou item.
//
// Cada arquivo em scripts/seed-data/<slug>.json é um array de {title, year,
// imdbId} -- o imdbId vem de pesquisa real feita à parte (Cinemeta não tem
// endpoint público de busca por título, só /meta/<type>/<imdbId>.json — não
// dá pra resolver aqui, tem que já vir resolvido no arquivo).

const SEED_DIR = path.join(__dirname, "seed-data");

const CATALOGS = [
  { slug: "criterion",        name: "Criterion Collection",              type: "movie" },
  { slug: "sightsound",       name: "Sight & Sound — Top 100",           type: "movie" },
  { slug: "imdbtop250",       name: "IMDb Top 250",                      type: "movie" },
  { slug: "imdbtop100",       name: "IMDb Top 100",                      type: "movie" },
  { slug: "imdbtop50",        name: "IMDb Top 50",                       type: "movie" },
  { slug: "tspdt100",         name: "TSPDT — 100 Maiores Filmes",        type: "movie" },
  { slug: "mindbending",      name: "Mind-Bending Cinema",               type: "movie" },
  { slug: "afi_thrills",      name: "AFI — 100 Anos...100 Suspenses",    type: "movie" },
  { slug: "criterion_horror", name: "Criterion — Horror",                type: "movie" },
  { slug: "criterion_japan",  name: "Criterion — Japão",                 type: "movie" },
  { slug: "criterion_noir",   name: "Criterion — Noir",                  type: "movie" },
  { slug: "nfr_highlights",   name: "National Film Registry — Destaques", type: "movie" },
];

async function seedCatalog({ slug, name, type }) {
  const file = path.join(SEED_DIR, `${slug}.json`);
  if (!fs.existsSync(file)) {
    console.log(`[seed] ${slug}: sem arquivo de dados (${file}), pulando`);
    return;
  }
  const items = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(items) || !items.length) {
    console.log(`[seed] ${slug}: arquivo vazio, pulando`);
    return;
  }

  const existing = await listCatalogs();
  if (!existing.some(c => c.id === slug)) {
    await createCatalog(slug, name, type);
    console.log(`[seed] catálogo '${slug}' criado`);
  } else {
    console.log(`[seed] catálogo '${slug}' já existe, reaproveitando`);
  }

  let added = 0;
  const failed = [];
  for (const item of items) {
    const imdbId = item.imdbId || null;
    if (!imdbId) {
      failed.push(item.title || JSON.stringify(item));
      continue;
    }
    try {
      await addCatalogItem(slug, imdbId);
      added++;
    } catch (err) {
      console.log(`[seed] ${slug}: falha ao adicionar ${imdbId} (${item.title || ""}): ${err.message}`);
    }
  }

  console.log(
    `[seed] ${slug}: ${added}/${items.length} adicionados` +
    (failed.length ? `, ${failed.length} não resolvidos -> ${failed.join(", ")}` : "")
  );
}

async function main() {
  for (const cat of CATALOGS) {
    await seedCatalog(cat);
  }
  console.log("[seed] concluído.");
  process.exit(0);
}

main().catch(err => {
  console.error("[seed] erro fatal:", err);
  process.exit(1);
});
