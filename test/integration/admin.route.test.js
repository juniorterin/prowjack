"use strict";
const { setEnv, clearProjectCache } = require("../helpers/testEnv");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { startRouterApp } = require("../helpers/testApp");

function loadAdminRouter(adminPassword) {
  const restore = setEnv({ ADMIN_PASSWORD: adminPassword });
  clearProjectCache();
  const router = require("../../routes/admin");
  return { router, restore };
}

describe("GET /admin without ADMIN_PASSWORD configured", () => {
  test("the whole /admin area is disabled (503)", async (t) => {
    const { router, restore } = loadAdminRouter("");
    t.after(restore);
    const app = await startRouterApp(router);
    t.after(() => app.close());

    const res = await fetch(`${app.baseUrl}/admin`, { redirect: "manual" });
    assert.equal(res.status, 503);
  });
});

describe("admin login/logout session lifecycle", () => {
  test("redirect when unauthenticated, reject wrong password, accept the right one, then log out", async (t) => {
    const { router, restore } = loadAdminRouter("s3cr3t-admin");
    t.after(restore);
    const app = await startRouterApp(router);
    t.after(() => app.close());

    const unauthed = await fetch(`${app.baseUrl}/admin`, { redirect: "manual" });
    assert.equal(unauthed.status, 302);
    assert.equal(unauthed.headers.get("location"), "/admin/login");

    const wrongLogin = await fetch(`${app.baseUrl}/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    });
    assert.equal(wrongLogin.status, 401);

    const goodLogin = await fetch(`${app.baseUrl}/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "s3cr3t-admin" }),
    });
    assert.equal(goodLogin.status, 200);
    const cookie = goodLogin.headers.get("set-cookie").split(";")[0];

    const authed = await fetch(`${app.baseUrl}/admin`, { headers: { cookie } });
    assert.equal(authed.status, 200);

    const logout = await fetch(`${app.baseUrl}/admin/logout`, { method: "POST", headers: { cookie } });
    assert.equal(logout.status, 200);
    const clearedCookie = logout.headers.get("set-cookie").split(";")[0];

    const afterLogout = await fetch(`${app.baseUrl}/admin`, { headers: { cookie: clearedCookie }, redirect: "manual" });
    assert.equal(afterLogout.status, 302);
  });
});
