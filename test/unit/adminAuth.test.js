"use strict";
const { setEnv, clearProjectCache } = require("../helpers/testEnv");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

// adminAuth lê ENV.adminPassword (definido em constants.js) no momento de cada
// chamada, mas ENV é um objeto calculado uma única vez no require — por isso
// cada cenário abaixo troca a env e força um require limpo.
function loadFresh(envOverrides) {
  const restore = setEnv(envOverrides);
  clearProjectCache();
  return { mod: require("../../adminAuth"), restore };
}

describe("verifyAdminPassword", () => {
  test("always rejects when ADMIN_PASSWORD is not configured", () => {
    const { mod, restore } = loadFresh({ ADMIN_PASSWORD: "" });
    assert.equal(mod.verifyAdminPassword("anything"), false);
    assert.equal(mod.verifyAdminPassword(""), false);
    restore();
  });

  test("accepts only the exact configured password", () => {
    const { mod, restore } = loadFresh({ ADMIN_PASSWORD: "s3cr3t" });
    assert.equal(mod.verifyAdminPassword("s3cr3t"), true);
    assert.equal(mod.verifyAdminPassword("S3cr3t"), false);
    assert.equal(mod.verifyAdminPassword(""), false);
    restore();
  });
});

describe("session cookie lifecycle", () => {
  test("a freshly created session cookie verifies successfully", () => {
    const { mod, restore } = loadFresh({ ADMIN_PASSWORD: "s3cr3t" });
    const setCookieHeader = mod.createSessionCookie({ headers: {}, protocol: "http" });
    const cookiePair = setCookieHeader.split(";")[0]; // "pj_admin_session=<token>"
    const req = { headers: { cookie: cookiePair } };
    assert.equal(mod.verifyAdminSession(req), true);
    restore();
  });

  test("a request without a cookie fails verification", () => {
    const { mod, restore } = loadFresh({ ADMIN_PASSWORD: "s3cr3t" });
    assert.equal(mod.verifyAdminSession({ headers: {} }), false);
    restore();
  });

  test("a tampered cookie fails verification", () => {
    const { mod, restore } = loadFresh({ ADMIN_PASSWORD: "s3cr3t" });
    const cookiePair = mod.createSessionCookie({ headers: {}, protocol: "http" }).split(";")[0];
    const [name, token] = cookiePair.split("=");
    const tampered = `${name}=${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`;
    assert.equal(mod.verifyAdminSession({ headers: { cookie: tampered } }), false);
    restore();
  });

  test("clearSessionCookie produces a cookie that no longer verifies", () => {
    const { mod, restore } = loadFresh({ ADMIN_PASSWORD: "s3cr3t" });
    const cleared = mod.clearSessionCookie({ headers: {}, protocol: "http" }).split(";")[0];
    assert.equal(mod.verifyAdminSession({ headers: { cookie: cleared } }), false);
    restore();
  });

  test("session is invalid without ADMIN_PASSWORD even with a well-formed cookie", () => {
    const withPass = loadFresh({ ADMIN_PASSWORD: "s3cr3t" });
    const cookiePair = withPass.mod.createSessionCookie({ headers: {}, protocol: "http" }).split(";")[0];
    withPass.restore();

    const { mod, restore } = loadFresh({ ADMIN_PASSWORD: "" });
    assert.equal(mod.verifyAdminSession({ headers: { cookie: cookiePair } }), false);
    restore();
  });
});

describe("requireAdminSession / requireAdminPage middlewares", () => {
  test("requireAdminSession returns 503 when ADMIN_PASSWORD is unset", () => {
    const { mod, restore } = loadFresh({ ADMIN_PASSWORD: "" });
    let statusCode = null;
    const res = { status(c) { statusCode = c; return this; }, json() {} };
    mod.requireAdminSession({ headers: {} }, res, () => assert.fail("next() should not run"));
    assert.equal(statusCode, 503);
    restore();
  });

  test("requireAdminSession returns 401 without a valid session", () => {
    const { mod, restore } = loadFresh({ ADMIN_PASSWORD: "s3cr3t" });
    let statusCode = null;
    const res = { status(c) { statusCode = c; return this; }, json() {} };
    mod.requireAdminSession({ headers: {} }, res, () => assert.fail("next() should not run"));
    assert.equal(statusCode, 401);
    restore();
  });

  test("requireAdminSession calls next() with a valid session", () => {
    const { mod, restore } = loadFresh({ ADMIN_PASSWORD: "s3cr3t" });
    const cookiePair = mod.createSessionCookie({ headers: {}, protocol: "http" }).split(";")[0];
    let called = false;
    mod.requireAdminSession({ headers: { cookie: cookiePair } }, {}, () => { called = true; });
    assert.equal(called, true);
    restore();
  });

  test("requireAdminPage redirects to /admin/login without a valid session", () => {
    const { mod, restore } = loadFresh({ ADMIN_PASSWORD: "s3cr3t" });
    let redirectedTo = null;
    const res = { redirect: to => { redirectedTo = to; } };
    mod.requireAdminPage({ headers: {} }, res, () => assert.fail("next() should not run"));
    assert.equal(redirectedTo, "/admin/login");
    restore();
  });
});
