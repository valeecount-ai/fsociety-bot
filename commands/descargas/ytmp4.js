import axios from "axios";
import ffmpegStatic from "ffmpeg-static";
import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const API_BASE = "https://dv-yer-api.online";
const API_VIDEO_URL = `${API_BASE}/ytdlmp4`;
const API_SEARCH_URL = `${API_BASE}/ytsearch`;

const COOLDOWN_TIME = 15 * 1000;
const VIDEO_QUALITY = "360p";
const API_TIMEOUT_MS = 35000;
const FFMPEG_TIMEOUT_MS = 7 * 60 * 1000;

const FFMPEG_BIN = process.env.FFMPEG_PATH || ffmpegStatic;
const cooldowns = new Map();

function safeFileName(name) {
  return (
    String(name || "video")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "video"
  );
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function toAbsoluteApiUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (isHttpUrl(url)) return url;
  if (url.startsWith("/")) return `${API_BASE}${url}`;
  return `${API_BASE}/${url}`;
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

function pickMediaUrl(data) {
  return (
    data?.stream_url_full ||
    data?.stream_url ||
    data?.download_url_full ||
    data?.download_url ||
    data?.url ||
    data?.result?.stream_url_full ||
    data?.result?.stream_url ||
    data?.result?.download_url_full ||
    data?.result?.download_url ||
    data?.result?.url ||
    ""
  );
}

async function apiGet(url, params, timeout = API_TIMEOUT_MS) {
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

async function resolveSearch(query) {
  const data = await apiGet(API_SEARCH_URL, { q: query, limit: 1 }, 25000);
  const first = data?.results?.[0];

  if (!first?.url) throw new Error("No se encontró el video.");

  return {
    videoUrl: first.url,
    title: safeFileName(first.title || "video"),
    thumbnail: first.thumbnail || null,
  };
}

async function resolveRedirectTarget(url) {
  let lastError = "No se pudo resolver la redirección final.";

  for (let attempt = 1; attempt <= 3; attempt++) {
    let response;
    try {
      response = await axios.get(url, {
        timeout: API_TIMEOUT_MS,
        maxRedirects: 0,
        responseType: "stream",
        validateStatus: () => true,
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers?.location;
        if (response.data?.destroy) response.data.destroy();
        if (location) return location;
      }

      if (response.status >= 200 && response.status < 300) {
        if (response.data?.destroy) response.data.destroy();
        return url;
      }

      if (response.data?.destroy) response.data.destroy();
      lastError = extractApiError(response.data, response.status);
    } catch (error) {
      if (response?.data?.destroy) response.data.destroy();
      lastError = error?.message || "redirect failed";
    }

    await sleep(700 * attempt);
  }

  throw new Error(lastError);
}

async function requestVideoLink(videoUrl) {
  let lastError = "No se pudo obtener el video.";

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const data = await apiGet(API_VIDEO_URL, {
        mode: "link",
        quality: VIDEO_QUALITY,
        url: videoUrl,
      });

      let mediaUrl = toAbsoluteApiUrl(pickMediaUrl(data));
      if (!mediaUrl) throw new Error("La API no devolvió stream_url/download_url.");

      if (/\/download\/redirect\//i.test(mediaUrl)) {
        mediaUrl = await resolveRedirectTarget(mediaUrl);
      }

      return {
        title: safeFileName(data?.title || data?.result?.title || "video"),
        mediaUrl,
      };
    } catch (error) {
      lastError = error?.message || "Error desconocido";
      await sleep(900 * attempt);
    }
  }

  throw new Error(lastError);
}

function runFfmpeg(args, timeoutMs = FFMPEG_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (!FFMPEG_BIN) {
      reject(new Error("FFmpeg no encontrado. Instala ffmpeg o define FFMPEG_PATH."));
      return;
    }

    const proc = spawn(FFMPEG_BIN, args, { windowsHide: true });
    let stderr = "";

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("FFmpeg excedió el tiempo límite."));
    }, timeoutMs);

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error(stderr.trim() || `FFmpeg terminó con código ${code}`));
    });
  });
}

