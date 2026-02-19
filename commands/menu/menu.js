import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ⏱️ uptime bonito
function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// 🎨 Emojis por categoría (edítalo a tu gusto)
const CAT_ICON = {
  menu: "📜",
  music: "🎵",
  descarga: "📥",
  grupos: "👥",
  admin: "🛡️",
  juegos: "🎮",
  tools: "🧰",
  fun: "😄",
  default: "✨",
};

function getCatIcon(cat) {
  return CAT_ICON[cat] || CAT_ICON.default;
}

export default {
  command: ["menu"],
  category: "menu",
  description: "Menú principal con diseño premium",

  run: async ({ sock, msg, from, settings, comandos }) => {
    try {
      if (!sock || !from) return;

      if (!comandos) {
        return sock.sendMessage(from, { text: "❌ error interno" }, { quoted: msg });
      }

      const botName = settings?.botName || "DVYER BOT";
      const prefix = settings?.prefix || ".";
      const uptime = formatUptime(process.uptime());

      // 🎥 video menú
      const videoPath = path.join(process.cwd(), "videos", "menu-video.mp4");
      const hasVideo = fs.existsSync(videoPath);

      // 📂 agrupar comandos (sin duplicados)
      const categorias = new Map();

      for (const cmd of new Set(comandos.values())) {
        if (!cmd?.category || !cmd?.command) continue;

        const cat = String(cmd.category).toLowerCase().trim() || "otros";
        const names = Array.isArray(cmd.command) ? cmd.command : [cmd.command];

        if (!categorias.has(cat)) categorias.set(cat, new Set());
        const set = categorias.get(cat);

        for (const n of names) {
          if (!n) continue;
          set.add(String(n).toLowerCase());
        }
      }

      // ✅ Ordenar categorías
      const catsSorted = [...categorias.keys()].sort();

      // 🎨 MENÚ premium (más compacto)
      let menu =
        `╭══════════════════════╮\n` +
        `│ ✦ *${botName}* ✦\n` +
        `╰══════════════════════╯\n\n` +
        `▸ _prefijo_ : *${prefix}*\n` +
        `▸ _estado_  : *online*\n` +
        `▸ _uptime_  : *${uptime}*\n\n` +
        `┌──────────────────────┐\n` +
        `│ ✧ *MENÚ DE COMANDOS* ✧\n` +
        `└──────────────────────┘\n`;

      // 👇 Limita comandos por categoría (para que no sea gigante)
      const MAX_PER_CAT = 6;

      for (const cat of catsSorted) {
        const icon = getCatIcon(cat);
        const cmds = [...categorias.get(cat)].sort();
        const total = cmds.length;

        menu +=
          `\n╭─ ${icon} *${cat.toUpperCase()}*  _(${total})_\n` +
          `│`;

        const shown = cmds.slice(0, MAX_PER_CAT);
        for (const c of shown) {
          menu += `\n│  • \`${prefix}${c}\``;
        }

        if (total > MAX_PER_CAT) {
          menu += `\n│  • … y *${total - MAX_PER_CAT}* más`;
        }

        menu += `\n╰──────────────────────`;
      }

      menu +=
        `\n\n┌──────────────────────┐\n` +
        `│ ✦ _bot premium activo_ ✦\n` +
        `└──────────────────────┘\n` +
        `_artoria bot vip_\n`;

      // 🚀 Enviar
      if (hasVideo) {
        // ✅ Mejor: enviar como stream, NO readFileSync (menos RAM)
        await sock.sendMessage(
          from,
          {
            video: fs.createReadStream(videoPath),
            mimetype: "video/mp4",
            gifPlayback: true,
            caption: menu.trim(),
          },
          { quoted: msg }
        );
      } else {
        // Si no hay video, manda solo texto
        await sock.sendMessage(from, { text: menu.trim() }, { quoted: msg });
      }
    } catch (err) {
      console.error("MENU ERROR:", err);
      await sock.sendMessage(from, { text: "❌ error al mostrar el menú" }, { quoted: msg });
    }
  },
};
