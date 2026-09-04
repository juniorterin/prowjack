"use strict";
require("../helpers/testEnv"); // isola CONFIG_DATA_DIR num diretório temporário
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const {
  createAccessKey,
  listAccessKeys,
  getAccessKey,
  deleteAccessKey,
  resetAccessKeyIp,
  updateAccessKeySettings,
  checkAccessKey,
} = require("../../accessKeys");

const reqFrom = ip => ({ headers: {}, socket: { remoteAddress: ip } });

describe("createAccessKey", () => {
  test("defaults to IP-limited with a ~30-day expiry", async () => {
    const key = await createAccessKey("Minha chave");
    assert.equal(key.label, "Minha chave");
    assert.equal(key.ipLimited, true);
    assert.equal(key.ip, null);
    const thirtyDays = 30 * 24 * 3600 * 1000;
    assert.ok(Math.abs(key.expiresAt - (Date.now() + thirtyDays)) < 5000);
  });

  test("an explicit null expiresAt means the key never expires", async () => {
    const key = await createAccessKey("Sem validade", { expiresAt: null });
    assert.equal(key.expiresAt, null);
  });

  test("ipLimited can be disabled at creation", async () => {
    const key = await createAccessKey("Sem trava de IP", { ipLimited: false });
    assert.equal(key.ipLimited, false);
  });
});

describe("listAccessKeys / getAccessKey / deleteAccessKey", () => {
  test("created keys are listable and individually retrievable, then deletable", async () => {
    const key = await createAccessKey("Temp key");
    const list = await listAccessKeys();
    assert.ok(list.some(k => k.id === key.id));

    const fetched = await getAccessKey(key.id);
    assert.equal(fetched.id, key.id);

    const deleted = await deleteAccessKey(key.id);
    assert.equal(deleted, true);
    assert.equal(await getAccessKey(key.id), null);
  });

  test("getAccessKey returns null for an unknown id", async () => {
    assert.equal(await getAccessKey("key_does_not_exist"), null);
  });
});

describe("checkAccessKey", () => {
  test("denies when prefs carry no access key", async () => {
    assert.equal(await checkAccessKey({}, reqFrom("1.1.1.1")), false);
  });

  test("denies an unknown key id", async () => {
    assert.equal(await checkAccessKey({ accessKey: "key_bogus" }, reqFrom("1.1.1.1")), false);
  });

  test("denies an expired key", async () => {
    const key = await createAccessKey("Expirada", { expiresAt: Date.now() - 1000 });
    assert.equal(await checkAccessKey({ accessKey: key.id }, reqFrom("1.1.1.1")), false);
  });

  test("IP-limited key: locks to the first IP that uses it, then rejects other IPs", async () => {
    const key = await createAccessKey("Trava IP", { expiresAt: null });
    assert.equal(await checkAccessKey({ accessKey: key.id }, reqFrom("1.1.1.1")), true);
    assert.equal(await checkAccessKey({ accessKey: key.id }, reqFrom("1.1.1.1")), true);
    assert.equal(await checkAccessKey({ accessKey: key.id }, reqFrom("2.2.2.2")), false);
  });

  test("resetAccessKeyIp unlocks the key for a new IP", async () => {
    const key = await createAccessKey("Reset IP", { expiresAt: null });
    await checkAccessKey({ accessKey: key.id }, reqFrom("1.1.1.1"));
    await resetAccessKeyIp(key.id);
    assert.equal(await checkAccessKey({ accessKey: key.id }, reqFrom("9.9.9.9")), true);
  });

  test("ipLimited=false accepts requests from any IP without locking", async () => {
    const key = await createAccessKey("Sem trava", { expiresAt: null, ipLimited: false });
    assert.equal(await checkAccessKey({ accessKey: key.id }, reqFrom("1.1.1.1")), true);
    assert.equal(await checkAccessKey({ accessKey: key.id }, reqFrom("2.2.2.2")), true);
  });
});

describe("updateAccessKeySettings", () => {
  test("disabling ipLimited also clears any existing IP lock", async () => {
    const key = await createAccessKey("Muda config", { expiresAt: null });
    await checkAccessKey({ accessKey: key.id }, reqFrom("1.1.1.1"));

    const updated = await updateAccessKeySettings(key.id, { ipLimited: false });
    assert.equal(updated.ipLimited, false);
    assert.equal(updated.ip, null);
    assert.equal(await checkAccessKey({ accessKey: key.id }, reqFrom("2.2.2.2")), true);
  });

  test("returns null for an unknown key id", async () => {
    assert.equal(await updateAccessKeySettings("key_missing", { ipLimited: false }), null);
  });
});
