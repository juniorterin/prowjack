"use strict";
const { setEnv, clearProjectCache } = require("../helpers/testEnv");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const routeHelpers = require("../../routeHelpers");

describe("checkRateLimit", () => {
  test("allows requests under the threshold and blocks once it's exceeded", () => {
    const ip = `1.2.3.${Math.floor(Math.random() * 1e6)}`; // chave isolada por teste
    for (let i = 0; i < 100; i++) {
      assert.equal(routeHelpers.checkRateLimit(ip), true, `request ${i} should pass`);
    }
    assert.equal(routeHelpers.checkRateLimit(ip), false);
  });
});

describe("getClientIp", () => {
  test("prefers CF-Connecting-IP over X-Forwarded-For (Cloudflare Tunnel)", () => {
    const req = { headers: { "cf-connecting-ip": "5.5.5.5", "x-forwarded-for": "9.9.9.9, 1.1.1.1" }, socket: { remoteAddress: "10.0.0.1" } };
    assert.equal(routeHelpers.getClientIp(req), "5.5.5.5");
  });

  test("falls back to the first X-Forwarded-For entry when CF header is absent", () => {
    const req = { headers: { "x-forwarded-for": "9.9.9.9, 1.1.1.1" }, socket: { remoteAddress: "10.0.0.1" } };
    assert.equal(routeHelpers.getClientIp(req), "9.9.9.9");
  });

  test("falls back to the socket address without any proxy header", () => {
    const req = { headers: {}, socket: { remoteAddress: "10.0.0.1" } };
    assert.equal(routeHelpers.getClientIp(req), "10.0.0.1");
  });
});

describe("getPublicBase", () => {
  test("uses forwarded proto/host behind a reverse proxy", () => {
    const req = {
      headers: { "x-forwarded-proto": "https", "x-forwarded-host": "addon.example.com" },
      protocol: "http",
      get: () => "internal-host",
    };
    assert.equal(routeHelpers.getPublicBase(req), "https://addon.example.com");
  });

  test("falls back to req.protocol/host when nothing is forwarded", () => {
    const req = { headers: {}, protocol: "http", get: name => (name === "host" ? "localhost:7014" : undefined) };
    assert.equal(routeHelpers.getPublicBase(req), "http://localhost:7014");
  });

  test("prefers ADDON_PUBLIC_URL when configured", () => {
    const restore = setEnv({ ADDON_PUBLIC_URL: "https://public.example.com/" });
    clearProjectCache();
    const fresh = require("../../routeHelpers");
    const req = { headers: {}, protocol: "http", get: () => "ignored" };
    assert.equal(fresh.getPublicBase(req), "https://public.example.com");
    restore();
  });
});

describe("getRequestAccessToken / hasAdminAccess", () => {
  test("reads the token from header or query string", () => {
    assert.equal(routeHelpers.getRequestAccessToken({ headers: { "x-access-token": "abc" }, query: {} }), "abc");
    assert.equal(routeHelpers.getRequestAccessToken({ headers: {}, query: { token: "xyz" } }), "xyz");
    assert.equal(routeHelpers.getRequestAccessToken({ headers: {}, query: {} }), "");
  });

  test("hasAdminAccess is open when ACCESS_TOKEN is not configured", () => {
    assert.equal(routeHelpers.hasAdminAccess({ headers: {}, query: {} }), true);
  });

  test("hasAdminAccess requires a matching token when ACCESS_TOKEN is configured", () => {
    const restore = setEnv({ ACCESS_TOKEN: "s3cr3t" });
    clearProjectCache();
    const fresh = require("../../routeHelpers");
    assert.equal(fresh.hasAdminAccess({ headers: { "x-access-token": "s3cr3t" }, query: {} }), true);
    assert.equal(fresh.hasAdminAccess({ headers: { "x-access-token": "wrong" }, query: {} }), false);
    assert.equal(fresh.hasAdminAccess({ headers: {}, query: {} }), false);
    restore();
  });
});

describe("isPtBrRequest", () => {
  test("treats pt/pt-BR/pt-PT as the highest-priority tag as Portuguese", () => {
    assert.equal(routeHelpers.isPtBrRequest({ headers: { "accept-language": "pt-BR,pt;q=0.9,en;q=0.8" } }), true);
    assert.equal(routeHelpers.isPtBrRequest({ headers: { "accept-language": "pt-PT" } }), true);
    assert.equal(routeHelpers.isPtBrRequest({ headers: { "accept-language": "pt" } }), true);
  });

  test("is false for a non-Portuguese primary tag, even if pt appears later", () => {
    assert.equal(routeHelpers.isPtBrRequest({ headers: { "accept-language": "en-US,en;q=0.9,pt;q=0.8" } }), false);
  });

  test("is false when no Accept-Language header is sent", () => {
    assert.equal(routeHelpers.isPtBrRequest({ headers: {} }), false);
  });
});

describe("requireAdminAccess middleware", () => {
  test("calls next() when access is allowed", () => {
    let called = false;
    routeHelpers.requireAdminAccess({ headers: {}, query: {} }, {}, () => { called = true; });
    assert.equal(called, true);
  });

  test("responds 403 when access is denied", () => {
    const restore = setEnv({ ACCESS_TOKEN: "s3cr3t" });
    clearProjectCache();
    const fresh = require("../../routeHelpers");
    let statusCode = null;
    let body = null;
    const res = {
      status(code) { statusCode = code; return this; },
      json(payload) { body = payload; },
    };
    fresh.requireAdminAccess({ headers: {}, query: {} }, res, () => assert.fail("next() should not be called"));
    assert.equal(statusCode, 403);
    assert.equal(body.ok, false);
    restore();
  });
});

describe("extractScrapIndexer / scrapExternalDescription", () => {
  test("extracts the indexer name marked with the gear emoji", () => {
    assert.equal(routeHelpers.extractScrapIndexer("🔗 13 ⚙️ Comando Torrents"), "Comando Torrents");
    assert.equal(routeHelpers.extractScrapIndexer("no marker here"), "");
  });

  test("rebuilds a normalized description with seeds, indexer, language and source", () => {
    const stream = { title: "Movie 1080p\n🌱 42\n⚙️ SomeIndexer\n🌐 PT-BR" };
    const desc = routeHelpers.scrapExternalDescription(stream, "Torrentio");
    assert.match(desc, /🌱 42/);
    assert.match(desc, /⚙️ SomeIndexer/);
    assert.match(desc, /🌐 PT-BR/);
    assert.match(desc, /📡 Torrentio/);
  });
});

describe("isPrivateTrackerCandidate", () => {
  test("treats a resolved buffer's private flag as authoritative", () => {
    const buf = Buffer.from("d7:privatei1ee", "latin1");
    assert.equal(routeHelpers.isPrivateTrackerCandidate({}, { buffer: buf }), true);
  });

  test("treats known public trackers as public", () => {
    assert.equal(routeHelpers.isPrivateTrackerCandidate({ _indexerName: "1337x" }), false);
  });

  test("treats an unknown indexer with an HTTP download link as private", () => {
    assert.equal(routeHelpers.isPrivateTrackerCandidate({ _indexerName: "SomePrivateTracker", Link: "https://example.com/x/download" }), true);
  });

  test("a magnet link is never treated as private", () => {
    assert.equal(routeHelpers.isPrivateTrackerCandidate({ _indexerName: "SomePrivateTracker", MagnetUri: "magnet:?xt=urn:btih:abc" }), false);
  });
});
