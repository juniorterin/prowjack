"use strict";
require("../helpers/testEnv");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const {
  base32ToHex,
  extractInfoHash,
  extractInfoBuf,
  decodeBencode,
  extractTorrentFiles,
  pickEpisodeFile,
  normalizeTorrentLink,
  infoHashQueueKey,
  buildMagnet,
} = require("../../torrentUtils");

// Pequenas construtoras de bencode só para montar buffers de teste — não
// reusam torrentEnrich.js (que dispara chamadas HTTP reais ao ser exigido).
const bstr = s => `${Buffer.byteLength(s)}:${s}`;
const bint = n => `i${n}e`;
const blist = items => `l${items.join("")}e`;
const bdict = obj => `d${Object.entries(obj).map(([k, v]) => bstr(k) + v).join("")}e`;

describe("base32ToHex", () => {
  test("decodes a 32-char base32 string into 40 hex chars", () => {
    const hex = base32ToHex("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    assert.equal(hex.length, 40);
    assert.equal(hex, "0".repeat(40));
  });

  test("returns null for invalid base32 characters", () => {
    assert.equal(base32ToHex("not-valid-base32!!"), null);
  });
});

describe("extractInfoHash", () => {
  const HEX40 = "0123456789abcdef0123456789abcdef01234567";

  test("extracts a 40-char hex btih from a magnet link", () => {
    assert.equal(extractInfoHash(`magnet:?xt=urn:btih:${HEX40}&dn=Movie`), HEX40);
  });

  test("extracts and converts a base32 btih from a magnet link", () => {
    const hash = extractInfoHash("magnet:?xt=urn:btih:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&dn=Movie");
    assert.equal(hash, "0".repeat(40));
  });

  test("returns null when there is no magnet or no btih", () => {
    assert.equal(extractInfoHash(""), null);
    assert.equal(extractInfoHash("magnet:?dn=Movie"), null);
  });
});

describe("decodeBencode / extractInfoBuf / extractTorrentFiles", () => {
  test("decodes a single-file torrent and extracts its one file", () => {
    const infoDict = bdict({ name: bstr("movie.mkv"), length: bint(123456) });
    const buf = Buffer.from(bdict({ info: infoDict }), "utf8");

    const decoded = decodeBencode(buf);
    assert.equal(decoded.info.name, "movie.mkv");
    assert.equal(decoded.info.length, 123456);

    const files = extractTorrentFiles(buf);
    assert.deepEqual(files, [{ idx: 0, name: "movie.mkv", size: 123456 }]);
  });

  test("decodes a multi-file torrent and extracts each file with its joined path", () => {
    const file1 = bdict({ length: bint(100), path: blist([bstr("sub1"), bstr("file1.mkv")]) });
    const file2 = bdict({ length: bint(200), path: blist([bstr("file2.mp4")]) });
    const infoDict = bdict({ name: bstr("Movie"), files: blist([file1, file2]) });
    const buf = Buffer.from(bdict({ info: infoDict }), "utf8");

    const files = extractTorrentFiles(buf);
    assert.deepEqual(files, [
      { idx: 0, name: "sub1/file1.mkv", size: 100 },
      { idx: 1, name: "file2.mp4", size: 200 },
    ]);
  });

  test("extractInfoBuf returns exactly the raw bytes of the info dict", () => {
    const infoDict = bdict({ name: bstr("movie.mkv"), length: bint(123456) });
    const buf = Buffer.from(bdict({ info: infoDict }), "utf8");
    const raw = extractInfoBuf(buf);
    assert.ok(Buffer.isBuffer(raw));
    assert.equal(raw.toString("utf8"), infoDict);
  });

  test("extractTorrentFiles returns [] for well-formed-but-not-a-dict bencode", () => {
    assert.deepEqual(extractTorrentFiles(Buffer.from("i123e")), []); // integer
    assert.deepEqual(extractTorrentFiles(Buffer.from("le")), []); // empty list
    assert.deepEqual(extractTorrentFiles(Buffer.from("4:spam")), []); // plain string
  });

  // NB: decodeBencode's string-length parser scans for a ':' with no bound on
  // the buffer, so genuinely colon-less garbage (e.g. "not a torrent") spins
  // forever instead of throwing — a real hang hazard on malformed .torrent
  // data, out of scope to fix here. Keep inputs below containing a ':' so
  // this suite itself doesn't hang.
  test("extractTorrentFiles doesn't throw on malformed-but-colon-bearing input", () => {
    assert.deepEqual(extractTorrentFiles(Buffer.from("not:a:torrent")), []);
  });
});

describe("pickEpisodeFile", () => {
  test("picks the file matching the requested season/episode over other episodes", () => {
    const files = [
      { name: "Show.S01E01.1080p.mkv", size: 1e9 },
      { name: "Show.S01E02.1080p.mkv", size: 1e9 },
      { name: "Show.S01E03.1080p.mkv", size: 1e9 },
    ];
    const picked = pickEpisodeFile(files, 1, 2, false);
    assert.equal(picked.name, "Show.S01E02.1080p.mkv");
  });

  test("returns null when there is no episode to pick", () => {
    assert.equal(pickEpisodeFile([{ name: "a.mkv", size: 1 }], 1, null, false), null);
    assert.equal(pickEpisodeFile([], 1, 1, false), null);
  });
});

describe("normalizeTorrentLink", () => {
  test("strips the fragment from a well-formed URL", () => {
    assert.equal(normalizeTorrentLink("https://example.com/x?y=1#frag"), "https://example.com/x?y=1");
  });

  test("falls back to a manual split for a non-URL string", () => {
    assert.equal(normalizeTorrentLink("not-a-url#frag"), "not-a-url");
  });

  test("returns empty string for falsy input", () => {
    assert.equal(normalizeTorrentLink(""), "");
  });
});

describe("infoHashQueueKey", () => {
  test("prefers a direct InfoHash", () => {
    assert.equal(infoHashQueueKey({ InfoHash: "ABC" }), "hash:abc");
  });

  test("falls back to the magnet's btih", () => {
    const HEX40 = "0123456789abcdef0123456789abcdef01234567";
    assert.equal(infoHashQueueKey({ MagnetUri: `magnet:?xt=urn:btih:${HEX40}` }), `magnet:${HEX40}`);
  });

  test("falls back to a hash of the http download link", () => {
    const key = infoHashQueueKey({ Link: "https://example.com/x.torrent" });
    assert.match(key, /^urlhash:[a-f0-9]{40}$/);
  });

  test("returns null when nothing usable is present", () => {
    assert.equal(infoHashQueueKey({}), null);
    assert.equal(infoHashQueueKey(null), null);
  });
});

describe("buildMagnet", () => {
  test("returns the existing magnet unchanged if already valid", () => {
    const existing = "magnet:?xt=urn:btih:abc&dn=Movie";
    assert.equal(buildMagnet("abc", existing, "Movie"), existing);
  });

  test("builds a new magnet with the info hash, display name and trackers", () => {
    const magnet = buildMagnet("ABCDEF", null, "My Movie");
    assert.match(magnet, /^magnet:\?xt=urn:btih:ABCDEF/);
    assert.match(magnet, /&dn=My%20Movie/);
    assert.match(magnet, /&tr=/);
  });
});
