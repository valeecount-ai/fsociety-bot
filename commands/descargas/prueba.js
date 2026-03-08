import fs from "fs";
import path from "path";
import yts from "yt-search";
import ytdlp from "yt-dlp-exec";

const TMP_DIR = path.join(process.cwd(), "tmp");

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

const channelInfo = global.channelInfo || {};

function safeFileName(name) {
  return String(name || "video")
    .replace(/[\\/:*?"<>|]/g, "")
    .slice(0, 80);
}

export default {

  command: ["play","ytplay"],
  category: "descarga",

  run: async (ctx) => {

    const { sock, from, args } = ctx;
    const msg = ctx.m || ctx.msg;
    const quoted = msg?.key ? { quoted: msg } : undefined;

    try {

      if (!args.length) {
        return sock.sendMessage(from,{
          text:"❌ Uso: .play <nombre del video>",
          ...channelInfo
        },quoted);
      }

      const query = args.join(" ");

      await sock.sendMessage(from,{
        text:`🔎 Buscando:\n${query}`,
        ...channelInfo
      },quoted);

      const search = await yts(query);
      const video = search.videos[0];

      if (!video) {
        return sock.sendMessage(from,{
          text:"❌ No se encontró el video",
          ...channelInfo
        },quoted);
      }

      const title = safeFileName(video.title);
      const url = video.url;

      const filePath = path.join(TMP_DIR, `${Date.now()}.mp4`);

      await sock.sendMessage(from,{
        text:`⬇️ Descargando...\n🎬 ${title}`,
        ...channelInfo
      },quoted);

      await ytdlp(url,{
        format:"mp4",
        output:filePath
      });

      await sock.sendMessage(from,{
        video:{ url:filePath },
        mimetype:"video/mp4",
        caption:`🎬 ${title}`,
        ...channelInfo
      },quoted);

      if(fs.existsSync(filePath)){
        fs.unlinkSync(filePath);
      }

    } catch(err){

      console.error("PLAY ERROR:",err);

      await sock.sendMessage(from,{
        text:"❌ Error descargando el video",
        ...channelInfo
      });

    }

  }

};
