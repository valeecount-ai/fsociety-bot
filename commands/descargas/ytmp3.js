import fs from "fs";
import path from "path";
import os from "os";
import http from "http";
import https from "https";
import axios from "axios";
import yts from "yt-search";
import { spawn } from "child_process";
import { pipeline } from "stream/promises";
import { randomUUID } from "crypto";
import { buildDvyerUrl } from "../../lib/api-manager.js";
import { chargeDownloadRequest, refundDownloadCharge } from "../economia/download-access.js";

const API_YTMP3_URL = buildDvyerUrl("/ytmp3");
const TMP_DIR = path.join(os.tmpdir(), "dvyer-ytmp3");
const REQUEST_TIMEOUT = 20 * 60 * 1000;
const MAX_AUDIO_BYTES = 800 * 1024 * 1024;
const AUDIO_AS_DOCUMENT_THRESHOLD = 80 * 1024 * 1024;
const MIN_AUDIO_BYTES = 20 * 1024;
const COVER_MAX_BYTES = 8 * 1024 * 1024;
const METADATA_TIMEOUT = 4 * 60 * 1000;
const MP3_COMPAT_TRANSCODE_MAX_BYTES = 260 * 1024 * 1024;
const FFMPEG_MIN_TIMEOUT = 35_000;
const FFMPEG_MAX_TIMEOUT = 480_000;
const HTTP_AGENT = new http.Agent({ keepAlive: true });
const HTTPS_AGENT = new https.Agent({ keepAlive: true });

function ensureTmpDir() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function cleanupOldFiles(maxAgeMs = 6 * 60 * 60 * 1000) {
  ensureTmpDir();
  const now = Date.now();
  for (const entry of fs.readdirSync(TMP_DIR, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const filePath = path.join(TMP_DIR, entry.name);
    try {
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > maxAgeMs) fs.unlinkSync(filePath);
    } catch {}
  }
}

