import axios from "axios";

const API_URL = "https://api-adonix.ultraplus.click/download/mediafire";
const MAX_MB = 800;

export default {
  command: ["mediafire", "mf"],
  category: "descarga",

  run: async ({ sock, from, args, settings }) => {

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
      const apiKey = settings?.apiKey || process.env.DVYER_API_KEY || "";
      const api = `${API_URL}?apikey=${encodeURIComponent(apiKey)}&url=${encodeURIComponent(url)}`;
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

      // 🔥 Detectar mimetype correcto
      const ext = file.filename.split(".").pop().toLowerCase();

      let mimetype = "application/octet-stream";

      if (ext === "mp4") mimetype = "video/mp4";
      if (ext === "mp3") mimetype = "audio/mpeg";
      if (ext === "pdf") mimetype = "application/pdf";
      if (ext === "zip") mimetype = "application/zip";
      if (ext === "png") mimetype = "image/png";
      if (ext === "jpg" || ext === "jpeg") mimetype = "image/jpeg";

      // 🔥 Enviar SIEMPRE como DOCUMENTO
      await sock.sendMessage(from, {
        document: { url: file.link },
        fileName: file.filename,
        mimetype: mimetype,
        caption:
          `📁 *MediaFire Downloader*\n\n` +
          `📄 ${file.filename}\n` +
          `📦 ${file.size}\n\n` +
          `🤖 SonGokuBot`
      });

    } catch (err) {

      console.error("MEDIAFIRE ERROR:", err.message);

      await sock.sendMessage(from, {
        text: "❌ Error procesando el archivo."
      });

    }
  }
};
