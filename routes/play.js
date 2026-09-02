const express = require("express");
const axios = require("axios");
const torrServer = require("../providers/torrserver");
const { TORRENT_DOWNLOAD_TIMEOUT_MS } = require("../constants");
const { loadPlayJob } = require("../cache");
const { resolvePrefs } = require("../configStore");
const { checkAccessKey } = require("../accessKeys");
const { torrentDownloadRecentlyFailed, markTorrentDownloadFailed } = require("../torrentUtils");
const { injectTrackers } = require("../torrentEnrich");

const router = express.Router();

// Prepara o torrent no TorrServer e redireciona o player pro endpoint de
// stream dele — ele prioriza peças dinamicamente com base na posição de
// leitura do player, então suporta seek de verdade em qualquer ponto do
// arquivo, mesmo ainda baixando.
router.get("/:userConfig/play/:jobToken", async (req, res) => {
  const prefs = await resolvePrefs(req.params.userConfig);
  if (!(await checkAccessKey(prefs, req))) return res.status(403).send("Acesso negado.");
  const job = await loadPlayJob(req.params.jobToken);
  if (!job?.infoHash) return res.status(404).send("Job expirado ou inválido.");
  if (!torrServer.isConfigured()) return res.status(503).send("TorrServer não configurado (TS_URL ausente).");

  try {
    let torrentBuffer = null;
    if (job.torrentB64) {
      try { torrentBuffer = Buffer.from(job.torrentB64, "base64"); } catch {}
    }
    if (!torrentBuffer && job.link && !job.link.startsWith("magnet:")) {
      try {
        if (!(await torrentDownloadRecentlyFailed(job.link))) {
          const dl = await axios.get(job.link, {
            responseType: "arraybuffer", timeout: TORRENT_DOWNLOAD_TIMEOUT_MS, maxRedirects: 5,
            maxContentLength: 8 * 1024 * 1024, headers: { "User-Agent": "Mozilla/5.0" },
            validateStatus: s => s < 400,
            beforeRedirect: (options) => {
              if (options.href?.startsWith("magnet:")) throw new Error("Redirect para magnet");
            },
          });
          if (dl.data && Buffer.from(dl.data)[0] === 0x64) {
            const raw = Buffer.from(dl.data);
            try { torrentBuffer = injectTrackers(raw); } catch { torrentBuffer = raw; }
          }
        }
      } catch (e) {
        if (!e.message.includes("magnet")) await markTorrentDownloadFailed(job.link);
      }
    }

    const streamUrl = await torrServer.ensureStreamUrl({
      magnet: job.magnet, torrentBuffer, fileIdx: job.fileIdx, fileName: job.fileName,
    });
    return res.redirect(302, streamUrl);
  } catch (err) {
    console.log(`[TorrServer] Falha ao preparar ${job.infoHash}: ${err.message}`);
    if (!res.headersSent) return res.status(503).send(`TorrServer: ${err.message}`);
  }
});

module.exports = router;
