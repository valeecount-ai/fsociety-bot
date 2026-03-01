
import axios from "axios";
import yts from "yt-search";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { exec } from "child_process";

const VREDEN_API = "https://api.vreden.my.id/api/v1/download/youtube/audio";
const NEXEVO_FALLBACK = "https://nexevo-api.vercel.app/download/y"; // fallback de tu bot
const COOLDOWN = 10 * 1000;
const MAX_BYTES = 25 * 1024 * 1024; // 25MB (ajusta si quieres)

const cooldowns = new Map();

const TMP_DIR = path.join(process.cwd(), "tmp");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

function safeFileName(name) {
  return String(name || "audio")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function cleanYoutubeUrl(input) {
  try {
    const u = new URL(input);

    // youtu.be/ID
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace("/", "");
      return `https://youtube.com/watch?v=${id}`;
    }

    // youtube.com/watch?v=ID
    const v = u.searchParams.get("v");
    if (v) return `https://youtube.com/watch?v=${v}`;

    return input;
  } catch {
    return input;
  }
}

async function downloadToFile(url, outPath) {
  const res = await axios.get(url, {
    responseType: "stream",
    timeout: 60000,
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  const writer = fs.createWriteStream(outPath);
  res.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });

  const size = fs.statSync(outPath).size;
  if (!size || size < 50000) throw new Error("Archivo incompleto");
  if (size > MAX_BYTES) throw new Error("Audio demasiado pesado");
  return size;
}

// (Opcional) normalizar MP3 si WhatsApp se pone quisquilloso
async function normalizeMp3(inFile, outFile) {
  await new Promise((resolve, reject) => {
    exec(
      `ffmpeg -y -loglevel error -i "${inFile}" -vn -c:a libmp3lame -b:a 128k "${outFile}"`,
      (err) => (err ? reject(err) : resolve())
    );
  });
}

export default {
  command: ["ytmp3v", "ytav", "yta2"],
  category: "descarga",

  run: async (ctx) => {
    const { sock, from, args } = ctx;
    const msg = ctx.m || ctx.msg || null;

    // cooldown
    const now = Date.now();
    const until = cooldowns.get(from);
    if (until && now < until) {
      return sock.sendMessage(
        from,
        { text: `⏳ Espera ${Math.ceil((until - now) / 1000)}s`, ...global.channelInfo },
        msg ? { quoted: msg } : undefined
      );
    }
    cooldowns.set(from, now + COOLDOWN);

    let rawMp3 = null;
    let finalMp3 = null;

    try {
      if (!args?.length) {
        cooldowns.delete(from);
        return sock.sendMessage(
          from,
          { text: "🎧 Uso: .ytav <nombre o link de YouTube>", ...global.channelInfo },
          msg ? { quoted: msg } : undefined
        );
      }

      const query = args.join(" ").trim();

      // 1) Resolver URL (si no es link, busca)
      let videoUrl = query;
      let meta = null;

      if (!/^https?:\/\//i.test(query)) {
        const s = await yts(query);
        if (!s.videos?.length) throw new Error("Sin resultados");
        meta = s.videos[0];
        videoUrl = meta.url;
      } else {
        videoUrl = cleanYoutubeUrl(query);
        // metadata opcional
        try {
          const u = new URL(videoUrl);
          const vid = u.searchParams.get("v");
          if (vid) meta = await yts({ videoId: vid });
        } catch {}
      }

      const title = safeFileName(meta?.title || "YouTube Audio");

      await sock.sendMessage(
        from,
        { text: `🎧 *AUDIO*\n🎵 ${title}\n⏳ Procesando…`, ...global.channelInfo },
        msg ? { quoted: msg } : undefined
      );

      // 2) Llamar VREDEN
      // IMPORTANTE: tu ejemplo muestra que con ciertos videos devuelve:
      // download.status=false, message="Converting error"
      const vredenUrl = `${VREDEN_API}?url=${encodeURIComponent(videoUrl)}&quality=128`;
      const { data: vreden } = await axios.get(vredenUrl, { timeout: 20000 });

      let dlUrl = null;
      const downloadObj = vreden?.result?.download;

      // Si la conversión falló, hacemos fallback (para que tu comando "SI responda")
      if (downloadObj?.status === false) {
        // fallback a la API que ya usas en tu bot
        const fb = `${NEXEVO_FALLBACK}?url=${encodeURIComponent(videoUrl)}`;
        const { data: nex } = await axios.get(fb, { timeout: 20000 });

        dlUrl = nex?.result?.url || nex?.url || null;

        if (!dlUrl) {
          return sock.sendMessage(
            from,
            {
              text: `❌ Vreden: ${downloadObj?.message || "Converting error"}\n❌ Fallback: sin link de descarga`,
              ...global.channelInfo
            },
            msg ? { quoted: msg } : undefined
          );
        }
      } else {
        // En caso éxito, intenta encontrar el link en varias llaves posibles
        dlUrl =
          downloadObj?.url ||
          downloadObj?.link ||
          vreden?.result?.url ||
          vreden?.result?.download_url ||
          null;

        if (!dlUrl) {
          throw new Error("Vreden no devolvió url de descarga");
        }
      }

      // 3) Descargar MP3 a archivo (mejor que RAM)
      rawMp3 = path.join(TMP_DIR, `${Date.now()}_raw.mp3`);
      finalMp3 = path.join(TMP_DIR, `${Date.now()}_final.mp3`);

      await downloadToFile(dlUrl, rawMp3);

      // Normalizar (si no tienes ffmpeg, puedes comentar esto)
      try {
        await normalizeMp3(rawMp3, finalMp3);
      } catch {
        // si falla ffmpeg, enviamos el raw
        finalMp3 = rawMp3;
      }

      // 4) Enviar a WhatsApp
      await sock.sendMessage(
        from,
        {
          audio: fs.readFileSync(finalMp3),
          mimetype: "audio/mpeg",
          fileName: `${title}.mp3`,
          ptt: false,
          ...global.channelInfo
        },
        msg ? { quoted: msg } : undefined
      );
    } catch (err) {
      console.error("YTMP3VREDEN ERROR:", err?.message || err);
      cooldowns.delete(from);

      await sock.sendMessage(
        from,
        { text: "❌ Error al procesar el audio (prueba con otro video).", ...global.channelInfo },
        msg ? { quoted: msg } : undefined
      );
    } finally {
      // limpiar tmp
      try {
        if (rawMp3 && fs.existsSync(rawMp3)) fs.unlinkSync(rawMp3);
        if (finalMp3 && finalMp3 !== rawMp3 && fs.existsSync(finalMp3)) fs.unlinkSync(finalMp3);
      } catch {}
    }
  }
};
