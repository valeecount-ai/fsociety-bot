import fs from "fs";
import path from "path";
import os from "os";
import axios from "axios";
import yts from "yt-search";
import { pipeline } from "stream/promises";
import { spawn } from "child_process";
import { bindAbort, buildAbortError, throwIfAborted } from "../../lib/command-abort.js";
import { chargeDownloadRequest, refundDownloadCharge } from "../economia/download-access.js";

const API_BASE = "https://dv-yer-api.online";
const API_AUDIO_URL = `${API_BASE}/ytdlmp3`;

const COOLDOWN_TIME = 15 * 1000;
const REQUEST_TIMEOUT = 120000;
const MAX_AUDIO_BYTES = 120 * 1024 * 1024;
const AUDIO_AS_DOCUMENT_THRESHOLD = 60 * 1024 * 1024;
const AUDIO_QUALITY = "128k";
const SEARCH_RESULT_LIMIT = 10;
const TMP_DIR = path.join(os.tmpdir(), "dvyer-spotify");

const cooldowns = new Map();

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function safeFileName(name) {
  return (
    String(name || "audio")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100) || "audio"
  );
}

function normalizeMp3Name(name) {
  const clean = safeFileName(String(name || "audio").replace(/\.mp3$/i, ""));
  return `${clean || "audio"}.mp3`;
}

function normalizeAudioFileName(name, fallbackBase = "audio", fallbackExt = "mp3") {
  const parsed = path.parse(String(name || "").trim());
  const ext = String(parsed.ext || `.${fallbackExt}`).replace(/^\./, "").toLowerCase() || fallbackExt;
  const base = safeFileName(parsed.name || fallbackBase);
  return `${base}.${ext}`;
}

function buildAudioMeta(fileName, contentType, fallbackBase = "audio", sniffed = null) {
  const normalizedType = String(contentType || "").split(";")[0].trim().toLowerCase();
  const rawName = String(fileName || "").trim();
  const ext = path.extname(rawName).replace(/^\./, "").toLowerCase();

  if (sniffed?.ext) {
    return {
      fileName: normalizeAudioFileName(rawName, fallbackBase, sniffed.ext),
      mimetype: sniffed.mimetype,
      isMp3: sniffed.isMp3,
    };
  }

  let finalExt = ext || "bin";
  let mimetype = normalizedType || "application/octet-stream";

  if (ext === "mp3" || normalizedType.includes("audio/mpeg")) {
    finalExt = "mp3";
    mimetype = "audio/mpeg";
  } else if (ext === "m4a" || ext === "mp4" || normalizedType.includes("audio/mp4")) {
    finalExt = "m4a";
    mimetype = "audio/mp4";
  } else if (ext === "aac" || normalizedType.includes("audio/aac")) {
    finalExt = "aac";
    mimetype = "audio/aac";
  } else if (ext === "webm" || normalizedType.includes("audio/webm")) {
    finalExt = "webm";
    mimetype = "audio/webm";
  }

  return {
    fileName: normalizeAudioFileName(rawName, fallbackBase, finalExt),
    mimetype,
    isMp3: finalExt === "mp3",
  };
}

function detectAudioFromFile(filePath) {
  try {
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    const slice = buffer.subarray(0, bytesRead);

    if (slice.length >= 8 && slice.subarray(4, 8).toString("ascii") === "ftyp") {
      return { ext: "m4a", mimetype: "audio/mp4", isMp3: false };
    }

    if (slice.length >= 3 && slice.subarray(0, 3).toString("ascii") === "ID3") {
      return { ext: "mp3", mimetype: "audio/mpeg", isMp3: true };
    }

    if (slice.length >= 4 && slice[0] === 0x1a && slice[1] === 0x45 && slice[2] === 0xdf && slice[3] === 0xa3) {
      return { ext: "webm", mimetype: "audio/webm", isMp3: false };
    }

    if (slice.length >= 2 && slice[0] === 0xff && (slice[1] & 0xe0) === 0xe0) {
      return { ext: "mp3", mimetype: "audio/mpeg", isMp3: true };
    }
  } catch {}

  return null;
}

function getPrefix(settings) {
  if (Array.isArray(settings?.prefix)) {
    return settings.prefix.find((value) => String(value || "").trim()) || ".";
  }

  return String(settings?.prefix || ".").trim() || ".";
}

