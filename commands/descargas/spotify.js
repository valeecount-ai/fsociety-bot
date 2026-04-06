
import fs from "fs";
import path from "path";
import os from "os";
import axios from "axios";
import { pipeline } from "stream/promises";
import { spawn } from "child_process";

// Configuración
const API_BASE_URL = "https://dv-yer-api.online";
const API_SPOTIFY_PATH = "/spotify";
const SPOTIFY_WEB_BASE = "https://open.spotify.com";
const TMP_DIR = path.join(os.tmpdir(), "spotify-downloads");
const AUDIO_QUALITY = "128k";
const REQUEST_TIMEOUT = 120000;
const MAX_AUDIO_BYTES = 120 * 1024 * 1024;
const AUDIO_AS_DOCUMENT_THRESHOLD = 60 * 1024 * 1024;

// Cooldown para evitar abuso
const cooldowns = new Map();

// Crear directorio temporal
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ============ UTILIDADES ============

function ensureTmpDir() {
  try {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  } catch {}
}

function safeFileName(name) {
  return (
    String(name || "spotify")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100) || "spotify"
  );
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function clipText(value = "", max = 72) {
  const normalized = cleanText(value);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(1, max - 3))}...`;
}

function normalizeAudioFileName(name, fallbackBase = "spotify", fallbackExt = "mp3") {
  const parsed = path.parse(String(name || "").trim());
  const ext = String(parsed.ext || `.${fallbackExt}`).replace(/^\./, "").toLowerCase() || fallbackExt;
  const base = safeFileName(parsed.name || fallbackBase);
  return `${base}.${ext}`;
}

function extractApiError(data, status) {
  return (
    data?.detail ||
    data?.error?.message ||
    data?.message ||
    (status ? `HTTP ${status}` : "Error de API")
  );
}

function getCooldownRemaining(untilMs) {
  return Math.max(0, Math.ceil((untilMs - Date.now()) / 1000));
}

function isSpotifyUrl(value) {
  return /^(https?:\/\/)?(open\.spotify\.com|spotify\.link)\//i.test(
    String(value || "").trim()
  );
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function extractSpotifyEntityType(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const uriMatch = text.match(/^spotify:([a-z]+):/i);
  if (uriMatch?.[1]) {
    return String(uriMatch[1]).toLowerCase();
  }

  const urlMatch = text.match(/open\.spotify\.com\/(?:intl-[^/]+\/)?([a-z]+)\//i);
  if (urlMatch?.[1]) {
    return String(urlMatch[1]).toLowerCase();
  }

  return "";
}

function resolveUserInput(ctx) {
  const msg = ctx.m || ctx.msg || null;
  const argsText = Array.isArray(ctx.args) ? ctx.args.join(" ").trim() : "";
  const quotedMessage = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
  const quotedText = quotedMessage?.extendedTextMessage?.text || 
                     quotedMessage?.imageMessage?.caption || 
                     quotedMessage?.videoMessage?.caption || 
                     "";
  return argsText || quotedText || "";
}

function getPrefix(settings) {
  if (Array.isArray(settings?.prefix)) {
    return settings.prefix.find((value) => String(value || "").trim()) || ".";
  }
  return String(settings?.prefix || ".").trim() || ".";
}

function deleteFileSafe(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {}
}

function detectAudioFormat(filePath) {
  try {
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    const slice = buffer.subarray(0, bytesRead);

    // Detectar MP3
    if (slice.length >= 3 && slice.subarray(0, 3).toString("ascii") === "ID3") {
      return { ext: "mp3", mimetype: "audio/mpeg", isMp3: true };
    }

    if (slice.length >= 2 && slice[0] === 0xff && (slice[1] & 0xe0) === 0xe0) {
      return { ext: "mp3", mimetype: "audio/mpeg", isMp3: true };
    }

    // Detectar M4A
    if (slice.length >= 8 && slice.subarray(4, 8).toString("ascii") === "ftyp") {
      return { ext: "m4a", mimetype: "audio/mp4", isMp3: false };
    }

    // Detectar WebM
    if (slice.length >= 4 && slice[0] === 0x1a && slice[1] === 0x45 && slice[2] === 0xdf && slice[3] === 0xa3) {
      return { ext: "webm", mimetype: "audio/webm", isMp3: false };
    }
  } catch {}

  return { ext: "bin", mimetype: "application/octet-stream", isMp3: false };
}

// ============ BÚSQUEDA EN SPOTIFY ============

async function searchSpotifyTracks(query, limit = 10) {
  try {
    const response = await axios.get(API_BASE_URL + API_SPOTIFY_PATH, {
      params: {
        q: cleanText(query),
        mode: "search",
        lang: "es",
        limit: Math.min(limit, 20),
      },
      timeout: REQUEST_TIMEOUT,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      throw new Error(
        cleanText(extractApiError(response.data, response.status)) || "Error al buscar en Spotify"
      );
    }

    const results = response.data?.results || [];
    if (!results.length) {
      throw new Error("No se encontraron resultados en Spotify");
    }

    return results.map((track, index) => ({
      index: index + 1,
      title: cleanText(track.title || "Sin título"),
      artist: cleanText(track.artist || "Spotify"),
      duration: track.duration || "??:??",
      thumbnail: track.thumbnail || null,
      spotifyUrl: track.spotify_url || "",
      downloadUrl: track.download_url_full || track.download_url || "",
      fileName: track.filename || `${track.title} - ${track.artist}.mp3`,
    }));
  } catch (error) {
    throw error;
  }
}

// ============ OBTENER INFO DE DESCARGA ============

async function getSpotifyDownloadInfo(input) {
  try {
    const params = {
      mode: "link",
      lang: "es",
    };

    if (isSpotifyUrl(cleanText(input))) {
      params.url = cleanText(input);
    } else {
      params.q = cleanText(input);
    }

    const response = await axios.get(API_BASE_URL + API_SPOTIFY_PATH, {
      params,
      timeout: REQUEST_TIMEOUT,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      throw new Error(
        cleanText(extractApiError(response.data, response.status)) || "Error en la API de Spotify"
      );
    }

    const data = response.data;
    const selected = data.selected || data;
    const downloadUrl = selected.download_url_full || selected.download_url || data.download_url_full || data.download_url;

    if (!downloadUrl) {
      throw new Error("La API no devolvió enlace de descarga");
    }

    return {
      title: cleanText(selected.title || data.title || "spotify"),
      artist: cleanText(selected.artist || data.artist || "Spotify"),
      duration: selected.duration || data.duration || null,
      thumbnail: selected.thumbnail || data.thumbnail || null,
      spotifyUrl: selected.spotify_url || data.spotify_url || "",
      fileName: normalizeAudioFileName(
        selected.filename || data.filename || `${selected.title || data.title} - ${selected.artist || data.artist}`,
        `${selected.title || data.title} - ${selected.artist || data.artist}`,
        "mp3"
      ),
      downloadUrl: String(downloadUrl).trim(),
    };
  } catch (error) {
    throw error;
  }
}

// ============ DESCARGA DE AUDIO ============

async function downloadAudio(downloadUrl, outputPath, fileName = "spotify.mp3") {
  ensureTmpDir();

  try {
    const response = await axios.get(downloadUrl, {
      responseType: "stream",
      timeout: REQUEST_TIMEOUT,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "*/*",
      },
      maxRedirects: 5,
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      throw new Error(`Error al descargar: HTTP ${response.status}`);
    }

    const contentLength = Number(response.headers?.["content-length"] || 0);
    if (contentLength && contentLength > MAX_AUDIO_BYTES) {
      throw new Error("El audio es demasiado grande para WhatsApp (máx 120MB)");
    }

    let downloaded = 0;
    response.data.on("data", (chunk) => {
      downloaded += chunk.length;
      if (downloaded > MAX_AUDIO_BYTES) {
        response.data.destroy(
          new Error("El audio excede el tamaño máximo permitido")
        );
      }
    });

    const outputStream = fs.createWriteStream(outputPath);

    await pipeline(response.data, outputStream);

    if (!fs.existsSync(outputPath)) {
      throw new Error("No se pudo guardar el archivo");
    }

    const size = fs.statSync(outputPath).size;
    if (!size || size < 50000) {
      deleteFileSafe(outputPath);
      throw new Error("El archivo descargado es inválido o está vacío");
    }

    if (size > MAX_AUDIO_BYTES) {
      deleteFileSafe(outputPath);
      throw new Error("El audio es demasiado grande");
    }

    const audioFormat = detectAudioFormat(outputPath);

    return {
      tempPath: outputPath,
      size,
      fileName: normalizeAudioFileName(fileName, "spotify", audioFormat.ext),
      mimetype: audioFormat.mimetype,
      ext: audioFormat.ext,
      isMp3: audioFormat.isMp3,
    };
  } catch (error) {
    deleteFileSafe(outputPath);
    throw error;
  }
}

// ============ CONVERSIÓN A MP3 ============

async function convertToMp3(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
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
    ]);

    let errorText = "";
    let settled = false;

    ffmpeg.stderr.on("data", (chunk) => {
      errorText += chunk.toString();
    });

    ffmpeg.on("error", (error) => {
      if (settled) return;
      settled = true;
      deleteFileSafe(outputPath);
      if (error?.code === "ENOENT") {
        reject(new Error("ffmpeg no está instalado"));
        return;
      }
      reject(error);
    });

    ffmpeg.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) {
        resolve();
      } else {
        deleteFileSafe(outputPath);
        reject(new Error(errorText.trim() || `ffmpeg error code ${code}`));
      }
    });
  });
}

// ============ ENVÍO DE AUDIO ============

async function sendSpotifyAudio(sock, from, quoted, { filePath, fileName, mimetype, title, artist, size, forceDocument = false }) {
  const artistLabel = cleanText(artist || "Spotify") || "Spotify";
  const shouldSendDocument = forceDocument || size > AUDIO_AS_DOCUMENT_THRESHOLD;

  try {
    if (shouldSendDocument) {
      await sock.sendMessage(
        from,
        {
          document: { url: filePath },
          mimetype: "audio/mpeg",
          fileName,
          caption: `🎵 *${title}*\n🎤 ${artistLabel}\n\n📦 Enviado como documento`,
          ...global.channelInfo,
        },
        quoted
      );
      return "document";
    }

    await sock.sendMessage(
      from,
      {
        audio: { url: filePath },
        mimetype: mimetype || "audio/mpeg",
        ptt: false,
        fileName,
        ...global.channelInfo,
      },
      quoted
    );
    return "audio";
  } catch (error) {
    console.warn("Error enviando audio, intentando como documento:", error.message);
    await sock.sendMessage(
      from,
      {
        document: { url: filePath },
        mimetype: "audio/mpeg",
        fileName,
        caption: `🎵 *${title}*\n🎤 ${artistLabel}\n\n📦 Enviado como documento`,
        ...global.channelInfo,
      },
      quoted
    );
    return "document";
  }
}

// ============ PICKER DE BÚSQUEDA ============

async function sendSpotifySearchPicker(ctx, query, results) {
  const { sock, from, quoted, settings } = ctx;
  const prefix = getPrefix(settings);

  const rows = results.slice(0, 10).map((result, index) => ({
    header: `${index + 1}`,
    title: clipText(result.title, 72),
    description: clipText(
      `🎵 Spotify | ⏱ ${result.duration} | 👤 ${result.artist}`,
      72
    ),
    id: `${prefix}spotify ${result.spotifyUrl}`,
  }));

  try {
    // Mensaje con imagen si hay thumbnail
    if (results[0]?.thumbnail) {
      try {
        const imgResponse = await axios.get(results[0].thumbnail, { responseType: "arraybuffer" });
        if (imgResponse.status === 200) {
          await sock.sendMessage(
            from,
            {
              image: Buffer.from(imgResponse.data),
              caption:
                `🟢 *SPOTIFY SEARCH*\n\n` +
                `🔎 Resultados para: *${clipText(query, 80)}*\n` +
                `📌 Top: *${clipText(results[0].title, 80)}*\n` +
                `🎤 ${clipText(results[0].artist, 60)}\n\n` +
                `Selecciona la canción que quieres descargar:`,
              ...global.channelInfo,
            },
            quoted
          );
        }
      } catch (imgError) {
        console.warn("No se pudo descargar la imagen:", imgError.message);
      }
    }

    // Mensaje interactivo con botones
    const interactivePayload = {
      text: `Resultados para: ${clipText(query, 80)}`,
      title: "🎵 SPOTIFY",
      subtitle: "Elige una canción",
      footer: "Descargas Spotify",
      interactiveButtons: [
        {
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: "🎵 Seleccionar canción",
            sections: [
              {
                title: "Resultados de búsqueda",
                rows,
              },
            ],
          }),
        },
      ],
    };

    try {
      await sock.sendMessage(from, interactivePayload, quoted);
    } catch (buttonError) {
      console.warn("Botones no soportados, enviando lista de texto:", buttonError.message);
      const fallbackText = rows
        .slice(0, 5)
        .map((row) => `*${row.header}. ${row.title}*\n${row.description}\n${row.id}`)
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
  } catch (error) {
    console.error("Error en search picker:", error.message);
  }
}

// ============ COMANDO PRINCIPAL ============

export default {
  name: "spotify",
  command: ["spotify", "spoti"],
  category: "descarga",
  description: "🎵 Busca y descarga canciones de Spotify en MP3",

  run: async (ctx) => {
    const { sock, from, settings } = ctx;
    const msg = ctx.m || ctx.msg || null;
    const quoted = msg?.key ? { quoted: msg } : undefined;
    const userId = `${from}:spotify`;

    let rawAudioPath = null;
    let finalMp3Path = null;

    // Control de cooldown
    const COOLDOWN_TIME = 3000; // 3 segundos

    if (COOLDOWN_TIME > 0) {
      const until = cooldowns.get(userId);
      if (until && until > Date.now()) {
        return sock.sendMessage(
          from,
          {
            text: `⏳ Espera ${getCooldownRemaining(until)}s antes de usar este comando de nuevo`,
            ...global.channelInfo,
          },
          quoted
        );
      }
      cooldowns.set(userId, Date.now() + COOLDOWN_TIME);
    }

    try {
      const userInput = cleanText(resolveUserInput(ctx));

      // Validar entrada
      if (!userInput) {
        cooldowns.delete(userId);
        return sock.sendMessage(
          from,
          {
            text: `🎵 *Uso del comando Spotify:*\n\n` +
                  `.spotify canción artista\n` +
                  `.spotify https://open.spotify.com/track/...\n\n` +
                  `Ejemplos:\n` +
                  `.spotify bohemian rhapsody\n` +
                  `.spotify imagine john lennon`,
            ...global.channelInfo,
          },
          quoted
        );
      }

      // Validar tipo de entidad
      const spotifyEntityType = extractSpotifyEntityType(userInput);
      if (spotifyEntityType && spotifyEntityType !== "track") {
        cooldowns.delete(userId);
        return sock.sendMessage(
          from,
          {
            text: "❌ Solo se admiten enlaces de *track* individual o búsqueda por texto",
            ...global.channelInfo,
          },
          quoted
        );
      }

      // Validar URL HTTP
      if (isHttpUrl(userInput) && !isSpotifyUrl(userInput)) {
        cooldowns.delete(userId);
        return sock.sendMessage(
          from,
          {
            text: "❌ Solo aceptamos URLs de Spotify o búsquedas por texto",
            ...global.channelInfo,
          },
          quoted
        );
      }

      // Búsqueda si no es URL
      if (!isSpotifyUrl(userInput)) {
        await sock.sendMessage(
          from,
          {
            text: `🔎 *Buscando:* ${clipText(userInput, 80)}\n⏳ Por favor espera...`,
            ...global.channelInfo,
          },
          quoted
        );

        const results = await searchSpotifyTracks(userInput, 10);
        await sendSpotifySearchPicker({ sock, from, quoted, settings }, userInput, results);
        cooldowns.delete(userId);
        return;
      }

      // Obtener info de descarga
      await sock.sendMessage(
        from,
        {
          text: `⬇️ *Preparando descarga...*\n⏳ Por favor espera`,
          ...global.channelInfo,
        },
        quoted
      );

      const info = await getSpotifyDownloadInfo(userInput);

      // Mostrar info
      await sock.sendMessage(
        from,
        info.thumbnail
          ? {
              image: { url: info.thumbnail },
              caption:
                `🎵 *${clipText(info.title, 80)}*\n` +
                `🎤 ${clipText(info.artist, 60)}\n` +
                `${info.duration ? `⏱ ${info.duration}\n` : ""}` +
                `⬇️ Descargando audio...`,
              ...global.channelInfo,
            }
          : {
              text:
                `🎵 *${clipText(info.title, 80)}*\n` +
                `🎤 ${clipText(info.artist, 60)}\n` +
                `${info.duration ? `⏱ ${info.duration}\n` : ""}` +
                `⬇️ Descargando audio...`,
              ...global.channelInfo,
            },
        quoted
      );

      // Descargar audio
      const stamp = Date.now();
      rawAudioPath = path.join(TMP_DIR, `${stamp}-spotify.bin`);
      finalMp3Path = path.join(TMP_DIR, `${stamp}-spotify.mp3`);

      const downloaded = await downloadAudio(info.downloadUrl, rawAudioPath, info.fileName);

      let sendPath = downloaded.tempPath;
      let sendMime = downloaded.mimetype;
      let sendName = downloaded.fileName;

      // Convertir a MP3 si es necesario
      if (!downloaded.isMp3) {
        try {
          await convertToMp3(rawAudioPath, finalMp3Path);
          sendPath = finalMp3Path;
          sendMime = "audio/mpeg";
          sendName = normalizeAudioFileName(info.fileName, info.title, "mp3");
        } catch (convertError) {
          console.warn("Conversión a MP3 fallida, enviando archivo original:", convertError.message);
        }
      }

      // Enviar audio
      const sentAs = await sendSpotifyAudio(sock, from, quoted, {
        filePath: sendPath,
        fileName: sendName,
        mimetype: sendMime,
        title: info.title,
        artist: info.artist,
        size: downloaded.size,
      });

      await sock.sendMessage(
        from,
        {
          text: `✅ *Descarga completada*\n📦 Enviado como ${sentAs === "audio" ? "audio" : "documento"}`,
          ...global.channelInfo,
        },
        quoted
      );

    } catch (error) {
      console.error("SPOTIFY ERROR:", error?.message || error);
      cooldowns.delete(userId);

      await sock.sendMessage(
        from,
        {
          text: `❌ *Error:*\n${String(error?.message || "No se pudo procesar la descarga")}`,
          ...global.channelInfo,
        },
        quoted
      );
    } finally {
      // Limpiar archivos temporales
      deleteFileSafe(rawAudioPath);
      deleteFileSafe(finalMp3Path);
    }
  },
};
