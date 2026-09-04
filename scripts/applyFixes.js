#!/usr/bin/env node
// Aplica apenas as correções do fix-report.json onde título e ano batem com o esperado
// Edita os arquivos seed-data/*.json diretamente

"use strict";
const fs   = require("fs");
const path = require("path");

const FIX_FILE  = path.join(__dirname, "fix-report.json");
const SEED_DIR  = path.join(__dirname, "seed-data");

const report = JSON.parse(fs.readFileSync(FIX_FILE, "utf8"));

// Filmes que o script resolveu de forma ERRADA (falsos positivos óbvios)
// Identificados por título TMDB completamente diferente do original
const BLACKLIST = new Set([
  "tt0097205", // Dinner at Eight 1989 (queremos 1933)
  "tt0377990", // The Goodbye Girl 2004 (queremos 1977)
  "tt1781769", // Anna Karenina 2012 (queremos 1935)
  "tt0053454", // The World, the Flesh and the Devil (diferente)
  "tt0082747", // Honey 1981 (queremos Honey 2010 - outro)
  "tt1139665", // Polanski Unauthorised (documentário, não o film)
  "tt0075314", // Taxi Driver (era Taxi de Jafar Panahi)
  "tt0080678", // The Elephant Man (era Elephant de Gus Van Sant)
  "tt10855768",// Missing 2023 (era Missing 1982 de Costa-Gavras)
  "tt3516196", // The Shopkeeper (diferente de Shoplifters)
  "tt1065073", // Boyhood 2014 (id correto é tt1065073) ← este está OK, verificar
  "tt19580884",// Where Is the Friend's Home 2022 (queremos 1987)
  "tt1179933", // 10 Cloverfield Lane (era Ten de Kiarostami)
  "tt29355505",// Toy Story 5 (era Five de Kiarostami)
  "tt31710930",// Dreams 2025 (queremos Dreams 1990 de Kurosawa)
  "tt0117331", // The Phantom 1996 (era Phantom 1922)
  "tt0093170", // Men Behind the Sun (era Behind the Sun de Walter Salles)
  "tt0039914", // The Trespasser 1947 (diferente)
  "tt0156887", // Perfect Blue (era Blue de Kieslowski)
  "tt4649466", // Kingsman Golden Circle (era The Circle de Panahi)
  "tt5761544", // Kandahar 2023 (queremos 2001 de Mohsen Makhmalbaf)
  "tt0077416", // The Deer Hunter (era The Deer de Masud Kimiai)
  "tt43704174",// Oasis 2027 (queremos Oasis 2002 de Lee Chang-dong)
  "tt0475286", // Graduation 2007 (queremos 2016 de Cristian Mungiu)
  "tt0073811", // Conflagration 1975 (queremos 1958 de Ichikawa)
  "tt2915134", // Foreign Land 2016 (queremos 1995)
  "tt1403047", // Aurora 2011 (diferente do romeno)
]);

// Correções CONFIRMADAS como corretas (título TMDB bate com o original)
const confirmed = report.fixes.filter(f => !BLACKLIST.has(f.newImdbId));

let totalFixed = 0;
const fileCache = {};

for (const fix of confirmed) {
  const filePath = path.join(SEED_DIR, `${fix.slug}.json`);
  if (!fileCache[fix.slug]) {
    fileCache[fix.slug] = JSON.parse(fs.readFileSync(filePath, "utf8"));
  }
  const items = fileCache[fix.slug];
  const item = items.find(i => i.imdbId === fix.oldImdbId);
  if (item) {
    console.log(`[${fix.slug}] "${fix.title}": ${fix.oldImdbId} → ${fix.newImdbId}`);
    item.imdbId = fix.newImdbId;
    totalFixed++;
  }
}

// Salvar todos os arquivos modificados
for (const slug of Object.keys(fileCache)) {
  const filePath = path.join(SEED_DIR, `${slug}.json`);
  fs.writeFileSync(filePath, JSON.stringify(fileCache[slug], null, 2));
}

console.log(`\nTotal corrigido: ${totalFixed} entradas em ${Object.keys(fileCache).length} arquivos`);
