import fs from "fs";
import path from "path";
import axios from "axios";
import yts from "yt-search";
import { exec } from "child_process";

const API_BASE = "https://dv-yer-api.online";
const COOLDOWN_TIME = 10 * 1000;
const TMP_DIR = path.join(process.cwd(), "tmp");
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

const cooldowns = new Map();
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

function safeFileName(name) {
  return String(name || "audio").replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
}

async function getDownloadUrl(videoUrl, type) {
  const endpoint = type === "ytmp4" ? `${API_BASE}/ytmp4` : `${API_BASE}/ytmp3`;
  const response = await axios.get(endpoint, {
    params: { url: videoUrl, mode: "link", quality: "128k" },
    timeout: 35000
  });
  return response.data?.download_url_full || response.data?.result?.download_url_full;
}

async function convertToMp3(inputUrl, outputPath) {
  return new Promise((resolve, reject) => {
    const cmd = `ffmpeg -y -i "${inputUrl}" -vn -acodec libmp3lame -ab 128k -ar 44100 "${outputPath}"`;
    exec(cmd, (err) => (err ? reject(err) : resolve()));
  });
}

export default {
  command: ["ytmp3", "play", "ytmp4"],
  category: "descarga",

  run: async (ctx) => {
    const { sock, from, args, command } = ctx;
    const msg = ctx.m || ctx.msg || null;
    const userId = from;
    let finalMp3;

    if (cooldowns.has(userId) && cooldowns.get(userId) > Date.now()) return;
    cooldowns.set(userId, Date.now() + COOLDOWN_TIME);

    try {
      if (!args?.length) throw new Error("Uso: ." + command + " <nombre o link>");

      const query = args.join(" ").trim();
      let videoUrl = query;
      let title = "Audio";
      let thumbnail = null;

      // Buscar detalles en YouTube primero
      const search = await yts(query);
      if (!search.videos.length) throw new Error("No encontrado");
      const video = search.videos[0];
      videoUrl = video.url;
      title = video.title;
      thumbnail = video.thumbnail;

      // 1. ENVIAR MENSAJE DE ESPERA CON MINIATURA
      await sock.sendMessage(from, {
        image: { url: thumbnail },
        caption: `🎵 *Descargando...*\n\n🎧 ${title}`,
        ...global.channelInfo
      }, { quoted: msg });

      finalMp3 = path.join(TMP_DIR, `${Date.now()}.mp3`);

      // 2. Obtener URL de descarga
      const downloadUrl = await getDownloadUrl(videoUrl, command);

      // 3. Conversión
      await convertToMp3(downloadUrl, finalMp3);

      // 4. Enviar resultado
      await sock.sendMessage(from, {
        audio: { url: finalMp3 },
        mimetype: "audio/mpeg",
        fileName: `${safeFileName(title)}.mp3`,
        ...global.channelInfo
      }, { quoted: msg });

    } catch (err) {
      console.error("ERROR:", err.message);
      await sock.sendMessage(from, { text: `❌ ${err.message}` }, { quoted: msg });
    } finally {
      if (finalMp3 && fs.existsSync(finalMp3)) fs.unlinkSync(finalMp3);
    }
  },
};
