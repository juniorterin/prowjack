"use strict";
require("../helpers/testEnv");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const {
  getPreferredRssIndexers,
  rssCatalogMetaId,
  getRssItemToken,
  parseRssMetaId,
  parseRssItemId,
  extractSeriesFeedMarker,
  extractAnimeFeedMarker,
  buildRssVideos,
  findRssItemByToken,
  matchRssItemsByMarker,
} = require("../../rssHelpers");

describe("getPreferredRssIndexers", () => {
  test("prefers an explicit rssIndexers list", () => {
    assert.deepEqual(getPreferredRssIndexers({ rssIndexers: ["a", "b"] }), ["a", "b"]);
  });
  test("falls back to indexers when it doesn't include 'all'", () => {
    assert.deepEqual(getPreferredRssIndexers({ indexers: ["a"] }), ["a"]);
  });
  test("returns null (every indexer) when indexers includes 'all' or is empty", () => {
    assert.equal(getPreferredRssIndexers({ indexers: ["all"] }), null);
    assert.equal(getPreferredRssIndexers({}), null);
  });
});

describe("rssCatalogMetaId", () => {
  test("builds a rssmovie: id for movies", () => {
    assert.equal(rssCatalogMetaId({ ImdbId: "tt1234567" }, "movie"), "rssmovie:tt1234567");
  });
  test("builds a rssmeta:<type>: id for non-movie catalogs", () => {
    assert.equal(rssCatalogMetaId({ ImdbId: "tt1234567" }, "series"), "rssmeta:series:1234567");
  });
  test("returns null without a resolvable IMDb id", () => {
    assert.equal(rssCatalogMetaId({}, "movie"), null);
  });
});

describe("getRssItemToken", () => {
  test("derives a stable base64url token from InfoHash/Guid/Link", () => {
    const t1 = getRssItemToken({ InfoHash: "abc123" });
    const t2 = getRssItemToken({ InfoHash: "abc123" });
    assert.equal(t1, t2);
    assert.match(t1, /^[A-Za-z0-9_-]+$/);
  });
  test("returns null with nothing to derive a token from", () => {
    assert.equal(getRssItemToken({}), null);
  });
});

describe("parseRssMetaId / parseRssItemId", () => {
  test("parses a rssmeta: id into catalogType and metaId", () => {
    assert.deepEqual(parseRssMetaId("rssmeta:series:1234567"), { catalogType: "series", metaId: "tt1234567" });
  });
  test("returns null for ids of the wrong shape", () => {
    assert.equal(parseRssMetaId("rssmovie:tt1234567"), null);
    assert.equal(parseRssMetaId(""), null);
  });

  test("parses a rssitem: id including season/episode/token", () => {
    const parsed = parseRssItemId("rssitem:series:tt1234567:1:2:sometoken");
    assert.deepEqual(parsed, { catalogType: "series", metaId: "tt1234567", season: 1, episode: 2, token: "sometoken" });
  });
  test("returns null for a malformed rssitem: id", () => {
    assert.equal(parseRssItemId("rssitem:series:tt1234567"), null);
    assert.equal(parseRssItemId("not-an-rssitem"), null);
  });
});

describe("extractSeriesFeedMarker", () => {
  test("extracts SxxExx markers", () => {
    assert.deepEqual(extractSeriesFeedMarker("Show.S01E02.1080p"), { season: 1, episode: 2, label: "S01E02", pack: false });
  });
  test("extracts NxN markers", () => {
    const m = extractSeriesFeedMarker("Show.1x02.1080p");
    assert.equal(m.season, 1);
    assert.equal(m.episode, 2);
  });
  test("extracts a complete-season pack marker", () => {
    const m = extractSeriesFeedMarker("Show.S01.Complete.1080p");
    assert.equal(m.season, 1);
    assert.equal(m.pack, true);
  });
  test("returns null without any recognizable marker", () => {
    assert.equal(extractSeriesFeedMarker("Movie.2020.1080p"), null);
  });
});

describe("extractAnimeFeedMarker", () => {
  test("extracts a dash-episode marker", () => {
    const m = extractAnimeFeedMarker("[Group] Anime - 05 [1080p]");
    assert.equal(m.episode, 5);
    assert.equal(m.pack, false);
  });
  test("extracts a batch/complete marker", () => {
    const m = extractAnimeFeedMarker("[Group] Anime Batch Complete");
    assert.equal(m.pack, true);
  });
  test("returns null without any recognizable marker", () => {
    assert.equal(extractAnimeFeedMarker("[Group] Random Release"), null);
  });
});

describe("buildRssVideos / findRssItemByToken / matchRssItemsByMarker", () => {
  const items = [
    { ImdbId: "tt1234567", Title: "Show.S01E01.1080p", InfoHash: "hash1", PublishDate: "2024-01-01" },
    { ImdbId: "tt1234567", Title: "Show.S01E02.1080p", InfoHash: "hash2", PublishDate: "2024-01-08" },
    { ImdbId: "tt7654321", Title: "Other.S01E01.1080p", InfoHash: "hash3", PublishDate: "2024-01-01" },
  ];

  test("buildRssVideos only includes matching-imdb items, sorted by season/episode", () => {
    const videos = buildRssVideos(items, "series", "tt1234567");
    assert.equal(videos.length, 2);
    assert.equal(videos[0].episode, 1);
    assert.equal(videos[1].episode, 2);
  });

  test("findRssItemByToken finds the item whose derived token matches", () => {
    const token = getRssItemToken(items[1]);
    const found = findRssItemByToken(items, token);
    assert.equal(found.InfoHash, "hash2");
  });

  test("matchRssItemsByMarker filters by imdb id + season/episode", () => {
    const matches = matchRssItemsByMarker(items, "series", "tt1234567", 1, 2);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].InfoHash, "hash2");
  });
});
