"use strict";
const { setEnv, clearProjectCache, closeSharedConnections } = require("../helpers/testEnv");
const { test, describe, after } = require("node:test");
const assert = require("node:assert/strict");
const { startRouterApp } = require("../helpers/testApp");

function loadAdminApi() {
  const restore = setEnv({ ADMIN_PASSWORD: "s3cr3t-admin" });
  // Fecha a conexão Redis da instância anterior de cache.js antes de
  // descartá-la (clearProjectCache recria o módulo do zero a cada chamada) —
  // caso contrário cada instância órfã fica retentando conexão pra sempre.
  closeSharedConnections();
  clearProjectCache();
  const adminAuth = require("../../adminAuth");
  const adminApiRouter = require("../../routes/adminApi");
  return { adminAuth, adminApiRouter, restore };
}

after(closeSharedConnections);

describe("admin API auth gate", () => {
  test("rejects requests without a session cookie", async (t) => {
    const { adminApiRouter, restore } = loadAdminApi();
    t.after(restore);
    const app = await startRouterApp(adminApiRouter);
    t.after(() => app.close());

    const res = await fetch(`${app.baseUrl}/admin/api/keys`);
    assert.equal(res.status, 401);
  });
});

describe("access key management end-to-end", () => {
  test("list, create, patch, reset-ip and delete an access key through the admin API", async (t) => {
    const { adminAuth, adminApiRouter, restore } = loadAdminApi();
    t.after(restore);
    const app = await startRouterApp(adminApiRouter);
    t.after(() => app.close());

    const cookie = adminAuth.createSessionCookie({ headers: {}, protocol: "http" }).split(";")[0];
    const authed = (path, init = {}) => fetch(`${app.baseUrl}${path}`, {
      ...init,
      headers: { cookie, "content-type": "application/json", ...(init.headers || {}) },
    });

    const emptyList = await authed("/admin/api/keys");
    assert.equal(emptyList.status, 200);
    assert.deepEqual((await emptyList.json()).keys, []);

    const createRes = await authed("/admin/api/keys", { method: "POST", body: JSON.stringify({ label: "Minha chave" }) });
    assert.equal(createRes.status, 200);
    const { key } = await createRes.json();
    assert.equal(key.label, "Minha chave");
    assert.equal(key.ipLimited, true);

    const patchRes = await authed(`/admin/api/keys/${key.id}`, { method: "PATCH", body: JSON.stringify({ ipLimited: false }) });
    assert.equal(patchRes.status, 200);
    assert.equal((await patchRes.json()).key.ipLimited, false);

    const resetRes = await authed(`/admin/api/keys/${key.id}/reset-ip`, { method: "POST", body: "{}" });
    assert.equal(resetRes.status, 200);

    const deleteRes = await authed(`/admin/api/keys/${key.id}`, { method: "DELETE" });
    assert.equal(deleteRes.status, 200);
    assert.deepEqual(await deleteRes.json(), { ok: true });
  });

  test("rejects creating a key without a label", async (t) => {
    const { adminAuth, adminApiRouter, restore } = loadAdminApi();
    t.after(restore);
    const app = await startRouterApp(adminApiRouter);
    t.after(() => app.close());
    const cookie = adminAuth.createSessionCookie({ headers: {}, protocol: "http" }).split(";")[0];

    const res = await fetch(`${app.baseUrl}/admin/api/keys`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });
});

describe("catalog management end-to-end", () => {
  test("create, add/remove an item, rename and delete a curated catalog", async (t) => {
    const { adminAuth, adminApiRouter, restore } = loadAdminApi();
    t.after(restore);
    const app = await startRouterApp(adminApiRouter);
    t.after(() => app.close());
    const cookie = adminAuth.createSessionCookie({ headers: {}, protocol: "http" }).split(";")[0];
    const authed = (path, init = {}) => fetch(`${app.baseUrl}${path}`, {
      ...init,
      headers: { cookie, "content-type": "application/json", ...(init.headers || {}) },
    });

    const createRes = await authed("/admin/api/catalogs", { method: "POST", body: JSON.stringify({ id: "meus-classicos", name: "Meus Clássicos", type: "movie" }) });
    assert.equal(createRes.status, 200);

    const addItemRes = await authed("/admin/api/catalogs/meus-classicos/items", { method: "POST", body: JSON.stringify({ imdbId: "tt1234567" }) });
    assert.equal(addItemRes.status, 200);
    assert.equal((await addItemRes.json()).catalog.items.length, 1);

    const renameRes = await authed("/admin/api/catalogs/meus-classicos", { method: "PATCH", body: JSON.stringify({ name: "Clássicos" }) });
    assert.equal(renameRes.status, 200);
    assert.equal((await renameRes.json()).catalog.name, "Clássicos");

    const removeItemRes = await authed("/admin/api/catalogs/meus-classicos/items/tt1234567", { method: "DELETE" });
    assert.equal(removeItemRes.status, 200);
    assert.equal((await removeItemRes.json()).catalog.items.length, 0);

    const deleteRes = await authed("/admin/api/catalogs/meus-classicos", { method: "DELETE" });
    assert.equal(deleteRes.status, 200);
  });
});
