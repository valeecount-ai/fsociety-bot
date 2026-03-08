import axios from "axios";
import yts from "yt-search";

const API_URL = "https://mayapi.ooguy.com/ytdl";
const API_KEY = "may-5d597e52";

const COOLDOWN_TIME = 15 * 1000;
const DEFAULT_QUALITY = "360p";
const cooldowns = new Map();

function safeFileName(name) {
  return String(name || "video")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "video";
}

function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s || ""));
}

function parseQuality(args) {
  const q = args.find((a) => /^\d{3,4}p$/i.test(a));
  return (q || DEFAULT_QUALITY).toLowerCase();
}

function withoutQuality(args) {
  return args.filter((a) => !/^\d{3,4}p$/i.test(a));
}

function getCooldownRemaining(untilMs) {
  return Math.max(0, Math.ceil((untilMs - Date.now()) / 1000));
}

function getYoutubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.replace("/", "").trim();
    const v = u.searchParams.get("v");
    if (v) return v.trim();
    const parts = u.pathname.split("/").filter(Boolean);
    const idxShorts = parts.indexOf("shorts");
    if (idxShorts >= 0 && parts[idxShorts + 1]) return parts[idxShorts + 1].trim();
    const idxEmbed = parts.indexOf("embed");
    if (idxEmbed >= 0 && parts[idxEmbed + 1]) return parts[idxEmbed + 1].trim();
    return null;
  } catch {
    return null;
  }
}

// ===== API (URL directa) =====
async function fetchDirectMediaUrl({ videoUrl, quality }) {
  const { data } = await axios.get(API_URL, {
    timeout: 25000,
    params: { url: videoUrl, quality, apikey: API_KEY },
    validateStatus: (s) => s >= 200 && s < 500,
  });

  if (!data?.status || !data?.result?.url) {
    // algunos APIs mandan message/error
    throw new Error(data?.message || "API inválida o sin URL directa.");
  }

  return {
    title: data?.result?.title || "video",
    directUrl: data.result.url,
  };
}

async function resolveVideoInfo(queryOrUrl) {
  // Si no es URL => búsqueda por texto
  if (!isHttpUrl(queryOrUrl)) {
    const search = await yts(queryOrUrl);
    const first = search?.videos?.[0];
    if (!first) return null;
    return {
      videoUrl: first.url,
      title: safeFileName(first.title),
      thumbnail: first.thumbnail || null,
    };
  }

  // Si es URL => intenta videoId para metadata más exacta
  const vid = getYoutubeId(queryOrUrl);
  if (vid) {
    try {
      const info = await yts({ videoId: vid });
      if (info) {
        return {
          videoUrl: info.url || queryOrUrl,
          title: safeFileName(info.title),
          thumbnail: info.thumbnail || null,
        };
      }
    } catch {}
  }

  // fallback
  try {
    const search = await yts(queryOrUrl);
    const first = search?.videos?.[0];
    if (first) {
      return {
        videoUrl: first.url || queryOrUrl,
        title: safeFileName(first.title),
        thumbnail: first.thumbnail || null,
      };
    }
  } catch {}

  return { videoUrl: queryOrUrl, title: "video", thumbnail: null };
}

/**
 * Intenta enviar por URL como video.
 * Si falla, intenta como documento por URL.
 * (Sin disco => sin ENOSPC)
 */
async function sendByUrl(sock, from, quoted, { directUrl, title }) {
  // 1) video
  try {
    await sock.sendMessage(
      from,
      {
        video: { url: directUrl },
        mimetype: "video/mp4",
        caption: `🎬 ${title}`,
        ...global.channelInfo,
      },
      quoted
    );
    return "video";
  } catch (e1) {
    console.error("send video by url failed:", e1?.message || e1);

    // 2) documento
    await sock.sendMessage(
      from,
      {
        document: { url: directUrl },
        mimetype: "video/mp4",
        fileName: `${title}.mp4`,
        caption: `📄 Enviado como documento\n🎬 ${title}`,
        ...global.channelInfo,
      },
      quoted
    );
    return "document";
  }
}

export default {
  command: ["ytmp4"],
  category: "descarga",

  run: async (ctx) => {
    const { sock, from, args } = ctx;
    const msg = ctx.m || ctx.msg || null;

    const userId = from;

    // ===== COOLDOWN =====
    const until = cooldowns.get(userId);
    if (until && until > Date.now()) {
      return sock.sendMessage(from, {
        text: `⏳ Espera ${getCooldownRemaining(until)}s`,
        ...global.channelInfo,
      });
    }
    cooldowns.set(userId, Date.now() + COOLDOWN_TIME);

    const quoted = msg?.key ? { quoted: msg } : undefined;

    try {
      if (!args?.length) {
        cooldowns.delete(userId);
        return sock.sendMessage(from, {
          text: "❌ Uso: .ytmp4 (360p) <nombre o link>",
          ...global.channelInfo,
        });
      }

      const quality = parseQuality(args);
      const query = withoutQuality(args).join(" ").trim();
      if (!query) {
        cooldowns.delete(userId);
        return sock.sendMessage(from, {
          text: "❌ Debes poner un nombre o link.",
          ...global.channelInfo,
        });
      }

      // ===== Buscar metadata + URL =====
      const meta = await resolveVideoInfo(query);
      if (!meta) {
        cooldowns.delete(userId);
        return sock.sendMessage(from, {
          text: "❌ No se encontró el video.",
          ...global.channelInfo,
        });
      }

      let { videoUrl, title, thumbnail } = meta;

      // ===== Mensaje previo =====
      if (thumbnail) {
        await sock.sendMessage(
          from,
          {
            image: { url: thumbnail },
            caption: `⬇️ Preparando envío...\n\n🎬 ${title}\n🎚️ Calidad: ${quality}\n⏳ Espera por favor...`,
            ...global.channelInfo,
          },
          quoted
        );
      } else {
        await sock.sendMessage(
          from,
          {
            text: `⬇️ Preparando envío...\n\n🎬 ${title}\n🎚️ Calidad: ${quality}\n⏳ Espera por favor...`,
            ...global.channelInfo,
          },
          quoted
        );
      }

      // ===== API URL directa =====
      const info = await fetchDirectMediaUrl({ videoUrl, quality });
      title = safeFileName(info.title || title);

      // ===== Enviar SIN DISCO =====
      await sendByUrl(sock, from, quoted, { directUrl: info.directUrl, title });

    } catch (err) {
      console.error("YTMP4 ERROR:", err?.message || err);
      cooldowns.delete(userId);

      const msgErr = String(err?.message || "Error al procesar el video.").trim();

      await sock.sendMessage(from, {
        text: `❌ ${msgErr}`,
        ...global.channelInfo,
      });
    }
  },
};

