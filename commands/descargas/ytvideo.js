import fs from "fs";
import path from "path";
import axios from "axios";
import yts from "yt-search";
import { pipeline } from "stream/promises";

const API_URL = "https://nexevo-api.vercel.app/download/y2";
const TMP_DIR = path.join(process.cwd(), "tmp");
const MAX_MB = 90;
const COOLDOWN_TIME = 15000;

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

const cooldowns = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  command: ["ytmp4"],
  category: "descarga",

  run: async (ctx) => {
    const { sock, from, args } = ctx;
    const msg = ctx.m || ctx.msg || null;
    const messageKey = msg?.key || null;

    const userId = from;
    const now = Date.now();
    let filePath = null;

    const cooldown = cooldowns.get(userId);
    if (cooldown && cooldown > now) {
      return sock.sendMessage(from, {
        text: `⏳ Espera ${Math.ceil((cooldown - now) / 1000)}s`,
      });
    }
    cooldowns.set(userId, now + COOLDOWN_TIME);

    try {
      if (!args.length) {
        cooldowns.delete(userId);
        return sock.sendMessage(from, {
          text:
            "❌ Uso:\n\n" +
            ".ytmp4 https://youtube.com/...\n" +
            ".ytmp4 nombre del video",
        });
      }

      if (messageKey) {
        await sock.sendMessage(from, {
          react: { text: "⏳", key: messageKey },
        });
      }

      let query = args.join(" ").trim();
      let videoUrl = query;

      if (!/^https?:\/\//i.test(query)) {
        const search = await yts(query);
        if (!search?.videos?.length) {
          throw new Error("No se encontraron resultados.");
        }
        videoUrl = search.videos[0].url;
      }

      // 🔥 API
      const { data } = await axios.get(
        `${API_URL}?url=${encodeURIComponent(videoUrl)}`,
        { timeout: 25000 }
      );

      if (!data?.status || !data?.result?.url) {
        throw new Error("API inválida.");
      }

      const mp4Url = data.result.url;

      // 📥 Descargar completo
      const response = await axios.get(mp4Url, {
        responseType: "stream",
        timeout: 180000,
        maxRedirects: 5,
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "*/*",
        },
      });

      filePath = path.join(TMP_DIR, `${Date.now()}.mp4`);

      const writer = fs.createWriteStream(filePath);
      await pipeline(response.data, writer);

      // 🔍 Verificar tamaño real
      const stats = fs.statSync(filePath);
      const sizeMB = stats.size / (1024 * 1024);

      if (sizeMB < 1) {
        throw new Error("Archivo incompleto.");
      }

      if (sizeMB > MAX_MB) {
        throw new Error(`El video pesa ${sizeMB.toFixed(1)}MB y supera ${MAX_MB}MB.`);
      }

      // ⏳ pequeña espera para asegurar cierre total
      await sleep(2000);

      // 📤 Enviar usando URL LOCAL (más estable que buffer)
      await sock.sendMessage(
        from,
        {
          video: { url: filePath },
          mimetype: "video/mp4",
          caption: `🎬 Calidad: ${data.result.quality || "360p"}`,
        },
        msg?.key ? { quoted: msg } : undefined
      );

      if (messageKey) {
        await sock.sendMessage(from, {
          react: { text: "✅", key: messageKey },
        });
      }

      // ⏳ esperar antes de borrar
      await sleep(3000);

    } catch (err) {
      console.error("YTMP4 ERROR:", err?.message || err);
      cooldowns.delete(userId);

      await sock.sendMessage(from, {
        text: `❌ Error:\n${err?.message || "No se pudo descargar el video."}`,
      });

    } finally {
      // 🧹 limpiar archivo
      try {
        if (filePath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch {}
    }
  },
};

process.on("uncaughtException", (e) => console.error("Uncaught:", e));
process.on("unhandledRejection", (e) => console.error("Unhandled:", e));
