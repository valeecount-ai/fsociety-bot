import axios from 'axios';  // Necesitas instalar axios usando `npm install axios`
import yts from 'yt-search';  // Necesitas instalar yt-search usando `npm install yt-search`
import fs from 'fs';
import path from 'path';

const API_KEY = 'DvYer159'; // Tu API Key
const TMP_DIR = path.join(process.cwd(), 'ytmp4');
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

export default {
  command: ['ytmp1'],
  category: 'descarga',

  run: async (ctx) => {
    const { sock, from, args } = ctx;
    const msg = ctx.m || ctx.msg || null;

    if (!args.length) {
      return sock.sendMessage(from, {
        text: "❌ Usa el comando con un link de YouTube o el nombre del video: .ytmp1 <link o nombre del video>",
        ...global.channelInfo,
      });
    }

    const query = args.join(' ');  // Obtenemos el nombre o el link del video

    try {
      // Usamos yt-search para buscar el video
      const search = await yts(query);
      if (!search.videos.length) {
        throw new Error('No se encontró el video');
      }

      // Tomamos el primer resultado de la búsqueda
      const video = search.videos[0];
      const videoUrl = video.url;  // URL del video de YouTube

      console.log("URL del video encontrado:", videoUrl); // Depuración: Verificar la URL del video

      // 1) Obtener el enlace de descarga en calidad 360p
      const resolveResponse = await axios.post(
        'https://api-sky.ultraplus.click/youtube-mp4/resolve',
        {
          url: videoUrl,
          type: 'video',
          quality: '360', // Solicitamos calidad 360p
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'apikey': API_KEY,
          },
        }
      );

      // Depuración: Verificar la respuesta completa de la API
      console.log("Respuesta de la API:", resolveResponse.data);

      // Aquí obtenemos el enlace de descarga directo
      const downloadUrl = resolveResponse.data?.media?.dl_download;
      if (!downloadUrl) {
        throw new Error('No se pudo obtener el enlace de descarga');
      }

      // Imprimir el enlace de descarga directo
      console.log('Enlace de descarga:', downloadUrl);

      // 2) Descargar el archivo
      const videoFilePath = path.join(TMP_DIR, 'video_360p.mp4');
      const writer = fs.createWriteStream(videoFilePath);

      const videoResponse = await axios({
        url: downloadUrl,
        method: 'GET',
        responseType: 'stream',
      });

      videoResponse.data.pipe(writer);

      // Cuando el archivo se haya descargado
      writer.on('finish', async () => {
        await sock.sendMessage(
          from,
          {
            video: fs.readFileSync(videoFilePath),
            mimetype: 'video/mp4',
            caption: `🎬 Video descargado en 360p: ${video.title}`,
            ...global.channelInfo,
          },
          msg?.key ? { quoted: msg } : undefined
        );

        // Eliminar el archivo temporal después de enviarlo
        fs.unlinkSync(videoFilePath);
      });

      writer.on('error', (err) => {
        throw new Error('Error al guardar el archivo de video: ' + err.message);
      });

    } catch (err) {
      console.error("Error en el comando YTMP1:", err);
      await sock.sendMessage(
        from,
        { text: "❌ Error al procesar el video. Intenta nuevamente." },
        msg ? { quoted: msg } : undefined
      );
    }
  },
};
