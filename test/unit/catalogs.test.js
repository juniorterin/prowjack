"use strict";
const { closeSharedConnections } = require("../helpers/testEnv"); // isola CONFIG_DATA_DIR num diretório temporário
const { test, describe, after } = require("node:test");
const assert = require("node:assert/strict");
const {
  listCatalogs,
  getCatalog,
  createCatalog,
  renameCatalog,
  deleteCatalog,
  addCatalogItem,
  removeCatalogItem,
} = require("../../catalogs");

// rename/delete/addItem/removeItem chamam bustCache() -> rc.del(), o que
// dispara a conexão Redis preguiçosa do cache.js — sem fechar explicitamente,
// o processo de teste nunca sai (retryStrategy padrão do ioredis).
after(closeSharedConnections);

describe("createCatalog", () => {
  test("creates a movie catalog by default, series when requested", async () => {
    const movie = await createCatalog("meus-classicos", "Meus Clássicos");
    assert.equal(movie.type, "movie");
    assert.deepEqual(movie.items, []);

    const series = await createCatalog("minhas-series", "Minhas Séries", "series");
    assert.equal(series.type, "series");
  });

  test("rejects an invalid slug", async () => {
    await assert.rejects(() => createCatalog("Slug Inválido!", "Nome"));
  });

  test("rejects a duplicate id", async () => {
    await createCatalog("duplicado", "Original");
    await assert.rejects(() => createCatalog("duplicado", "Outro"));
  });

  test("assigns an increasing order to each new catalog", async () => {
    const before = await listCatalogs();
    const created = await createCatalog(`ordem-${before.length}`, "Ordem");
    assert.equal(created.order, before.length);
  });
});

describe("getCatalog / listCatalogs", () => {
  test("getCatalog returns null for an unknown id", async () => {
    assert.equal(await getCatalog("nao-existe"), null);
  });

  test("listCatalogs includes every created catalog", async () => {
    await createCatalog("cat-listagem", "Listagem");
    const all = await listCatalogs();
    assert.ok(all.some(c => c.id === "cat-listagem"));
  });
});

describe("renameCatalog / deleteCatalog", () => {
  test("renames an existing catalog", async () => {
    await createCatalog("cat-renomear", "Nome Original");
    const renamed = await renameCatalog("cat-renomear", "Nome Novo");
    assert.equal(renamed.name, "Nome Novo");
  });

  test("returns null when renaming an unknown catalog", async () => {
    assert.equal(await renameCatalog("nao-existe", "X"), null);
  });

  test("deletes a catalog", async () => {
    await createCatalog("cat-deletar", "Deletar");
    await deleteCatalog("cat-deletar");
    assert.equal(await getCatalog("cat-deletar"), null);
  });
});

describe("addCatalogItem / removeCatalogItem", () => {
  test("adds a valid IMDb id and de-dupes repeats", async () => {
    await createCatalog("cat-itens", "Itens");
    await addCatalogItem("cat-itens", "tt1234567");
    const again = await addCatalogItem("cat-itens", "tt1234567");
    assert.equal(again.items.length, 1);
  });

  test("rejects a malformed IMDb id", async () => {
    await createCatalog("cat-itens-invalido", "Itens Inválidos");
    await assert.rejects(() => addCatalogItem("cat-itens-invalido", "not-an-imdb-id"));
  });

  test("removeCatalogItem removes only the matching item", async () => {
    await createCatalog("cat-remover", "Remover");
    await addCatalogItem("cat-remover", "tt1111111");
    await addCatalogItem("cat-remover", "tt2222222");
    const after = await removeCatalogItem("cat-remover", "tt1111111");
    assert.deepEqual(after.items.map(i => i.imdbId), ["tt2222222"]);
  });

  test("throws when the target catalog does not exist", async () => {
    await assert.rejects(() => addCatalogItem("nao-existe", "tt1234567"));
    await assert.rejects(() => removeCatalogItem("nao-existe", "tt1234567"));
  });
});
