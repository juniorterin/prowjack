"use strict";
const { setEnv, clearProjectCache } = require("../helpers/testEnv");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const constants = require("../../constants");

describe("ENV defaults", () => {
  test("falls back to sane defaults when nothing is configured", () => {
    assert.equal(constants.ENV.port, 7014);
    assert.equal(constants.ENV.jackettUrl, "http://127.0.0.1:1");
    assert.equal(constants.ENV.addonPublicUrl, "");
  });
});

describe("ENV.addonPublicUrl normalization", () => {
  test("adds https:// to a bare host and strips trailing slashes", () => {
    const restore = setEnv({ ADDON_PUBLIC_URL: "addon.example.com/" });
    clearProjectCache();
    const fresh = require("../../constants");
    assert.equal(fresh.ENV.addonPublicUrl, "https://addon.example.com");
    restore();
  });

  test("keeps an explicit protocol as-is", () => {
    const restore = setEnv({ ADDON_PUBLIC_URL: "http://addon.example.com" });
    clearProjectCache();
    const fresh = require("../../constants");
    assert.equal(fresh.ENV.addonPublicUrl, "http://addon.example.com");
    restore();
  });
});

describe("ENV.port / ENV.scrapManifests parsing", () => {
  test("parses PORT as an integer", () => {
    const restore = setEnv({ PORT: "9999" });
    clearProjectCache();
    const fresh = require("../../constants");
    assert.equal(fresh.ENV.port, 9999);
    restore();
  });

  test("splits SCRAP_MANIFEST_URLS on commas and trims blanks", () => {
    const restore = setEnv({ SCRAP_MANIFEST_URLS: "https://a.example/manifest.json, ,https://b.example/manifest.json" });
    clearProjectCache();
    const fresh = require("../../constants");
    assert.deepEqual(fresh.ENV.scrapManifests, ["https://a.example/manifest.json", "https://b.example/manifest.json"]);
    restore();
  });
});

describe("static tables", () => {
  test("BAD_RE flags cam/telesync releases", () => {
    assert.equal(constants.BAD_RE.test("Movie.2020.CAM.x264"), true);
    assert.equal(constants.BAD_RE.test("Movie.2020.1080p.x264"), false);
  });

  test("BAD_EXT_RE flags non-video container extensions", () => {
    assert.equal(constants.BAD_EXT_RE.test("archive.rar"), true);
    assert.equal(constants.BAD_EXT_RE.test("movie.mkv"), false);
  });

  test("PUBLIC_TRACKERS includes the well-known public trackers", () => {
    assert.ok(constants.PUBLIC_TRACKERS.includes("1337x"));
    assert.ok(constants.PUBLIC_TRACKERS.includes("yts"));
  });
});
