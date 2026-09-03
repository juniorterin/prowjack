const path = require("path");
const axios = require("axios");
const { ENV, PUBLIC_TRACKERS } = require("./constants");
const { stripSourceBadges } = require("./scoring");

const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_THRESHOLD = 100;

function checkRateLimit(ip) {
  const now = Date.now();

  if (rateLimitStore.size > 10000) {
    for (const [key, entry] of rateLimitStore) {
      if (entry.resetAt <= now) rateLimitStore.delete(key);
    }
  }

  const entry = rateLimitStore.get(ip);

  if (!entry) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.resetAt <= now) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT_THRESHOLD) return false;
  entry.count++;
  return true;
}

// IP real do cliente atrás do proxy reverso (Coolify etc.) — mesmo padrão já
// usado pelo rate limiter em addon.js, promovido aqui pra ser reaproveitado
// pelo gate de chave de acesso (accessKeys.js).
function getClientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;
}

function getPublicBase(req) {
  if (ENV.addonPublicUrl) return ENV.addonPublicUrl.replace(/\/+$/, "");
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host     = req.headers["x-forwarded-host"]  || req.get("host");
  return `${protocol}://${host}`;
}

function getRequestAccessToken(req) {
  return String(req.headers["x-access-token"] || req.query.token || "").trim();
}

// Stremio não expõe pro addon qual idioma o app está configurado pra usar —
// a melhor aproximação disponível é o header Accept-Language que o próprio
// cliente (desktop/web/mobile) envia em cada request. Olha só a tag de maior
// prioridade (a primeira da lista) pra decidir se é português.
function isPtBrRequest(req) {
  const header = String(req.headers["accept-language"] || "").trim();
  if (!header) return false;
  const firstTag = header.split(",")[0].trim().toLowerCase();
  return firstTag.startsWith("pt");
}

function hasAdminAccess(req) {
  return !ENV.accessToken || getRequestAccessToken(req) === ENV.accessToken;
}

function requireAdminAccess(req, res, next) {
  if (hasAdminAccess(req)) return next();
  return res.status(403).json({ ok: false, error: "Acesso negado" });
}

function sendConfigurePage(res) {
  res.sendFile(path.join(__dirname, "public", "configure.html"));
}

// Extrai o indexador real informado pelo addon externo (marcador "⚙️ Nome"),
// ex.: BrasilRD marca "🔗 13 ⚙️ Comando Torrents" → "Comando Torrents".
function extractScrapIndexer(...texts) {
  const m = texts.filter(Boolean).join("\n").match(/⚙️\s*([^\n]+)/);
  return m ? m[1].trim().slice(0, 80) : "";
}

// Descrição normalizada para streams de addons externos (sem infoHash):
// reconstrói as linhas de metadados marcadas pelo addon (🌱 seeds, ⚙️ indexador,
// 🌐 idioma) e acrescenta a fonte com 📡.
function scrapExternalDescription(stream, source) {
  const text = [stream.title, stream.description, stream._title].filter(Boolean).join("\n");
  const seedMatch = text.match(/(?:🔗|🌱|👤|👥)\s*(\d{1,6})/i);
  const langMatch = text.match(/🌐\s*([^\n]+)/);
  const indexer = extractScrapIndexer(text);
  const filename = stream.behaviorHints?.filename || stream._filename || "";
  const releaseLines = filename
    ? []
    : text.split("\n").map(l => l.trim()).filter(l =>
        l && !/^(?:🔗|🌱|👤|👥)\s*\d/i.test(l) && !l.startsWith("⚙️") && !l.startsWith("🌐"));
  return [
    ...releaseLines.slice(0, 2),
    seedMatch ? `🌱 ${seedMatch[1]}` : "",
    indexer ? `⚙️ ${indexer}` : "",
    langMatch ? `🌐 ${langMatch[1].trim().slice(0, 60)}` : "",
    source ? `📡 ${source}` : "",
    filename ? `📂 ${filename}` : "",
  ].filter(Boolean).join("\n");
}

