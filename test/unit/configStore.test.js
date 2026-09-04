"use strict";
require("../helpers/testEnv"); // isola CONFIG_DATA_DIR num diretório temporário
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { resolvePrefs, shouldUseConfigDb, saveStoredConfig, decodeUserCfg, loadStoredUserCfg } = require("../../configStore");

function toDirectCfg(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("shouldUseConfigDb", () => {
  test("is false without a configured database URL", () => {
    assert.equal(shouldUseConfigDb(), false);
  });
});

describe("decodeUserCfg", () => {
  test("decodes a base64url-encoded JSON object", () => {
    const encoded = toDirectCfg({ maxResults: 7 });
    assert.deepEqual(decodeUserCfg(encoded), { maxResults: 7 });
  });

  test("rejects arrays, garbage and oversized strings", () => {
    assert.equal(decodeUserCfg(Buffer.from("[1,2,3]").toString("base64")), null);
    assert.equal(decodeUserCfg("not-base64-json!!"), null);
    assert.equal(decodeUserCfg("a".repeat(10001)), null);
    assert.equal(decodeUserCfg(""), null);
  });
});

describe("saveStoredConfig / loadStoredUserCfg (file backend)", () => {
  test("round-trips prefs through the file store", async () => {
    const prefs = { maxResults: 33, addonName: "Teste" };
    const id = await saveStoredConfig(prefs);
    assert.match(id, /^cfg_[A-Za-z0-9_-]{20,80}$/);

    const loaded = await loadStoredUserCfg(id);
    assert.deepEqual(loaded, prefs);
  });

  test("saving the same prefs twice returns the same id (content-addressed)", async () => {
    const prefs = { maxResults: 12 };
    const id1 = await saveStoredConfig(prefs);
    const id2 = await saveStoredConfig(prefs);
    assert.equal(id1, id2);
  });

  test("rejects malformed ids without touching the store", async () => {
    assert.equal(await loadStoredUserCfg("cfg_short"), null);
    assert.equal(await loadStoredUserCfg("not-a-cfg-id"), null);
    assert.equal(await loadStoredUserCfg(""), null);
  });

  test("a well-formed but unknown id resolves to null", async () => {
    assert.equal(await loadStoredUserCfg(`cfg_${"a".repeat(32)}`), null);
  });
});

describe("resolvePrefs", () => {
  test("returns full defaults with no config at all", async () => {
    const prefs = await resolvePrefs(undefined);
    assert.equal(prefs.addonName, "TorrESMIN");
    assert.deepEqual(prefs.indexers, ["all"]);
  });

  test("resolves a stored cfg_ id saved earlier", async () => {
    const id = await saveStoredConfig({ maxResults: 55 });
    const prefs = await resolvePrefs(id);
    assert.equal(prefs.maxResults, 55);
  });

  test("resolves a directly base64url-encoded config (never persisted)", async () => {
    const encoded = toDirectCfg({ maxResults: 9, addonName: "Direto" });
    const prefs = await resolvePrefs(encoded);
    assert.equal(prefs.maxResults, 9);
    assert.equal(prefs.addonName, "Direto");
  });

  test("falls back to defaults for an unknown cfg_ id", async () => {
    const prefs = await resolvePrefs(`cfg_${"b".repeat(32)}`);
    assert.equal(prefs.addonName, "TorrESMIN");
  });
});