function getCooldownRemaining(untilMs) {
  return Math.max(0, Math.ceil((untilMs - Date.now()) / 1000));
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function clipText(value = "", max = 72) {
  const normalized = cleanText(value);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(1, max - 3))}...`;
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
  const quotedMessage = getQuotedMessage(ctx, msg);
  const quotedText = extractTextFromMessage(quotedMessage);
  return argsText || quotedText || "";
}

function isSpotifyUrl(value) {
  return /^(https?:\/\/)?(open\.spotify\.com|spotify\.link)\//i.test(
    String(value || "").trim()
  );
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function extractYouTubeUrl(text) {
  const match = String(text || "").match(
    /https?:\/\/(?:www\.)?(?:youtube\.com|music\.youtube\.com|youtu\.be)\/[^\s]+/i
  );
  return match ? match[0].trim() : "";
}

function extractApiError(data, status) {
  return (
    data?.detail ||
    data?.error?.message ||
    data?.message ||
    (status ? `HTTP ${status}` : "Error de API")
  );
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
  if (normalMatch?.[1]) {
    return normalMatch[1].trim();
  }

  return "";
}

function normalizeApiUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${API_BASE}${value}`;
  return `${API_BASE}/${value}`;
}

function deleteFileSafe(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {}
}

function getYoutubeAuthorName(video) {
  return (
    String(video?.author?.name || video?.author || video?.channel || "")
      .trim() || "Desconocido"
  );
}

async function readStreamToText(stream) {
  return await new Promise((resolve, reject) => {
    let data = "";

    stream.on("data", (chunk) => {
      data += chunk.toString();
    });

    stream.on("end", () => resolve(data));
    stream.on("error", reject);
  });
}

async function apiGet(url, params, timeout = REQUEST_TIMEOUT, options = {}) {
  const response = await axios.get(url, {
    timeout,
    params,
    signal: options?.signal || undefined,
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

async function requestYoutubeAudioInfo(videoUrl, meta = {}, options = {}) {
  const data = await apiGet(
    API_AUDIO_URL,
    {
      mode: "link",
      quality: AUDIO_QUALITY,
      url: videoUrl,
    },
    REQUEST_TIMEOUT,
    options
  );

  const downloadUrl = normalizeApiUrl(
    data?.stream_url_full ||
      data?.download_url_full ||
      data?.stream_url ||
      data?.download_url ||
      data?.url
  );

  if (!downloadUrl) {
    throw new Error("No se pudo preparar el audio desde YouTube.");
  }

  return {
    title: safeFileName(data?.title || meta?.title || "audio"),
    artist: cleanText(meta?.artist || meta?.author || "YouTube") || "YouTube",
    duration: cleanText(meta?.duration || ""),
    thumbnail: meta?.thumbnail || null,
    fileName: normalizeMp3Name(data?.filename || meta?.title || "audio.mp3"),
    downloadUrl,
  };
}

async function searchYoutubeResults(query, limit = SEARCH_RESULT_LIMIT) {
  const result = await yts(query);
  const videos = Array.isArray(result?.videos) ? result.videos.slice(0, limit) : [];

  if (!videos.length) {
    throw new Error("No encontre resultados en YouTube.");
  }

  return videos.map((video) => ({
    url: String(video?.url || "").trim(),
    title: clipText(video?.title || "Sin titulo", 72),
    rawTitle: cleanText(video?.title || "audio") || "audio",
    duration: cleanText(video?.timestamp || "??:??") || "??:??",
    author: clipText(getYoutubeAuthorName(video), 42),
    thumbnail: String(video?.thumbnail || "").trim() || null,
  }));
}

async function downloadThumbnailBuffer(url, signal = null) {
  if (!String(url || "").trim()) return null;

  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15000,
    signal,
    validateStatus: () => true,
  });

  if (response.status >= 400 || !response.data) {
    return null;
  }

  return Buffer.from(response.data);
}

async function sendYouTubeSearchPicker(ctx, query, results, options = {}) {
  const { sock, from, quoted, settings } = ctx;
  const signal = options?.signal || null;
  const prefix = getPrefix(settings);
  const rows = results.map((video, index) => ({
    header: `${index + 1}`,
    title: clipText(video.title || "Sin titulo", 72),
    description: clipText(
      `🎵 MP3 | ⏱ ${video.duration || "??:??"} | 👤 ${video.author || "Desconocido"}`,
      72
    ),
    id: `${prefix}spotify ${video.url}`,
  }));

  let thumbBuffer = null;
  try {
    thumbBuffer = await downloadThumbnailBuffer(results[0]?.thumbnail, signal);
  } catch (error) {
    console.error("SPOTIFY thumb search error:", error?.message || error);
  }

  const introPayload = thumbBuffer
    ? {
        image: thumbBuffer,
        caption:
          `🎵 *FSOCIETY BOT*\n\n` +
          `🔎 Resultado para: *${clipText(query, 80)}*\n` +
          `📌 Primer resultado: *${clipText(results[0]?.rawTitle || "Sin titulo", 80)}*\n\n` +
          `Selecciona el audio que quieres descargar.`,
      }
    : {
        text:
          `🎵 *FSOCIETY BOT*\n\n` +
          `🔎 Resultado para: *${clipText(query, 80)}*\n\n` +
          `Selecciona el audio que quieres descargar.`,
      };

  await sock.sendMessage(
    from,
    {
      ...introPayload,
      ...global.channelInfo,
    },
    quoted
  );

  const interactivePayload = {
    text: `Resultados para: ${clipText(query, 80)}`,
    title: "FSOCIETY BOT",
    subtitle: "Selecciona tu audio",
    footer: "YouTube audio",
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "🎵 Descargar audio",
          sections: [
            {
              title: "Resultados",
              rows,
            },
          ],
        }),
      },
    ],
  };

  try {
    await sock.sendMessage(from, interactivePayload, quoted);
  } catch (error) {
    console.error("SPOTIFY interactive search failed:", error?.message || error);

    const fallbackText = rows
      .slice(0, 5)
      .map(
        (row, index) =>
          `${index + 1}. ${row.title}\n${prefix}spotify ${results[index]?.url || ""}`
      )
      .join("\n\n");

    await sock.sendMessage(
      from,
      {
        text:
          `Resultados para: ${clipText(query, 80)}\n\n${fallbackText}\n\n` +
          `Toca o copia uno de los comandos para descargar.`,
        ...global.channelInfo,
      },
      quoted
    );
  }
}