async function fetchScrapStreams(manifestUrl, type, id, options = {}) {
  try {
    const base = manifestUrl.replace(/\/manifest\.json$/i, "");
    const url  = `${base}/stream/${type}/${id}.json`;
    const res  = await axios.get(url, { timeout: options.timeout || 8000, validateStatus: s => s < 400 });
    const streams = res.data?.streams;
    if (!Array.isArray(streams)) return [];
    return streams
      .filter(s => s.infoHash || s.externalUrl || (s.url && !s.url.startsWith("magnet:")))
      .map(s => {
        const nameStr = s.name || "";
        const titleStr = s.title || "";
        const descStr = s.description || "";
        const filenameStr = s.behaviorHints?.filename || "";

        const cleanStream = {
          ...s,
          name: options.preserveBadges ? nameStr : stripSourceBadges(nameStr),
          title: options.preserveBadges ? titleStr : stripSourceBadges(titleStr),
          description: options.preserveBadges ? descStr : stripSourceBadges(descStr),
          behaviorHints: {
            ...(s.behaviorHints || {}),
            filename: options.preserveBadges ? filenameStr : stripSourceBadges(filenameStr),
            // notWebReady=true impede exibição no Stremio web/mobile — sempre forçar false
            notWebReady: false,
          },
        };
        // Extrai título do campo name ou title para scoring de idioma/resolução
        const rawName = cleanStream.name || "";
        const desc    = cleanStream.description || cleanStream.title || "";
        const titleForFilters = [rawName, desc].filter(Boolean).join(" ");
        const size = cleanStream.behaviorHints?.videoSize || 0;
        let seeders = Number(cleanStream._seeders ?? cleanStream.seeders ?? cleanStream.seeds ??
          cleanStream.sources?.seeders ?? cleanStream.stats?.seeders ??
          cleanStream.behaviorHints?.seeders ?? cleanStream.behaviorHints?.seeds ?? 0);
        if (!Number.isFinite(seeders) || seeders < 0) seeders = 0;
        if (!seeders) {
          const seedText = [
            cleanStream.name,
            cleanStream.title,
            cleanStream.description,
            cleanStream.behaviorHints?.filename,
          ].filter(Boolean).join(" ");
          const match = seedText.match(/(?:🌱|👤|👥|seeders?|seeds?|s:)\s*(\d{1,6})/i);
          if (match) seeders = parseInt(match[1], 10) || 0;
        }
        return {
          ...cleanStream,
          _scrapSource: true,
          _title:       titleForFilters,
          _filename:    cleanStream.behaviorHints?.filename || "",
          _sizeBytes:   size,
          _seeders:     seeders,
          _sizeGb:      size / 1e9,
        };
      });
  } catch (err) {
    if (options.label) {
      const reason = err.code === "ECONNABORTED"
        ? `timeout após ${options.timeout || 8000}ms`
        : err.message;
      console.log(`[WARN] ${options.label}: ${reason}`);
    }
    return [];
  }
}

function isPrivateTrackerCandidate(r, resolved = null) {
  if (resolved?.isPrivate !== undefined) return !!resolved.isPrivate;
  if (resolved?.buffer) {
    return resolved.buffer.toString("latin1").includes("7:privatei1e");
  }

  const indexerName = (r._indexerName || r.Tracker || r.TrackerId || r.Indexer || "").toLowerCase();
  const isKnownPublic = PUBLIC_TRACKERS.some(t => indexerName.includes(t));

  if (isKnownPublic) return false;
  if (r?.MagnetUri) return false;
  if (r?.Link && !r.Link.startsWith("magnet:")) return true;
  return false;
}

module.exports = {
  getClientIp,
  getPublicBase,
  getRequestAccessToken,
  isPtBrRequest,
  hasAdminAccess,
  requireAdminAccess,
  sendConfigurePage,
  fetchScrapStreams,
  extractScrapIndexer,
  scrapExternalDescription,
  isPrivateTrackerCandidate,
  checkRateLimit
};