function deleteFileSafe(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanMetadataText(value = "", fallback = "YouTube MP3") {
  const text = cleanText(value).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return text.slice(0, 180) || fallback;
}

function clipText(value = "", max = 90) {
  const text = cleanText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 3))}...`;
}

function humanBytes(bytes = 0) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return "N/D";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 100 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function safeFileName(name) {
  return (
    String(name || "youtube-audio")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/[^\w .()[\]-]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "youtube-audio"
  );
}

function normalizeMp3Name(name) {
  const parsed = path.parse(String(name || "").trim());
  const base = safeFileName(parsed.name || name || "youtube-audio");
  return `${base || "youtube-audio"}.mp3`;
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

function getQuotedMessage(ctx, msg) {
  return (
    ctx?.quoted ||
    msg?.quoted ||
    msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
    null
  );
}

function resolveUserInput(ctx) {
  const msg = ctx.m || ctx.msg || null;
  const argsText = Array.isArray(ctx.args) ? ctx.args.join(" ").trim() : "";
  const quotedText = extractTextFromMessage(getQuotedMessage(ctx, msg));
  return argsText || quotedText || "";
}

function extractYouTubeUrl(text) {
  const match = String(text || "").match(
    /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s]+/i
  );
  return match ? match[0].trim() : "";
}

function extractYouTubeId(value) {
  const text = String(value || "");
  const match = text.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/))([a-zA-Z0-9_-]{11})/i
  );
  return match?.[1] || "";
}

function buildYoutubeCoverUrl(videoUrl, fallback = "") {
  const videoId = extractYouTubeId(videoUrl);
  if (videoId) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return /^https?:\/\//i.test(fallback) ? fallback : "";
}

function parseContentDispositionFileName(headerValue) {
  const text = String(headerValue || "");
  const utfMatch = text.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]).replace(/["']/g, "").trim();
    } catch {}
  }
  const normalMatch = text.match(/filename="?([^"]+)"?/i);
  return normalMatch?.[1]?.trim() || "";
}

async function readStreamToText(stream) {
  if (!stream) return "";
  if (typeof stream[Symbol.asyncIterator] === "function") {
    let data = "";
    for await (const chunk of stream) {
      data += chunkToText(chunk);
      if (data.length > 20000) data = data.slice(-20000);
    }
    return data;
  }
  if (typeof stream.on !== "function") return "";
  return await new Promise((resolve, reject) => {
    let data = "";
    stream.on("data", (chunk) => {
      data += chunkToText(chunk);
      if (data.length > 20000) data = data.slice(-20000);
    });
    stream.on("end", () => resolve(data));
    stream.on("error", reject);
  });
}

function chunkToText(chunk) {
  if (chunk == null) return "";
  if (Buffer.isBuffer(chunk)) return chunk.toString("utf8");
  return String(chunk);
}

function ffmpegTimeoutForBytes(bytes) {
  const mb = Math.max(1, Math.round(Number(bytes || 0) / (1024 * 1024)));
  return Math.max(FFMPEG_MIN_TIMEOUT, Math.min(FFMPEG_MAX_TIMEOUT, mb * 1400));
}

function isLikelyMp3Source(data) {
  const contentType = String(data?.contentType || "").toLowerCase();
  const fileName = String(data?.fileName || "").toLowerCase();
  const sourcePath = String(data?.tempPath || "");
  if (contentType.includes("audio/mpeg") || contentType.includes("audio/mp3")) return true;
  if (fileName.endsWith(".mp3")) return true;
  try {
    if (!sourcePath || !fs.existsSync(sourcePath)) return false;
    const fd = fs.openSync(sourcePath, "r");
    try {
      const header = Buffer.alloc(10);
      const read = fs.readSync(fd, header, 0, header.length, 0);
      if (read >= 3 && header.slice(0, 3).toString("ascii") === "ID3") return true;
      if (read >= 2) {
        const b0 = header[0];
        const b1 = header[1];
        if (b0 === 0xff && (b1 & 0xe0) === 0xe0) return true;
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {}
  return false;
}

async function ensureMp3Compatible(downloaded) {
  if (isLikelyMp3Source(downloaded)) return downloaded;
  const size = Number(downloaded?.size || 0);
  if (!Number.isFinite(size) || size <= 0 || size > MP3_COMPAT_TRANSCODE_MAX_BYTES) return downloaded;

  const sourcePath = String(downloaded?.tempPath || "");
  if (!sourcePath || !fs.existsSync(sourcePath)) return downloaded;

  const outputPath = path.join(TMP_DIR, `${Date.now()}-${randomUUID()}-ytmp3-fixed.mp3`);
  const timeoutMs = ffmpegTimeoutForBytes(size);
  try {
    await runFfmpeg(
      [
        "-y",
        "-i",
        sourcePath,
        "-vn",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-id3v2_version",
        "3",
        "-map_metadata",
        "-1",
        "-loglevel",
        "error",
        outputPath,
      ],
      timeoutMs
    );
    const stat = fs.existsSync(outputPath) ? fs.statSync(outputPath) : null;
    if (!stat?.size || stat.size < MIN_AUDIO_BYTES) {
      deleteFileSafe(outputPath);
      return downloaded;
    }
    deleteFileSafe(sourcePath);
    return {
      ...downloaded,
      tempPath: outputPath,
      fileName: normalizeMp3Name(downloaded?.fileName || "youtube-audio.mp3"),
      size: stat.size,
      contentType: "audio/mpeg",
    };
  } catch (error) {
    deleteFileSafe(outputPath);
    console.warn("YTMP3 compat transcode skipped:", error?.message || error);
    return downloaded;
  }
}

function extractApiError(data, status) {
  return (
    data?.detail ||
    data?.error?.message ||
    data?.message ||
    (status ? `HTTP ${status}` : "Error de API")
  );
}

async function resolveInputToUrl(input) {
  const directUrl = extractYouTubeUrl(input);
  if (directUrl) {
    return {
      url: directUrl,
      title: "YouTube MP3",
      thumbnail: buildYoutubeCoverUrl(directUrl),
      searched: false,
    };
  }

  const query = cleanText(input);
  if (!query) return null;

  const results = await yts(query);
  const video = Array.isArray(results?.videos) ? results.videos.find((item) => item?.url) : null;
  if (!video?.url) {
    throw new Error("No encontre resultados en YouTube.");
  }

  return {
    url: video.url,
    title: cleanText(video.title || "YouTube MP3"),
    duration: cleanText(video.timestamp || ""),
    author: cleanText(video.author?.name || video.author || ""),
    thumbnail: buildYoutubeCoverUrl(video.url, video.thumbnail || ""),
    searched: true,
  };
}

async function downloadYtmp3(videoUrl, preferredName) {
  ensureTmpDir();
  const tempName = `${Date.now()}-${randomUUID()}-ytmp3.mp3`;
  const outputPath = path.join(TMP_DIR, tempName);

  const response = await axios.get(API_YTMP3_URL, {
    responseType: "stream",
    timeout: REQUEST_TIMEOUT,
    params: {
      mode: "stream",
      url: videoUrl,
    },
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145 Safari/537.36",
      Accept: "*/*",
    },
    httpAgent: HTTP_AGENT,
    httpsAgent: HTTPS_AGENT,
    maxRedirects: 5,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    validateStatus: () => true,
  });

  if (response.status >= 400) {
    const errorText = await readStreamToText(response.data).catch(() => "");
    let parsed = null;
    try {
      parsed = JSON.parse(errorText);
    } catch {}
    throw new Error(extractApiError(parsed || { message: errorText }, response.status));
  }

  const contentLength = Number(response.headers?.["content-length"] || 0);
  if (contentLength > MAX_AUDIO_BYTES) {
    throw new Error(`El MP3 pesa ${humanBytes(contentLength)} y supera el limite del bot.`);
  }

  let downloaded = 0;
  response.data.on("data", (chunk) => {
    downloaded += chunk.length;
    if (downloaded > MAX_AUDIO_BYTES) {
      response.data.destroy(new Error("El MP3 es demasiado grande para enviarlo por WhatsApp."));
    }
  });

  try {
    await pipeline(response.data, fs.createWriteStream(outputPath));
  } catch (error) {
    deleteFileSafe(outputPath);
    throw error;
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error("No se pudo guardar el MP3.");
  }

  const size = fs.statSync(outputPath).size;
  if (size < MIN_AUDIO_BYTES) {
    deleteFileSafe(outputPath);
    throw new Error("El archivo MP3 descargado es invalido.");
  }
  if (size > MAX_AUDIO_BYTES) {
    deleteFileSafe(outputPath);
    throw new Error(`El MP3 pesa ${humanBytes(size)} y supera el limite del bot.`);
  }

  const headerName = parseContentDispositionFileName(response.headers?.["content-disposition"]);
  const fileName = normalizeMp3Name(headerName || preferredName || "youtube-audio.mp3");

  return {
    tempPath: outputPath,
    fileName,
    size,
    contentType: response.headers?.["content-type"] || "audio/mpeg",
  };
}

function getMp3Title(resolved, downloaded) {
  const resolvedTitle = cleanText(resolved?.title || "");
  if (resolvedTitle && resolvedTitle.toLowerCase() !== "youtube mp3") return resolvedTitle;
  return cleanText(path.parse(downloaded?.fileName || "").name || "YouTube MP3");
}

async function downloadCoverImage(coverUrl) {
  if (!coverUrl) return null;

  const response = await axios.get(coverUrl, {
    responseType: "arraybuffer",
    timeout: 30_000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145 Safari/537.36",
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
    httpAgent: HTTP_AGENT,
    httpsAgent: HTTPS_AGENT,
    maxRedirects: 3,
    validateStatus: () => true,
  });

  const contentType = String(response.headers?.["content-type"] || "");
  if (response.status >= 400 || !contentType.startsWith("image/")) {
    throw new Error(`cover HTTP ${response.status}`);
  }

  const buffer = Buffer.from(response.data || []);
  if (!buffer.length) throw new Error("cover vacia");
  if (buffer.length > COVER_MAX_BYTES) throw new Error("cover demasiado grande");

  ensureTmpDir();
  const coverPath = path.join(TMP_DIR, `${Date.now()}-${randomUUID()}-cover.jpg`);
  fs.writeFileSync(coverPath, buffer);
  return coverPath;
}

function runFfmpeg(args, timeoutMs = METADATA_TIMEOUT) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let stderr = "";

    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill("SIGKILL");
      reject(new Error("metadata timeout"));
    }, timeoutMs);

    child.stderr.on("data", (chunk) => {
      stderr += chunkToText(chunk);
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });

    child.on("error", (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error(stderr.trim() || `ffmpeg exited ${code}`));
    });
  });
}

async function writeMp3Metadata(downloaded, resolved) {
  const title = cleanMetadataText(getMp3Title(resolved, downloaded));
  const coverUrl = buildYoutubeCoverUrl(resolved?.url, resolved?.thumbnail || "");
  const outputPath = path.join(TMP_DIR, `${Date.now()}-${randomUUID()}-ytmp3-meta.mp3`);
  let coverPath = null;

  try {
    if (downloaded.size > AUDIO_AS_DOCUMENT_THRESHOLD) {
      return {
        ...downloaded,
        fileName: normalizeMp3Name(title || downloaded.fileName),
        title,
      };
    }

    try {
      coverPath = await downloadCoverImage(coverUrl);
    } catch (error) {
      console.warn("YTMP3 cover skipped:", error?.message || error);
    }

    const args = ["-y", "-i", downloaded.tempPath];
    if (coverPath) args.push("-i", coverPath);

    args.push("-map", "0:a:0");
    if (coverPath) args.push("-map", "1:v:0");

    args.push("-c:a", "copy", "-id3v2_version", "3", "-metadata", `title=${title}`);

    if (coverPath) {
      args.push(
        "-c:v",
        "mjpeg",
        "-metadata:s:v",
        "title=Album cover",
        "-metadata:s:v",
        "comment=Cover (front)",
        "-disposition:v:0",
        "attached_pic"
      );
    }

    args.push("-loglevel", "error", outputPath);

    await runFfmpeg(args);

    const size = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
    if (size < MIN_AUDIO_BYTES) throw new Error("metadata output invalido");

    deleteFileSafe(downloaded.tempPath);
    return {
      ...downloaded,
      tempPath: outputPath,
      fileName: normalizeMp3Name(title),
      size,
      title,
    };
  } catch (error) {
    deleteFileSafe(outputPath);
    console.warn("YTMP3 metadata skipped:", error?.message || error);
    return {
      ...downloaded,
      fileName: normalizeMp3Name(title || downloaded.fileName),
      title,
    };
  } finally {
    deleteFileSafe(coverPath);
  }
}

async function sendMp3(sock, from, quoted, data) {
  const caption = [
    "╭─〔 *DVYER • YTMP3* 〕",
    `┃ ♬ Titulo: ${clipText(data.title || data.fileName, 80)}`,
    `┃ ⌁ Peso: ${humanBytes(data.size)}`,
    `┃ ◈ Envio: ${data.size <= AUDIO_AS_DOCUMENT_THRESHOLD ? "audio" : "documento"}`,
    "╰─⟡ MP3 listo.",
  ].join("\n");

  if (data.size <= AUDIO_AS_DOCUMENT_THRESHOLD) {
    try {
      await sock.sendMessage(
        from,
        {
          audio: { url: data.tempPath },
          mimetype: "audio/mpeg",
          fileName: data.fileName,
          ptt: false,
          ...global.channelInfo,
        },
        quoted
      );
      return "audio";
    } catch (error) {
      console.error("YTMP3 audio send fallback:", error?.message || error);
    }
  }

  await sock.sendMessage(
    from,
    {
      document: { url: data.tempPath },
      mimetype: "audio/mpeg",
      fileName: data.fileName,
      caption,
      ...global.channelInfo,
    },
    quoted
  );
  return "document";
}

export default {
  command: ["ytmp3", "yta", "ytaudio"],
  category: "descarga",

  run: async (ctx) => {
    const { sock, from } = ctx;
    const msg = ctx.m || ctx.msg || null;
    const quoted = msg?.key ? { quoted: msg } : undefined;

    let tempPath = null;
    let downloadCharge = null;

    try {
      cleanupOldFiles();

      const input = resolveUserInput(ctx);
      const resolved = await resolveInputToUrl(input);

      if (!resolved?.url) {
        return sock.sendMessage(
          from,
          {
            text: [
              "╭─〔 *DVYER • YTMP3* 〕",
              "┃ Uso: .ytmp3 <link o nombre>",
              "┃ Ejemplo: .ytmp3 ozuna odisea",
              "┃ Ejemplo: .ytmp3 https://youtu.be/xxxx",
              "╰─⟡ Envia MP3 rapido desde la API.",
            ].join("\n"),
            ...global.channelInfo,
          },
          quoted
        );
      }

      downloadCharge = await chargeDownloadRequest(ctx, {
        feature: "ytmp3",
        videoUrl: resolved.url,
      });
      if (!downloadCharge.ok) return;

      await sock.sendMessage(
        from,
        {
          text: [
            "╭─〔 *DVYER • YTMP3* 〕",
            `┃ ♬ Titulo: ${clipText(resolved.title, 80)}`,
            resolved.duration ? `┃ ⏱ Duracion: ${resolved.duration}` : "┃ ⏱ Duracion: detectando",
            "┃ ⚡ Modo: descarga directa",
            "┃ ◈ Regla: audio hasta 80 MB",
            "╰─⟡ Preparando MP3 con portada...",
          ].join("\n"),
          ...global.channelInfo,
        },
        quoted
      );

      const downloaded = await downloadYtmp3(resolved.url, resolved.title);
      tempPath = downloaded.tempPath;
      const compatible = await ensureMp3Compatible(downloaded);
      tempPath = compatible.tempPath;
      const tagged = await writeMp3Metadata(compatible, resolved);
      tempPath = tagged.tempPath;

      await sendMp3(sock, from, quoted, tagged);
    } catch (error) {
      console.error("YTMP3 ERROR:", error?.message || error);
      refundDownloadCharge(ctx, downloadCharge, {
        feature: "ytmp3",
        error: String(error?.message || error || "unknown_error"),
      });

      await sock.sendMessage(
        from,
        {
          text: `❌ ${String(error?.message || "No se pudo preparar el MP3.")}`,
          ...global.channelInfo,
        },
        quoted
      );
    } finally {
      deleteFileSafe(tempPath);
    }
  },
};
