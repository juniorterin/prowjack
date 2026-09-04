"use strict";
require("../helpers/testEnv");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const prefs = require("../../prefs");

describe("defaultPrefs", () => {
  test("returns a sane baseline", () => {
    const d = prefs.defaultPrefs();
    assert.deepEqual(d.indexers, ["all"]);
    assert.deepEqual(d.categories, ["movie", "series"]);
    assert.equal(d.priorityLang, "pt-br");
    assert.equal(d.maxResults, 20);
  });
});

describe("sanitizeUserPrefs", () => {
  test("fills in defaults for an empty input", () => {
    const out = prefs.sanitizeUserPrefs({});
    assert.deepEqual(out.indexers, ["all"]);
    assert.deepEqual(out.categories, ["movie", "series"]);
    assert.equal(out.skipBadReleases, true);
    assert.equal(out.dedupe, true);
  });

  test("clamps numeric fields into their valid range", () => {
    const out = prefs.sanitizeUserPrefs({ maxResults: 99999, slowThreshold: -5 });
    assert.equal(out.maxResults, 100);
    assert.equal(out.slowThreshold, 1000);
  });

  test("drops categories outside the allowed set and de-dupes", () => {
    const out = prefs.sanitizeUserPrefs({ categories: ["movie", "movie", "bogus", "anime"] });
    assert.deepEqual(out.categories, ["movie", "anime"]);
  });

  test("rejects an unknown priorityLang, keeping the default", () => {
    assert.equal(prefs.sanitizeUserPrefs({ priorityLang: "xx" }).priorityLang, "pt-br");
    assert.equal(prefs.sanitizeUserPrefs({ priorityLang: "" }).priorityLang, "");
  });

  test("accepts a comma-separated indexers string as well as an array", () => {
    const out = prefs.sanitizeUserPrefs({ indexers: "a, b ,c" });
    assert.deepEqual(out.indexers, ["a", "b", "c"]);
  });

  test("strips control characters and enforces max length on free-text fields", () => {
    const out = prefs.sanitizeUserPrefs({ keywordBoost: "hello\x01world" + "x".repeat(600) });
    assert.equal(out.keywordBoost.includes("\x01"), false);
    assert.ok(out.keywordBoost.length <= 500);
  });

  test("only accepts a jackett override when the URL is valid", () => {
    const bad = prefs.sanitizeUserPrefs({ jackett: { url: "not a url", key: "k" } });
    assert.equal(bad.jackett, undefined);
    const good = prefs.sanitizeUserPrefs({ jackett: { url: "https://prowlarr.example.com/", key: "k" } });
    assert.equal(good.jackett.url, "https://prowlarr.example.com");
  });

  test("ignores non-object input instead of throwing", () => {
    const out = prefs.sanitizeUserPrefs("not an object");
    assert.deepEqual(out.indexers, ["all"]);
  });

  test("falls back to defaults for an unknown sortGroupBy/sortOrderBy", () => {
    const out = prefs.sanitizeUserPrefs({ sortGroupBy: "bogus", sortOrderBy: "bogus" });
    assert.equal(out.sortGroupBy, prefs.DEFAULT_GROUP_BY);
    assert.equal(out.sortOrderBy, prefs.DEFAULT_ORDER_BY);
  });

  test("accepts a valid sortGroupBy/sortOrderBy pair", () => {
    const out = prefs.sanitizeUserPrefs({ sortGroupBy: "resolution", sortOrderBy: "size" });
    assert.equal(out.sortGroupBy, "resolution");
    assert.equal(out.sortOrderBy, "size");
  });

  test("drops excludeFilters keys outside the known set", () => {
    const out = prefs.sanitizeUserPrefs({ excludeFilters: ["cam", "bogus", "4k"] });
    assert.deepEqual(out.excludeFilters, ["cam", "4k"]);
  });

  test("keeps videoSizeLimit as free text, capped in length", () => {
    const out = prefs.sanitizeUserPrefs({ videoSizeLimit: "2GB" });
    assert.equal(out.videoSizeLimit, "2GB");
  });
});