async function downloadAudioFromInternalLink(
  downloadUrl,
  outputPath,
  suggestedFileName = "audio.mp3",
  options = {}
) {
  const signal = options?.signal || null;
  throwIfAborted(signal);

  let response;
  try {
    response = await axios.get(downloadUrl, {
      responseType: "stream",
      timeout: REQUEST_TIMEOUT,
      signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
        Accept: "*/*",
        Referer: `${API_BASE}/`,
      },
      validateStatus: () => true,
      maxRedirects: 5,
    });
  } catch (error) {
    if (signal?.aborted) {
      throw buildAbortError(signal);
    }
    throw error;
  }

  if (response.status >= 400) {
    const errorText = await readStreamToText(response.data).catch(() => "");
    throw new Error(
      extractApiError(
        { message: errorText || "No se pudo descargar el audio." },
        response.status
      )
    );
  }

  const contentLength = Number(response.headers?.["content-length"] || 0);
  if (contentLength && contentLength > MAX_AUDIO_BYTES) {
    throw new Error("El audio es demasiado grande para enviarlo por WhatsApp.");
  }

  let downloaded = 0;

  response.data.on("data", (chunk) => {
    downloaded += chunk.length;
    if (downloaded > MAX_AUDIO_BYTES) {
      response.data.destroy(
        new Error("El audio es demasiado grande para enviarlo por WhatsApp.")
      );
    }
  });

  const outputStream = fs.createWriteStream(outputPath);
  const releaseAbort = bindAbort(signal, () => {
    const abortError = buildAbortError(signal);
    response.data?.destroy?.(abortError);
    outputStream.destroy(abortError);
    deleteFileSafe(outputPath);
  });

  try {
    await pipeline(response.data, outputStream);
  } catch (error) {
    deleteFileSafe(outputPath);
    if (signal?.aborted) {
      throw buildAbortError(signal);
    }
    throw error;
  } finally {
    releaseAbort();
  }

  throwIfAborted(signal);

  if (!fs.existsSync(outputPath)) {
    throw new Error("No se pudo guardar el audio.");
  }

  const size = fs.statSync(outputPath).size;
  if (!size || size < 50000) {
    deleteFileSafe(outputPath);
    throw new Error("El audio descargado es invalido.");
  }

  if (size > MAX_AUDIO_BYTES) {
    deleteFileSafe(outputPath);
    throw new Error("El audio es demasiado grande para enviarlo por WhatsApp.");
  }

  const detectedName = parseContentDispositionFileName(
    response.headers?.["content-disposition"]
  );
  const sniffed = detectAudioFromFile(outputPath);
  const audioMeta = buildAudioMeta(
    detectedName || suggestedFileName || path.basename(outputPath),
    response.headers?.["content-type"],
    "audio",
    sniffed
  );

  return {
    tempPath: outputPath,
    size,
    fileName: audioMeta.fileName,
    mimetype: audioMeta.mimetype,
    isMp3: audioMeta.isMp3,
  };
}

