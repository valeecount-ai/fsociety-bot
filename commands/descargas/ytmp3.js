import axios from "axios";
import { buildDvyerUrl, getDvyerBaseUrl } from "../../lib/api-manager.js";
import { throwIfAborted } from "../../lib/command-abort.js";
import { chargeDownloadRequest, refundDownloadCharge } from "../economia/download-access.js";

const API_BASE = getDvyerBaseUrl();
const API_MP3_URL = buildDvyerUrl("/ytmp3");
const API_SEARCH_URL = buildDvyerUrl("/ytsearch");
const AUDIO_QUALITY = "128k";
const REQUEST_TIMEOUT = 420000;
const LOCAL_AUDIO_TIMEOUT = 240000;
const MAX_AUDIO_BYTES = 80 * 1024 * 1024;
const LINK_RETRY_ATTEMPTS = 4;
const COOLDOWN_TIME = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;
const SEND_RETRY_ATTEMPTS = 2;
const AUDIO_SEARCH_LIMIT = 5;
const AUDIO_MIME_BY_EXTENSION = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  webm: "audio/webm",
  ogg: "audio/ogg",
};

const cooldowns = new Map();
const cache = new Map();

function now() {
  return Date.now();
}

function readCache(key) {
  const hit = cache.get(key);
  if (!hit || hit.expiresAt <= now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache(key, value, ttlMs = CACHE_TTL_MS) {
  cache.set(key, { value, expiresAt: now() + ttlMs });
}

function safeName(value, fallback = "audio") {
  const clean = String(value || fallback)
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return clean || fallback;
}

function displayTitle(value, fallback = "audio") {
  const clean = String(value || fallback)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return clean || fallback;
}

function buildStatusText({ title, quality, state }) {
  return [
    "╭─〔 *𝑫𝑽𝒀𝑬𝑹 • 𝑴𝑷𝟑* 〕",
    `┃ ♬ *Título:* ${displayTitle(title, "audio")}`,
    `┃ ⌁ *Calidad:* ${quality}`,
    `┃ ◈ *Estado:* ${state}`,
    "╰─⟡ _Preparando metadata original..._",
  ].join("\n");
}

function buildReadyCaption({ title, quality, format }) {
  return [
    "╭─〔 *𝑫𝑽𝒀𝑬𝑹 • 𝑨𝑼𝑫𝑰𝑶* 〕",
    `┃ ♬ *${displayTitle(title, "audio")}*`,
    `┃ ⌁ *Calidad:* ${quality} • ${format || "MP3"}`,
    "╰─⟡ _Archivo listo_",
  ].join("\n");
}

function buildMediaContext({ title, body, thumbnail, sourceUrl }) {
  const channelContext = global.channelInfo?.contextInfo || {};
  const externalAdReply = {
    title: displayTitle(title, "audio"),
    body: body || "DVYER MP3 • descarga directa",
    mediaType: 2,
    sourceUrl: sourceUrl || "https://dv-yer-api.online",
    renderLargerThumbnail: false,
    showAdAttribution: false,
  };
  if (thumbnail) {
    externalAdReply.thumbnailUrl = thumbnail;
  }
  return {
    ...channelContext,
    externalAdReply,
  };
}

function withChannelInfo(content, contextInfo = null) {
  const base = global.channelInfo || {};
  const mergedContext = {
    ...(base.contextInfo || {}),
    ...(contextInfo || {}),
  };
  return {
    ...content,
    ...base,
    ...(Object.keys(mergedContext).length ? { contextInfo: mergedContext } : {}),
  };
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function extractYouTubeUrl(text) {
  const match = String(text || "").match(
    /https?:\/\/(?:www\.)?(?:youtube\.com|music\.youtube\.com|youtu\.be)\/[^\s]+/i
  );
  return match ? match[0].trim() : "";
}

function extractTextFromAnyMessage(message) {
  return (
    message?.text ||
    message?.caption ||
    message?.body ||
    message?.message?.conversation ||
    message?.message?.extendedTextMessage?.text ||
    message?.message?.imageMessage?.caption ||
    message?.message?.videoMessage?.caption ||
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    ""
  );
}

function resolveInput(ctx) {
  const msg = ctx.m || ctx.msg || null;
  const argsText = Array.isArray(ctx.args) ? ctx.args.join(" ").trim() : "";
  const quoted =
    ctx?.quoted ||
    msg?.quoted ||
    msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
    null;
  const quotedText = extractTextFromAnyMessage(quoted);
  return argsText || quotedText || "";
}

function normalizeApiUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (isHttpUrl(value)) return value;
  if (value.startsWith("/")) return `${API_BASE}${value}`;
  return `${API_BASE}/${value}`;
}

function normalizeAudioExtension(payload) {
  const fromFormat = String(payload?.format || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const fromFile = String(payload?.filename || payload?.fileName || "")
    .trim()
    .toLowerCase()
    .match(/\.([a-z0-9]{2,5})(?:$|\?)/)?.[1];
  const ext = fromFile || fromFormat || "mp3";
  if (ext === "mpeg") return "mp3";
  if (ext === "mp4") return "m4a";
  return AUDIO_MIME_BY_EXTENSION[ext] ? ext : "mp3";
}

function audioMimeFromExtension(extension) {
  return AUDIO_MIME_BY_EXTENSION[String(extension || "").toLowerCase()] || "audio/mpeg";
}

function pickDownloadUrl(payload) {
  return (
    payload?.direct_url_full ||
    payload?.direct_url ||
    payload?.download_url_full ||
    payload?.stream_url_full ||
    payload?.download_url ||
    payload?.stream_url ||
    payload?.url ||
    payload?.result?.direct_url_full ||
    payload?.result?.direct_url ||
    payload?.result?.download_url_full ||
    payload?.result?.stream_url_full ||
    payload?.result?.download_url ||
    payload?.result?.stream_url ||
    payload?.result?.url ||
    ""
  );
}

function extractApiError(data, status) {
  return (
    data?.detail ||
    data?.error?.message ||
    data?.message ||
    (status ? `HTTP ${status}` : "Error de API")
  );
}

function hideProviderText(value) {
  return String(value || "")
    .replace(/https?:\/\/\S+/gi, "[internal]")
    .replace(/yt1s/gi, "internal")
    .replace(/ytdown/gi, "internal")
    .replace(/ytdlp/gi, "internal")
    .replace(/ytmp3tube/gi, "internal")
    .replace(/mp3now/gi, "internal")
    .trim();
}

function shouldRetryError(error) {
  const text = String(error?.message || error || "").toLowerCase();
  return (
    text.includes("rate-overlimit") ||
    text.includes("rate overlimit") ||
    text.includes("overlimit") ||
    text.includes("429") ||
    text.includes("too many requests") ||
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("socket hang up") ||
    text.includes("econnreset") ||
    text.includes("etimedout") ||
    text.includes("410") ||
    text.includes("expired") ||
    text.includes("expirado") ||
    text.includes("invalido") ||
    text.includes("invalid") ||
    text.includes("service unavailable") ||
    text.includes("temporarily") ||
    text.includes("media unavailable") ||
    text.includes("internal")
  );
}

function isExpiredLinkError(error) {
  const text = String(error?.message || error || "").toLowerCase();
  return (
    text.includes("410") ||
    text.includes("expired") ||
    text.includes("expirado") ||
    text.includes("link invalido") ||
    text.includes("invalid link") ||
    text.includes("not available")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiGet(url, params, signal) {
  const response = await axios.get(url, {
    timeout: REQUEST_TIMEOUT,
    params,
    signal: signal || undefined,
    validateStatus: () => true,
  });

  if (response.status >= 400 || response?.data?.ok === false || response?.data?.status === false) {
    throw new Error(extractApiError(response.data, response.status));
  }

  return response.data;
}

async function fetchAudioBuffer(downloadUrl, signal) {
  const response = await axios.get(downloadUrl, {
    timeout: LOCAL_AUDIO_TIMEOUT,
    responseType: "arraybuffer",
    signal: signal || undefined,
    maxContentLength: MAX_AUDIO_BYTES,
    maxBodyLength: MAX_AUDIO_BYTES,
    validateStatus: () => true,
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "audio/mpeg,audio/*,*/*",
    },
  });

  if (response.status >= 400) {
    throw new Error(`HTTP ${response.status}`);
  }

  const buffer = Buffer.from(response.data || []);
  if (!buffer.length) {
    throw new Error("El audio llego vacio.");
  }
  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new Error("El audio es demasiado grande para enviarlo directo.");
  }
  return buffer;
}

async function resolveVideo(rawInput, signal) {
  const videoUrl = extractYouTubeUrl(rawInput);
  if (videoUrl) {
    return { videoUrl, title: "audio", thumbnail: null };
  }

  if (isHttpUrl(rawInput)) {
    throw new Error("Enviame un link valido de YouTube.");
  }

  const query = String(rawInput || "").trim().toLowerCase();
  const cacheKey = `ytsearch:${query}`;
  const cached = readCache(cacheKey);
  if (cached?.videoUrl) {
    return cached;
  }

  const search = await apiGet(API_SEARCH_URL, { q: rawInput, limit: 1 }, signal);
  const first = search?.results?.[0];
  if (!first?.url) {
    throw new Error("No encontre resultados para ese titulo.");
  }

  const result = {
    videoUrl: String(first.url).trim(),
    title: displayTitle(first.title || "audio"),
    thumbnail: first.thumbnail || null,
  };
  writeCache(cacheKey, result);
  return result;
}

async function resolveAudioCandidates(rawInput, signal) {
  const videoUrl = extractYouTubeUrl(rawInput);
  if (videoUrl) {
    return [{ videoUrl, title: "audio", thumbnail: null }];
  }

  if (isHttpUrl(rawInput)) {
    throw new Error("Enviame un link valido de YouTube.");
  }

  const query = String(rawInput || "").trim().toLowerCase();
  const cacheKey = `ytsearch:${query}:${AUDIO_SEARCH_LIMIT}`;
  const cached = readCache(cacheKey);
  if (Array.isArray(cached) && cached.length) {
    return cached;
  }

  const search = await apiGet(API_SEARCH_URL, { q: rawInput, limit: AUDIO_SEARCH_LIMIT }, signal);
  const results = Array.isArray(search?.results) ? search.results : [];
  const candidates = results
    .filter((item) => item?.url)
    .map((item) => ({
      videoUrl: String(item.url).trim(),
      title: displayTitle(item.title || "audio"),
      thumbnail: item.thumbnail || null,
    }));

  if (!candidates.length) {
    throw new Error("No encontre resultados para ese titulo.");
  }

  writeCache(cacheKey, candidates);
  return candidates;
}

async function resolveMp3Link(videoUrl, signal, preferredTitle = "") {
  let payload = null;
  let lastError = null;
  for (let attempt = 1; attempt <= LINK_RETRY_ATTEMPTS; attempt += 1) {
    try {
      payload = await apiGet(
        API_MP3_URL,
        {
          mode: "link",
          url: videoUrl,
          quality: AUDIO_QUALITY,
        },
        signal
      );
      break;
    } catch (error) {
      lastError = error;
      if (!shouldRetryError(error) || attempt >= LINK_RETRY_ATTEMPTS) {
        throw error;
      }
      await sleep(1100 * attempt);
    }
  }
  if (!payload) {
    throw lastError || new Error("No se pudo resolver el audio.");
  }

  const downloadUrl = normalizeApiUrl(pickDownloadUrl(payload));
  if (!downloadUrl) {
    throw new Error("No se pudo resolver el enlace de audio.");
  }

  const extension = normalizeAudioExtension(payload);
  const cleanedTitle = safeName(payload?.title || preferredTitle || "audio");
  const fileBase = safeName(
    String(cleanedTitle || "audio").replace(/\.[^.]+$/i, ""),
    "audio"
  );
  const result = {
    downloadUrl,
    title: displayTitle(payload?.title || preferredTitle || cleanedTitle, cleanedTitle),
    fileName: `${fileBase}.${extension}`,
    thumbnail: payload?.thumbnail || payload?.image || null,
    quality: String(payload?.quality || AUDIO_QUALITY).trim() || AUDIO_QUALITY,
    format: extension.toUpperCase(),
    mimetype: audioMimeFromExtension(extension),
  };
  return result;
}

async function resolveFirstWorkingAudio(candidates, signal) {
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const audio = await resolveMp3Link(candidate.videoUrl, signal, candidate.title);
      return { video: candidate, audio };
    } catch (error) {
      lastError = error;
      if (!shouldRetryError(error)) {
        continue;
      }
      await sleep(450);
    }
  }
  throw lastError || new Error(`No encontre audio estable despues de probar ${candidates.length} resultados.`);
}

function toFriendlyError(error) {
  const text = hideProviderText(error?.message || error || "");
  const low = text.toLowerCase();
  if (low.includes("demasiado grande")) {
    return "El archivo es muy grande para enviarlo directo.";
  }
  if (low.includes("rate-overlimit") || low.includes("rate overlimit") || low.includes("overlimit")) {
    return "El proveedor esta saturado ahora. Reintenta en 15-30 segundos.";
  }
  if (low.includes("timeout") || low.includes("timed out") || low.includes("socket hang up")) {
    return "El servidor tardo demasiado. Intenta de nuevo.";
  }
  if (low.includes("429") || low.includes("too many requests")) {
    return "Hay muchas solicitudes ahora. Intenta en unos segundos.";
  }
  if (low.includes("no se pudo preparar la descarga de audio")) {
    return "No encontre un audio estable para ese resultado. Intenta con el link exacto o escribe artista + cancion.";
  }
  if (low.includes("410") || low.includes("expirado") || low.includes("expired")) {
    return "El enlace temporal expiro mientras WhatsApp lo abria. Reintenta y se generara uno nuevo.";
  }
  if (low.includes("media unavailable")) {
    return "Ese audio no esta disponible ahora mismo. Prueba en unos segundos o con otro video.";
  }
  return text || "Error al procesar el audio.";
}

function getCooldownRemaining(untilMs) {
  return Math.max(0, Math.ceil((untilMs - now()) / 1000));
}

async function sendAudioFast(sock, from, quoted, { downloadUrl, fileName, title, thumbnail, videoUrl, mimetype, quality, format, signal }) {
  let lastError = null;
  const cleanTitle = displayTitle(title, "audio");
  const cleanQuality = quality || AUDIO_QUALITY;
  const cleanFormat = format || "MP3";
  const cleanMime = mimetype || "audio/mpeg";
  const metadata = buildMediaContext({
    title: cleanTitle,
    body: `${cleanFormat} • ${cleanQuality} • DVYER`,
    thumbnail,
    sourceUrl: videoUrl,
  });
  try {
    await sock.sendMessage(
      from,
      withChannelInfo({
        audio: { url: downloadUrl },
        mimetype: cleanMime,
        ptt: false,
        fileName,
        title: cleanTitle,
      }, metadata),
      quoted
    );
    return;
  } catch (error) {
    lastError = error;
  }

  try {
    await sock.sendMessage(
      from,
      withChannelInfo({
        document: { url: downloadUrl },
        mimetype: cleanMime,
        fileName,
        title: cleanTitle,
        caption: buildReadyCaption({ title: cleanTitle, quality: cleanQuality, format: cleanFormat }),
      }, metadata),
      quoted
    );
    return;
  } catch (error) {
    lastError = error;
  }

  const buffer = await fetchAudioBuffer(downloadUrl, signal);
  try {
    await sock.sendMessage(
      from,
      withChannelInfo({
        audio: buffer,
        mimetype: cleanMime,
        ptt: false,
        fileName,
        title: cleanTitle,
      }, metadata),
      quoted
    );
    return;
  } catch (error) {
    lastError = error;
  }

  await sock.sendMessage(
    from,
    withChannelInfo({
      document: buffer,
      mimetype: cleanMime,
      fileName,
      title: cleanTitle,
      caption: buildReadyCaption({ title: cleanTitle, quality: cleanQuality, format: cleanFormat }),
    }, metadata),
    quoted
  ).catch(() => {
    throw lastError || new Error("No se pudo enviar el audio.");
  });
}

async function sendAudioWithFreshLink(sock, from, quoted, { videoUrl, initialMp3, fallbackTitle, thumbnail, signal }) {
  let mp3 = initialMp3;
  let lastError = null;

  for (let attempt = 1; attempt <= SEND_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await sendAudioFast(sock, from, quoted, {
        downloadUrl: mp3.downloadUrl,
        fileName: mp3.fileName,
        title: mp3.title || fallbackTitle,
        thumbnail: mp3.thumbnail || thumbnail,
        videoUrl,
        mimetype: mp3.mimetype,
        quality: mp3.quality,
        format: mp3.format,
        signal,
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= SEND_RETRY_ATTEMPTS || (!isExpiredLinkError(error) && !shouldRetryError(error))) {
        break;
      }
      await sleep(800 * attempt);
      mp3 = await resolveMp3Link(videoUrl, signal, fallbackTitle);
    }
  }

  throw lastError || new Error("No se pudo enviar el audio.");
}

export default {
  command: ["ytmp3", "ytmp3dv"],
  category: "descarga",

  run: async (ctx) => {
    const { sock, from } = ctx;
    const msg = ctx.m || ctx.msg || null;
    const quoted = msg?.key ? { quoted: msg } : undefined;
    const abortSignal = ctx.abortSignal || null;
    const userId = `${from}:ytmp3`;
    let charged = null;

    if (COOLDOWN_TIME > 0) {
      const until = cooldowns.get(userId);
      if (until && until > now()) {
        return sock.sendMessage(from, {
          text: `⏳ Espera ${getCooldownRemaining(until)}s`,
          ...global.channelInfo,
        });
      }
      cooldowns.set(userId, now() + COOLDOWN_TIME);
    }

    try {
      const input = resolveInput(ctx);
      if (!input) {
        cooldowns.delete(userId);
        return sock.sendMessage(from, {
          text: "❌ Uso: .ytmp3 <nombre o link de YouTube>",
          ...global.channelInfo,
        });
      }

      throwIfAborted(abortSignal);
      const candidates = await resolveAudioCandidates(input, abortSignal);
      const video = candidates[0];

      charged = await chargeDownloadRequest(ctx, {
        feature: "ytmp3",
        title: video.title,
        videoUrl: video.videoUrl,
      });
      if (!charged.ok) {
        cooldowns.delete(userId);
        return;
      }

      await sock.sendMessage(
        from,
        withChannelInfo({
          text: buildStatusText({
            title: video.title,
            quality: AUDIO_QUALITY,
            state: "buscando enlace seguro",
          }),
        }, buildMediaContext({
          title: video.title,
          body: `MP3 • ${AUDIO_QUALITY}`,
          thumbnail: video.thumbnail,
          sourceUrl: video.videoUrl,
        })),
        quoted
      );

      throwIfAborted(abortSignal);
      const resolvedAudio = await resolveFirstWorkingAudio(candidates, abortSignal);
      const mp3 = resolvedAudio.audio;
      const selectedVideo = resolvedAudio.video;
      throwIfAborted(abortSignal);

      await sendAudioWithFreshLink(sock, from, quoted, {
        videoUrl: selectedVideo.videoUrl,
        initialMp3: mp3,
        fallbackTitle: selectedVideo.title,
        thumbnail: selectedVideo.thumbnail,
        signal: abortSignal,
      });
    } catch (error) {
      if (abortSignal?.aborted) {
        return;
      }
      refundDownloadCharge(ctx, charged, {
        feature: "ytmp3",
        error: String(error?.message || error || "unknown_error"),
      });
      cooldowns.delete(userId);
      await sock.sendMessage(from, {
        text: `❌ ${toFriendlyError(error)}`,
        ...global.channelInfo,
      });
    }
  },
};
