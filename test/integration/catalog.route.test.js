"use strict";
require("../helpers/testEnv");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { startRouterApp } = require("../helpers/testApp");
const catalogRouter = require("../../routes/catalog");

// Só cobrimos os ramos que não dependem de rede real (Cinemeta/TMDB) — o
// endpoint faz fetch externo assim que o id é um catálogo curado válido.
describe("GET /:userConfig/catalog/:type/:id.json", () => {
  test("returns an empty list for a non-curated catalog id", async (t) => {
    const app = await startRouterApp(catalogRouter);
    t.after(() => app.close());

    const res = await fetch(`${app.baseUrl}/cfg_x/catalog/movie/top250.json`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { metas: [] });
  });

  test("returns an empty list for an unknown curated catalog slug", async (t) => {
    const app = await startRouterApp(catalogRouter);
    t.after(() => app.close());

    const res = await fetch(`${app.baseUrl}/cfg_x/catalog/movie/curated_does_not_exist.json`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { metas: [] });
  });
});
