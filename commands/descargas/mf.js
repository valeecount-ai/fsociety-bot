import axios from "axios";

const API_KEY = "dvyer";
const API_URL = "https://api-adonix.ultraplus.click/download/mediafire";
const MAX_MB = 800;

export default {
  command: ["mediafire", "mf"],
  category: "descarga",

  run: async ({ sock, from, args }) => {

    try {

      if (!args[0]) {
        return sock.sendMessage(from, {
          text: "❌ Usa:\n.mf <link de mediafire>"
        });
      }

      const url = args[0];

      if (!url.includes("mediafire.com")) {
        return sock.sendMessage(from, {
          text: "❌ Enlace inválido."
        });
      }

      await sock.sendMessage(from, {
        text: "📥 Procesando enlace..."
      });

      // 🔹 Consultar API
      const api = `${API_URL}?apikey=${API_KEY}&url=${encodeURIComponent(url)}`;
      const { data } = await axios.get(api);

      if (!data.status || !data.result?.link) {
        throw new Error("Respuesta inválida de la API");
      }

      const file = data.result;

      // 🔹 Detectar tamaño
      let sizeMB = 0;

      if (file.size?.includes("MB")) {
        sizeMB = parseFloat(file.size);
      } else if (file.size?.includes("GB")) {
        sizeMB = parseFloat(file.size) * 1024;
      }

      // 🔹 Si supera límite → solo enviar link
      if (sizeMB > MAX_MB) {
        return sock.sendMessage(from, {
          text:
            `📁 *MediaFire Downloader*\n\n` +
            `📄 Archivo: ${file.filename}\n` +
            `📦 Tamaño: ${file.size}\n\n` +
            `⚠️ Supera el límite de ${MAX_MB}MB\n\n` +
            `🔗 Descargar aquí:\n${file.link}`
        });
      }

      await sock.sendMessage(from, {
        text: `⚡ Enviando archivo (${file.size})...`
      });

      // 🔥 Detectar extensión real
      const ext = file.type?.toLowerCase() || "";
      const filename = file.filename.toLowerCase();

      // 🎬 VIDEO MP4
      if (ext === "mp4" || filename.endsWith(".mp4")) {

        await sock.sendMessage(from, {
          video: { url: file.link },
          mimetype: "video/mp4",
          caption:
            `🎬 *MediaFire Downloader*\n\n` +
            `📄 ${file.filename}\n` +
            `📦 ${file.size}\n\n` +
            `🤖 SonGokuBot`
        });

      // 🎵 AUDIO MP3
      } else if (ext === "mp3" || filename.endsWith(".mp3")) {

        await sock.sendMessage(from, {
          audio: { url: file.link },
          mimetype: "audio/mpeg",
          ptt: false
        });

      // 📂 OTROS ARCHIVOS
      } else {

        await sock.sendMessage(from, {
          document: { url: file.link },
          fileName: file.filename,
          mimetype: "application/octet-stream",
          caption:
            `📁 *MediaFire Downloader*\n\n` +
            `📄 ${file.filename}\n` +
            `📦 ${file.size}\n\n` +
            `🤖 SonGokuBot`
        });

      }

    } catch (err) {

      console.error("MEDIAFIRE ERROR:", err.message);

      await sock.sendMessage(from, {
        text: "❌ Error procesando el archivo."
      });

    }
  }
};