async function transcodeToPlayableMp4(inputUrl, outputPath) {
  const remuxArgs = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    inputUrl,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    outputPath,
  ];

  try {
    await runFfmpeg(remuxArgs);
    return;
  } catch (_) {
    // fallback abajo
  }

  const transcodeArgs = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    inputUrl,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "24",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputPath,
  ];

  await runFfmpeg(transcodeArgs);
}

async function buildPlayableVideoFile({ mediaUrl, title }) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "ytmp4-"));
  const outputPath = path.join(tempDir, `${safeFileName(title)}.mp4`);

  await transcodeToPlayableMp4(mediaUrl, outputPath);

  const fileInfo = await stat(outputPath);
  if (!fileInfo.size || fileInfo.size < 120 * 1024) {
    throw new Error("FFmpeg generó un archivo inválido o vacío.");
  }

  return { tempDir, outputPath };
}

async function sendVideoByPath(sock, from, quoted, { filePath, title }) {
  try {
    await sock.sendMessage(
      from,
      {
        video: { url: filePath },
        mimetype: "video/mp4",
        caption: `🎬 ${title}`,
        ...global.channelInfo,
      },
      quoted
    );
    return "video";
  } catch (e1) {
    console.error("send video file failed:", e1?.message || e1);

    await sock.sendMessage(
      from,
      {
        document: { url: filePath },
        mimetype: "video/mp4",
        fileName: `${title}.mp4`,
        caption: `📄 Enviado como documento\n🎬 ${title}`,
        ...global.channelInfo,
      },
      quoted
    );
    return "document";
  }
}

export default {
  command: ["ytmp4"],
  category: "descarga",

  run: async (ctx) => {
    const { sock, from, args } = ctx;
    const msg = ctx.m || ctx.msg || null;
    const quoted = msg?.key ? { quoted: msg } : undefined;
    const userId = from;

    const until = cooldowns.get(userId);
    if (until && until > Date.now()) {
      return sock.sendMessage(from, {
        text: `⏳ Espera ${getCooldownRemaining(until)}s`,
        ...global.channelInfo,
      });
    }

    cooldowns.set(userId, Date.now() + COOLDOWN_TIME);

    let tempDir = null;

    try {
      if (!args?.length) {
        cooldowns.delete(userId);
        return sock.sendMessage(from, {
          text: "❌ Uso: .ytmp4 <nombre o link>",
          ...global.channelInfo,
        });
      }

      const query = args.join(" ").trim();
      let videoUrl = query;
      let title = "video";
      let thumbnail = null;

      if (!isHttpUrl(query)) {
        const search = await resolveSearch(query);
        videoUrl = search.videoUrl;
        title = search.title;
        thumbnail = search.thumbnail;
      }

      await sock.sendMessage(
        from,
        thumbnail
          ? {
              image: { url: thumbnail },
              caption: `⬇️ Preparando video...\n\n🎬 ${title}\n🎚️ Calidad: ${VIDEO_QUALITY}\n⚙️ Procesando con FFmpeg...`,
              ...global.channelInfo,
            }
          : {
              text: `⬇️ Preparando video...\n\n🎬 ${title}\n🎚️ Calidad: ${VIDEO_QUALITY}\n⚙️ Procesando con FFmpeg...`,
              ...global.channelInfo,
            },
        quoted
      );

      const info = await requestVideoLink(videoUrl);
      title = safeFileName(info.title || title);

      const built = await buildPlayableVideoFile({
        mediaUrl: info.mediaUrl,
        title,
      });

      tempDir = built.tempDir;

      await sendVideoByPath(sock, from, quoted, {
        filePath: built.outputPath,
        title,
      });
    } catch (err) {
      console.error("YTMP4 ERROR:", err?.message || err);
      cooldowns.delete(userId);

      await sock.sendMessage(from, {
        text: `❌ ${String(err?.message || "Error al procesar el video.")}`,
        ...global.channelInfo,
      });
    } finally {
      if (tempDir) {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  },
};

