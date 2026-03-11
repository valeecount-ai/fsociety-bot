import fs from "fs";
import path from "path";
import os from "os";
import axios from "axios";
import { pipeline } from "stream/promises";

const API_BASE = "https://dv-yer-api.online";
const API_TIKTOK_URL = `${API_BASE}/ttdlmp4`;

const COOLDOWN_TIME = 15 * 1000;
const VIDEO_QUALITY = "hd";
const API_LANG = "es";
const REQUEST_TIMEOUT = 60000;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

const cooldowns = new Map();
const TMP_DIR = path.join(os.tmpdir(), "dvyer-tiktok");

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function safeFileName(name) {
  return (
    String(name || "tiktok")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "tiktok"
  );
}

function normalizeMp4Name(name) {
  const clean = safeFileName(String(name || "tiktok").replace(/\.mp4$/i, ""));
  return `${clean || "tiktok"}.mp4`;
}

function getCooldownRemaining(untilMs) {
  return Math.max(0, Math.ceil((untilMs - Date.now()) / 1000));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractApiError(data, status) {
  return (
    data?.detail ||
    data?.error?.message ||
    data?.message ||
    (status ? `HTTP ${status}` : "Error de API")
  );
}

function pickDownloadUrl(data) {
  return (
    data?.download_url_full ||
    data?.download_url ||
    data?.url ||
    data?.result?.download_url_full ||
    data?.result?.download_url ||
    data?.result?.url ||
    ""
  );
}

function extractTextFromMessage(message) {
  return (
    message?.text ||
    message?.caption ||
    message?.body ||
    message?.message?.conversation ||
    message?.message?.extendedTextMessage?.text ||
    message?.message?.imageMessage?.caption ||
    message?.message?.videoMessage?.caption ||
    message?.message?.documentMessage?.caption ||
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    message?.documentMessage?.caption ||
    ""
  );
}

function extractTikTokUrl(text) {
  const match = String(text || "").match(
    /https?:\/\/(?:www\.)?(?:tiktok\.com|m\.tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com|douyin\.com)\/[^\s]+/i
  );
  return match ? match[0].trim() : "";
}

function getQuotedMessage(ctx, msg) {
  return (
    ctx?.quoted ||
    msg?.quoted ||
    msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
    null
  );
}

function resolveTikTokUrl(ctx) {
  const msg = ctx.m || ctx.msg || null;
  const directText = Array.isArray(ctx.args) ? ctx.args.join(" ").trim() : "";
  const quotedMessage = getQuotedMessage(ctx, msg);
  const quotedText = extractTextFromMessage(quotedMessage);

  return extractTikTokUrl(directText) || extractTikTokUrl(quotedText) || "";
}

async function apiGet(url, params, timeout = REQUEST_TIMEOUT) {
  const response = await axios.get(url, {
    timeout,
    params,
    validateStatus: () => true,
  });

  const data = response.data;

  if (response.status >= 400) {
    throw new Error(extractApiError(data, response.status));
  }

  if (data?.ok === false || data?.status === false) {
    throw new Error(extractApiError(data, response.status));
  }

  return data;
}

async function resolveRedirectTarget(url) {
  let lastError = "No se pudo resolver la redirección final.";

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await axios.get(url, {
        timeout: REQUEST_TIMEOUT,
        maxRedirects: 0,
        validateStatus: () => true,
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers?.location;
        if (location) return location;
      }

      if (response.status >= 200 && response.status < 300) {
        return url;
      }

      lastError = extractApiError(response.data, response.status);
    } catch (error) {
      lastError = error?.message || "redirect failed";
    }

    await sleep(700 * attempt);
  }

  throw new Error(lastError);
}

async function requestTikTokLink(videoUrl) {
  let lastError = "No se pudo obtener el video de TikTok.";

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const data = await apiGet(API_TIKTOK_URL, {
        mode: "link",
        quality: VIDEO_QUALITY,
        lang: API_LANG,
        url: videoUrl,
      });

      const redirectUrl = pickDownloadUrl(data);
      if (!redirectUrl) {
        throw new Error("La API no devolvió download_url.");
      }

      const directUrl = await resolveRedirectTarget(redirectUrl);
      const title = safeFileName(data?.title || data?.result?.title || "tiktok");
      const fileName = normalizeMp4Name(
        data?.filename || data?.file_name || title || "tiktok"
      );

      return {
        title,
        fileName,
        directUrl,
      };
    } catch (error) {
      lastError = error?.message || "Error desconocido";
      await sleep(900 * attempt);
    }
  }

  throw new Error(lastError);
}