async function convertToMp3(inputPath, outputPath, options = {}) {
  const signal = options?.signal || null;
  throwIfAborted(signal);

  return await new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-y",
        "-i",
        inputPath,
        "-vn",
        "-c:a",
        "libmp3lame",
        "-b:a",
        AUDIO_QUALITY,
        "-ar",
        "44100",
        "-map_metadata",
        "-1",
        "-loglevel",
        "error",
        outputPath,
      ],
      {
        stdio: ["ignore", "ignore", "pipe"],
      }
    );

    let errorText = "";
    let settled = false;
    const releaseAbort = bindAbort(signal, () => {
      deleteFileSafe(outputPath);
      try {
        ffmpeg.kill("SIGKILL");
      } catch {}
    });

    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      releaseAbort();
      reject(signal?.aborted ? buildAbortError(signal) : error);
    };

    const finishResolve = () => {
      if (settled) return;
      settled = true;
      releaseAbort();
      resolve();
    };

    ffmpeg.stderr.on("data", (chunk) => {
      errorText += chunk.toString();
    });

    ffmpeg.on("error", (error) => {
      if (error?.code === "ENOENT") {
        finishReject(new Error("ffmpeg no esta instalado en el hosting."));
        return;
      }
      finishReject(error);
    });

    ffmpeg.on("close", (code) => {
      if (signal?.aborted) {
        finishReject(buildAbortError(signal));
        return;
      }

      if (code === 0) {
        finishResolve();
        return;
      }

      finishReject(new Error(errorText.trim() || `ffmpeg salio con codigo ${code}`));
    });
  });
}

async function sendYouTubeAudio(
  sock,
  from,
  quoted,
  { filePath, fileName, mimetype, title, artist, size, forceDocument = false }
) {
  const artistLabel = cleanText(artist || "YouTube") || "YouTube";
  const shouldSendDocument =
    forceDocument || size > AUDIO_AS_DOCUMENT_THRESHOLD || mimetype !== "audio/mpeg";

  if (shouldSendDocument) {
    await sock.sendMessage(
      from,
      {
        document: { url: filePath },
        mimetype: mimetype || "audio/mpeg",
        fileName,
        caption: `api dvyer\n\n🎵 ${title}\n🎤 ${artistLabel}\n📦 Enviado como documento`,
        ...global.channelInfo,
      },
      quoted
    );
    return "document";
  }

  try {
    const audioBuffer = fs.readFileSync(filePath);

    await sock.sendMessage(
      from,
      {
        audio: audioBuffer,
        mimetype: "audio/mpeg",
        ptt: false,
        fileName,
        ...global.channelInfo,
      },
      quoted
    );

    await sock.sendMessage(
      from,
      {
        text: `api dvyer\n\n🎵 ${title}\n🎤 ${artistLabel}`,
        ...global.channelInfo,
      },
      quoted
    );

    return "audio";
  } catch (error) {
    console.error("send youtube audio failed:", error?.message || error);

    await sock.sendMessage(
      from,
      {
        document: { url: filePath },
        mimetype: "audio/mpeg",
        fileName,
        caption: `api dvyer\n\n🎵 ${title}\n🎤 ${artistLabel}\n📦 Enviado como documento`,
        ...global.channelInfo,
      },
      quoted
    );
    return "document";
  }
}

