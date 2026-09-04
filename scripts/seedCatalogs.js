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
  // ── Canonical rankings ──────────────────────────────────────────────────────
  { slug: "sightsound",                name: "Sight & Sound — Top 100",                    type: "movie" },
  { slug: "sightsound_directors",      name: "Sight & Sound — Directors' Poll",            type: "movie" },
  { slug: "imdbtop250",                name: "IMDb Top 250",                               type: "movie" },
  { slug: "imdbtop100",                name: "IMDb Top 100",                               type: "movie" },
  { slug: "imdbtop50",                 name: "IMDb Top 50",                                type: "movie" },
  { slug: "tspdt100",                  name: "TSPDT — 100 Maiores Filmes",                 type: "movie" },
  // ── Criterion ────────────────────────────────────────────────────────────────
  { slug: "criterion",                 name: "Criterion Collection",                       type: "movie" },
  { slug: "criterion_horror",          name: "Criterion — Horror",                         type: "movie" },
  { slug: "criterion_japan",           name: "Criterion — Japão",                          type: "movie" },
  { slug: "criterion_noir",            name: "Criterion — Noir",                           type: "movie" },
  // ── AFI ──────────────────────────────────────────────────────────────────────
  { slug: "afi_movies",                name: "AFI — 100 Greatest American Films",          type: "movie" },
  { slug: "afi_thrills",               name: "AFI — 100 Anos...100 Suspenses",             type: "movie" },
  { slug: "afi_laughs",                name: "AFI — 100 Anos...100 Risadas",               type: "movie" },
  { slug: "afi_passions",              name: "AFI — 100 Anos...100 Paixões",               type: "movie" },
  // ── Festivais ─────────────────────────────────────────────────────────────────
  { slug: "cannes_palme",              name: "Cannes — Palme d'Or",                        type: "movie" },
  // ── Arquivos e Patrimônio ─────────────────────────────────────────────────────
  { slug: "nfr_highlights",            name: "National Film Registry — Destaques",         type: "movie" },
  // ── World Cinema — por país ───────────────────────────────────────────────────
  { slug: "world_france",              name: "World Cinema — França",                      type: "movie" },
  { slug: "world_italy",               name: "World Cinema — Itália",                      type: "movie" },
  { slug: "world_japan",               name: "World Cinema — Japão",                       type: "movie" },
  { slug: "world_korea",               name: "World Cinema — Coreia do Sul",               type: "movie" },
  { slug: "world_iran",                name: "World Cinema — Irã",                         type: "movie" },
  { slug: "world_brazil",              name: "World Cinema — Brasil",                      type: "movie" },
  { slug: "world_germany",             name: "World Cinema — Alemanha",                    type: "movie" },
  { slug: "world_sweden",              name: "World Cinema — Suécia",                      type: "movie" },
  { slug: "world_poland",              name: "World Cinema — Polônia",                     type: "movie" },
  { slug: "world_taiwan_hk",           name: "World Cinema — Taiwan & Hong Kong",          type: "movie" },
  // ── Movimentos cinematográficos ───────────────────────────────────────────────
  { slug: "movement_nouvelle_vague",   name: "Movimento — Nouvelle Vague",                 type: "movie" },
  { slug: "movement_neorealism",       name: "Movimento — Neorrealismo Italiano",          type: "movie" },
  { slug: "movement_cinema_novo",      name: "Movimento — Cinema Novo (Brasil)",            type: "movie" },
  { slug: "movement_new_hollywood",    name: "Movimento — New Hollywood",                  type: "movie" },
  { slug: "movement_german_expressionism", name: "Movimento — Expressionismo Alemão",      type: "movie" },
  { slug: "movement_romanian_new_wave","name": "Movimento — Romanian New Wave",            type: "movie" },
  // ── Diretores ────────────────────────────────────────────────────────────────
  { slug: "director_kubrick",          name: "Diretor — Stanley Kubrick",                  type: "movie" },
  { slug: "director_tarkovsky",        name: "Diretor — Andrei Tarkovsky",                 type: "movie" },
  { slug: "director_bergman",          name: "Diretor — Ingmar Bergman",                   type: "movie" },
  { slug: "director_kurosawa",         name: "Diretor — Akira Kurosawa",                   type: "movie" },
  { slug: "director_lynch",            name: "Diretor — David Lynch",                      type: "movie" },
  { slug: "director_godard",           name: "Diretor — Jean-Luc Godard",                  type: "movie" },
  { slug: "director_truffaut",         name: "Diretor — François Truffaut",                type: "movie" },
  { slug: "director_fellini",          name: "Diretor — Federico Fellini",                 type: "movie" },
  { slug: "director_antonioni",        name: "Diretor — Michelangelo Antonioni",           type: "movie" },
  { slug: "director_scorsese",         name: "Diretor — Martin Scorsese",                  type: "movie" },
  // ── Conceitos e Mood ─────────────────────────────────────────────────────────
  { slug: "mindbending",               name: "Mind-Bending Cinema",                        type: "movie" },
  { slug: "concept_existential",       name: "Concept — Cinema Existencial",               type: "movie" },
  { slug: "concept_dreamlike",         name: "Concept — Cinema Onírico",                   type: "movie" },
  { slug: "concept_slow_cinema",       name: "Concept — Slow Cinema",                      type: "movie" },
  { slug: "concept_uncomfortable",     name: "Concept — Cinema Perturbador",               type: "movie" },
  { slug: "hidden_gems_world",         name: "Hidden Gems — World Cinema",                 type: "movie" },
  // ── Gêneros especializados ────────────────────────────────────────────────────
  { slug: "genre_giallo",              name: "Gênero — Giallo",                            type: "movie" },
  { slug: "genre_folk_horror",         name: "Gênero — Folk Horror",                       type: "movie" },
  { slug: "genre_body_horror",         name: "Gênero — Body Horror",                       type: "movie" },
  { slug: "genre_cosmic_horror",       name: "Gênero — Horror Cósmico",                    type: "movie" },
  { slug: "genre_psychological_horror",name: "Gênero — Horror Psicológico",                type: "movie" },
  // ── Diretores (2ª rodada) ─────────────────────────────────────────────────────
  { slug: "director_haneke",           name: "Diretor — Michael Haneke",                   type: "movie" },
  { slug: "director_fassbinder",       name: "Diretor — Rainer Werner Fassbinder",         type: "movie" },
  { slug: "director_kiarostami",       name: "Diretor — Abbas Kiarostami",                 type: "movie" },
  { slug: "director_cassavetes",       name: "Diretor — John Cassavetes",                  type: "movie" },
  { slug: "director_almodovar",        name: "Diretor — Pedro Almodóvar",                  type: "movie" },
  { slug: "director_wong_kar_wai",     name: "Diretor — Wong Kar-wai",                     type: "movie" },
  // ── Movimentos (2ª rodada) ───────────────────────────────────────────────────
  { slug: "movement_japanese_new_wave",name: "Movimento — Japanese New Wave",              type: "movie" },
  { slug: "movement_iran_new_wave",    name: "Movimento — Iranian New Wave",               type: "movie" },
  { slug: "movement_romanian_new_wave",name: "Movimento — Romanian New Wave",              type: "movie" },
  // ── World Cinema (2ª rodada) ─────────────────────────────────────────────────
  { slug: "world_taiwan_hk",           name: "World Cinema — Taiwan & Hong Kong",          type: "movie" },
  { slug: "world_sweden",              name: "World Cinema — Suécia",                      type: "movie" },
  { slug: "world_poland",              name: "World Cinema — Polônia",                     type: "movie" },
  // ── Festivais (2ª rodada) ────────────────────────────────────────────────────
  { slug: "cannes_grand_prix",         name: "Cannes — Grand Prix",                        type: "movie" },
  { slug: "cannes_palme_extended",     name: "Cannes — Palme d'Or Completo",               type: "movie" },
  { slug: "venice_golden_lion",        name: "Venice — Golden Lion",                       type: "movie" },
  { slug: "berlin_golden_bear",        name: "Berlinale — Golden Bear",                    type: "movie" },
  // ── Mood / Conceitos (2ª rodada) ────────────────────────────────────────────
  { slug: "concept_melancholic",       name: "Concept — Cinema Melancólico",               type: "movie" },
  { slug: "concept_coming_of_age",     name: "Concept — Coming of Age",                    type: "movie" },
  { slug: "concept_urban_loneliness",  name: "Concept — Solidão Urbana",                   type: "movie" },
  { slug: "concept_road_movies",       name: "Concept — Road Movies",                      type: "movie" },
  { slug: "hidden_gems_world",         name: "Hidden Gems — World Cinema",                 type: "movie" },
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