async function downloadVideoToTemp(directUrl, fileName) {
  const finalName = normalizeMp4Name(fileName || "tiktok.mp4");
  const tempPath = path.join(TMP_DIR, `${Date.now()}-${finalName}`);

  const response = await axios.get(directUrl, {
    responseType: "stream",
    timeout: REQUEST_TIMEOUT,
    maxRedirects: 5,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
      Accept: "*/*",
      Referer: "https://www.tiktok.com/",
    },
    validateStatus: (status) => status >= 200 && status < 400,
  });

  await pipeline(response.data, fs.createWriteStream(tempPath));

  if (!fs.existsSync(tempPath)) {
    throw new Error("No se pudo guardar el video.");
  }

  const size = fs.statSync(tempPath).size;

  if (!size || size < 100000) {
    try {
      fs.unlinkSync(tempPath);
    } catch {}
    throw new Error("El archivo descargado es inválido.");
  }

  if (size > MAX_VIDEO_BYTES) {
    try {
      fs.unlinkSync(tempPath);
    } catch {}
    throw new Error("El video es demasiado grande para enviarlo por WhatsApp.");
  }

  return {
    tempPath,
    size,
    fileName: finalName,
  };
}

async function sendTikTokVideo(sock, from, quoted, { filePath, fileName, title }) {
  try {
    await sock.sendMessage(
      from,
      {
        video: { url: filePath },
        mimetype: "video/mp4",
        fileName,
        caption: `api dvyer\n\n${title}`,
        ...global.channelInfo,
      },
      quoted
    );
    return "video";
  } catch (e1) {
    console.error("send local video failed:", e1?.message || e1);

    await sock.sendMessage(
      from,
      {
        document: { url: filePath },
        mimetype: "video/mp4",
        fileName,
        caption: `api dvyer\n\n${title}`,
        ...global.channelInfo,
      },
      quoted
    );
    return "document";
  }
}

export default {
  command: ["tiktok"],
  category: "descarga",

  run: async (ctx) => {
    const { sock, from } = ctx;
    const msg = ctx.m || ctx.msg || null;
    const quoted = msg?.key ? { quoted: msg } : undefined;
    const userId = from;

    let tempPath = null;

    const until = cooldowns.get(userId);
    if (until && until > Date.now()) {
      return sock.sendMessage(from, {
        text: `⏳ Espera ${getCooldownRemaining(until)}s`,
        ...global.channelInfo,
      });
    }

    cooldowns.set(userId, Date.now() + COOLDOWN_TIME);

    try {
      const videoUrl = resolveTikTokUrl(ctx);

      if (!videoUrl) {
        cooldowns.delete(userId);
        return sock.sendMessage(from, {
          text: "❌ Uso: .tiktok <link de TikTok> o responde a un mensaje con el link",
          ...global.channelInfo,
        });
      }

      await sock.sendMessage(
        from,
        {
          text: `⬇️ Preparando TikTok...\n\n🎬 api dvyer`,
          ...global.channelInfo,
        },
        quoted
      );

      const info = await requestTikTokLink(videoUrl);

      const downloaded = await downloadVideoToTemp(info.directUrl, info.fileName);
      tempPath = downloaded.tempPath;

      await sendTikTokVideo(sock, from, quoted, {
        filePath: downloaded.tempPath,
        fileName: downloaded.fileName,
        title: info.title,
      });
    } catch (err) {
      console.error("TIKTOK ERROR:", err?.message || err);
      cooldowns.delete(userId);

      await sock.sendMessage(from, {
        text: `❌ ${String(err?.message || "No se pudo procesar el video.")}`,
        ...global.channelInfo,
      });
    } finally {
      try {
        if (tempPath && fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch {}
    }
  },
};