export default {
  command: ["spotify", "spoti"],
  category: "descarga",
  description: "Busca en YouTube y descarga audio",

  run: async (ctx) => {
    const { sock, from, settings } = ctx;
    const msg = ctx.m || ctx.msg || null;
    const quoted = msg?.key ? { quoted: msg } : undefined;
    const abortSignal = ctx.abortSignal || null;
    const userId = `${from}:spotify`;

    let rawAudioPath = null;
    let finalMp3Path = null;
    let downloadCharge = null;

    const until = cooldowns.get(userId);
    if (until && until > Date.now()) {
      return sock.sendMessage(
        from,
        {
          text: `⏳ Espera ${getCooldownRemaining(until)}s`,
          ...global.channelInfo,
        },
        quoted
      );
    }

    cooldowns.set(userId, Date.now() + COOLDOWN_TIME);

    try {
      const userInput = resolveUserInput(ctx);

      if (!userInput) {
        cooldowns.delete(userId);
        return sock.sendMessage(
          from,
          {
            text: "❌ Uso: .spotify <cancion o link de YouTube>",
            ...global.channelInfo,
          },
          quoted
        );
      }

      if (isSpotifyUrl(userInput)) {
        cooldowns.delete(userId);
        return sock.sendMessage(
          from,
          {
            text: "❌ Este comando ahora solo trabaja con busquedas o links de YouTube.",
            ...global.channelInfo,
          },
          quoted
        );
      }

      throwIfAborted(abortSignal);

      const youtubeUrl = extractYouTubeUrl(userInput);
      const plainQuery = !youtubeUrl;

      if (plainQuery) {
        if (isHttpUrl(userInput)) {
          cooldowns.delete(userId);
          return sock.sendMessage(
            from,
            {
              text: "❌ Enviame una cancion o un link valido de YouTube.",
              ...global.channelInfo,
            },
            quoted
          );
        }

        const results = await searchYoutubeResults(userInput, SEARCH_RESULT_LIMIT);
        throwIfAborted(abortSignal);
        await sendYouTubeSearchPicker(
          { sock, from, quoted, settings },
          userInput,
          results,
          { signal: abortSignal }
        );
        cooldowns.delete(userId);
        return;
      }

      downloadCharge = await chargeDownloadRequest(ctx, {
        feature: "spotify",
        query: userInput,
      });
      if (!downloadCharge.ok) {
        cooldowns.delete(userId);
        return;
      }

      await sock.sendMessage(
        from,
        {
          text: `🎵 Preparando audio desde YouTube...\n\n🌐 ${API_BASE}`,
          ...global.channelInfo,
        },
        quoted
      );

      const info = await requestYoutubeAudioInfo(
        youtubeUrl,
        {
          artist: "YouTube",
        },
        { signal: abortSignal }
      );

      if (info.thumbnail) {
        await sock.sendMessage(
          from,
          {
            image: { url: info.thumbnail },
            caption:
              `api dvyer\n\n🎵 ${info.title}\n🎤 ${info.artist}` +
              `${info.duration ? `\n⏱️ ${info.duration}` : ""}`,
            ...global.channelInfo,
          },
          quoted
        );
      }

      const stamp = Date.now();
      rawAudioPath = path.join(TMP_DIR, `${stamp}-raw.bin`);
      finalMp3Path = path.join(TMP_DIR, `${stamp}-final.mp3`);

      const downloaded = await downloadAudioFromInternalLink(
        info.downloadUrl,
        rawAudioPath,
        info.fileName,
        { signal: abortSignal }
      );

      let sendPath = downloaded.tempPath;
      let sendName = downloaded.fileName;
      let sendMime = downloaded.mimetype;
      let forceDocument = false;

      if (!downloaded.isMp3) {
        try {
          await convertToMp3(downloaded.tempPath, finalMp3Path, { signal: abortSignal });
          sendPath = finalMp3Path;
          sendName = normalizeMp3Name(info.title || downloaded.fileName);
          sendMime = "audio/mpeg";
        } catch (convertError) {
          console.warn("SPOTIFY mp3 conversion fallback:", convertError?.message || convertError);
          forceDocument = true;
        }
      }

      throwIfAborted(abortSignal);

      await sendYouTubeAudio(sock, from, quoted, {
        filePath: sendPath,
        fileName: sendName,
        mimetype: sendMime,
        title: info.title,
        artist: info.artist,
        size: fs.existsSync(sendPath) ? fs.statSync(sendPath).size : downloaded.size,
        forceDocument,
      });
    } catch (error) {
      const aborted = abortSignal?.aborted === true;
      console.error("SPOTIFY ERROR:", error?.message || error);
      refundDownloadCharge(ctx, downloadCharge, {
        feature: "spotify",
        error: String(error?.message || error || "unknown_error"),
      });
      cooldowns.delete(userId);

      if (aborted) {
        return;
      }

      await sock.sendMessage(
        from,
        {
          text: `❌ ${String(error?.message || "No se pudo procesar el audio.")}`,
          ...global.channelInfo,
        },
        quoted
      );
    } finally {
      deleteFileSafe(rawAudioPath);
      deleteFileSafe(finalMp3Path);
    }
  },
};