describe("normalizePrefs", () => {
  test("merges over the defaults and fixes an empty addonName", () => {
    const out = prefs.normalizePrefs({ maxResults: 5 });
    assert.equal(out.maxResults, 5);
    assert.equal(out.addonName, "TorrESMIN");
    assert.deepEqual(out.indexers, ["all"]);
  });

  test("strips legacy [TAG] suffixes and the word PRO from addonName", () => {
    const out = prefs.normalizePrefs({ addonName: "MyAddon [TB+RD] PRO" });
    assert.equal(out.addonName, "MyAddon");
  });

  test("resets indexers to ['all'] if given an empty array", () => {
    const out = prefs.normalizePrefs({ indexers: [] });
    assert.deepEqual(out.indexers, ["all"]);
  });

  test("derives sortBy from sortGroupBy/sortOrderBy, keyword-boost always first", () => {
    const out = prefs.normalizePrefs({ sortGroupBy: "resolution", sortOrderBy: "size" });
    assert.deepEqual(out.sortBy, ["keyword", "resolution", "size", "language", "quality", "seeders", "indexer"]);
  });

  test("defaults sortGroupBy/sortOrderBy and derives sortBy when unset", () => {
    const out = prefs.normalizePrefs({});
    assert.equal(out.sortGroupBy, "language");
    assert.equal(out.sortOrderBy, "seeders");
    assert.deepEqual(out.sortBy, ["keyword", "language", "seeders", "resolution", "quality", "size", "indexer"]);
  });

  test("recomputes sortBy even if a raw sortBy array is passed in directly", () => {
    const out = prefs.normalizePrefs({ sortBy: ["seeders"] });
    assert.deepEqual(out.sortBy, ["keyword", "language", "seeders", "resolution", "quality", "size", "indexer"]);
  });

  test("ignores excludeFilters keys outside the known set and computes videoSizeLimitBytes", () => {
    const out = prefs.normalizePrefs({ excludeFilters: ["cam", "bogus"], videoSizeLimit: "2GB" });
    assert.deepEqual(out.excludeFilters, ["cam"]);
    assert.equal(out.videoSizeLimitBytes, 2e9);
  });
});

describe("parseSizeToBytes", () => {
  test("parses GB/MB/KB suffixes, case-insensitively", () => {
    assert.equal(prefs.parseSizeToBytes("2GB"), 2e9);
    assert.equal(prefs.parseSizeToBytes("500mb"), 500e6);
    assert.equal(prefs.parseSizeToBytes("1.5 GB"), 1.5e9);
    assert.equal(prefs.parseSizeToBytes("100kb"), 100e3);
  });

  test("defaults to GB when no unit is given", () => {
    assert.equal(prefs.parseSizeToBytes("2"), 2e9);
  });

  test("returns 0 for empty, garbage or non-positive input", () => {
    assert.equal(prefs.parseSizeToBytes(""), 0);
    assert.equal(prefs.parseSizeToBytes(undefined), 0);
    assert.equal(prefs.parseSizeToBytes("not a size"), 0);
    assert.equal(prefs.parseSizeToBytes("-5GB"), 0);
    assert.equal(prefs.parseSizeToBytes("0GB"), 0);
  });
});

describe("validateServiceUrl / safeServiceUrl", () => {
  test("accepts http(s) URLs without embedded credentials", () => {
    assert.equal(prefs.validateServiceUrl("https://prowlarr.example.com/"), "https://prowlarr.example.com");
  });

  test("rejects non-http(s) protocols", () => {
    assert.throws(() => prefs.validateServiceUrl("ftp://example.com"));
  });

  test("rejects URLs carrying credentials", () => {
    assert.throws(() => prefs.validateServiceUrl("https://user:pass@example.com"));
  });

  test("safeServiceUrl swallows the error and returns an empty string", () => {
    assert.equal(prefs.safeServiceUrl("ftp://example.com"), "");
    assert.equal(prefs.safeServiceUrl(""), "");
  });
});
