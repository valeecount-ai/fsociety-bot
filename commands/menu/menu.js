import fs from "fs";
import path from "path";

let MENU_IMAGE_CACHE = null;
let MENU_IMAGE_PATH_CACHE = "";

function formatUptime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}h ${m}m`;
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getPrimaryPrefix(settings) {
  if (Array.isArray(settings?.prefix)) {
    return settings.prefix.find((value) => cleanText(value)) || ".";
  }

  return cleanText(settings?.prefix || ".") || ".";
}

function getPrefixLabel(settings) {
  if (Array.isArray(settings?.prefix)) {
    const values = settings.prefix.map((value) => cleanText(value)).filter(Boolean);
    return values.length ? values.join(" | ") : ".";
  }

  return cleanText(settings?.prefix || ".") || ".";
}

function normalizeCategoryLabel(value = "") {
  return cleanText(value).replace(/_/g, " ").toUpperCase();
}

function normalizeCategoryKey(value = "") {
  const key = cleanText(value).toLowerCase();
  const aliases = {
    descarga: "descargas",
    download: "descargas",
    grupo: "grupos",
    group: "grupos",
    tool: "herramientas",
    tools: "herramientas",
    search: "busqueda",
    game: "juegos",
    games: "juegos",
    system: "sistema",
  };

  return aliases[key] || key;
}

function getCategorySortIndex(category = "") {
  const order = [
    "menu",
    "descargas",
    "busqueda",
    "freefire",
    "juegos",
    "herramientas",
    "grupos",
    "subbots",
    "economia",
    "sistema",
    "ia",
    "media",
    "anime",
    "admin",
    "vip",
  ];
  const index = order.indexOf(normalizeCategoryKey(category));
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function getCategoryIcon(category = "") {
  const key = normalizeCategoryKey(category);
  const icons = {
    admin: "👑",
    ai: "🧠",
    ia: "🧠",
    anime: "🌸",
    busqueda: "🔎",
    descargas: "📥",
    economia: "💰",
    freefire: "🔥",
    grupos: "🛡️",
    herramientas: "🧰",
    juegos: "🎮",
    media: "🖼️",
    menu: "📜",
    sistema: "⚙️",
    subbots: "🤖",
    vip: "💎",
  };

  return icons[key] || "✦";
}

function getSubbotSlot(botId = "") {
  const match = cleanText(botId).toLowerCase().match(/^subbot(\d{1,2})$/);
  return match?.[1] ? Number.parseInt(match[1], 10) : 0;
}

function getMenuContext({ settings, botId = "", botLabel = "" }) {
  const normalizedBotId = cleanText(botId).toLowerCase();

  if (!normalizedBotId || normalizedBotId === "main") {
    return {
      title: "FSOCIETY BOT PRINCIPAL",
      botLine: settings?.botName || "Fsociety bot",
    };
  }

  const slot = getSubbotSlot(normalizedBotId);
  const subbotName =
    (slot >= 1 && Array.isArray(settings?.subbots) && settings.subbots[slot - 1]?.name) ||
    cleanText(botLabel) ||
    `Fsociety Subbot ${slot || 1}`;

  return {
    title: `MENU SUBBOT FSOCIETY ${slot || 1}`,
    botLine: subbotName,
  };
}

function buildTopPanel({
  settings,
  uptime,
  totalCategories,
  totalCommands,
  prefixLabel,
  menuTitle,
  botLine,
}) {
  return [
    `╭━━━〔 ${menuTitle} 〕━━━⬣`,
    "┃",
    `┃ 🤖 *Bot:* ${botLine || settings?.botName || "BOT"}`,
    `┃ 👑 *Owner:* ${settings?.ownerName || "Owner"}`,
    `┃ 🔰 *Prefijos:* ${prefixLabel}`,
    `┃ ⏳ *Uptime:* ${uptime}`,
    `┃ 🗂️ *Categorías:* ${totalCategories}`,
    `┃ 📌 *Comandos:* ${totalCommands}`,
    "┃",
    "┃ ✦ *Selecciona el comando que quieras usar*",
    "╰━━━━━━━━━━━━━━━━━━━━━━⬣",
  ].join("\n");
}

function buildCategoryBlock(category, commands, primaryPrefix) {
  const icon = getCategoryIcon(category);
  const title = normalizeCategoryLabel(normalizeCategoryKey(category));

  const lines = [
    `╭─〔 ${icon} ${title} 〕`,
    ...commands.map((name) => `│ • \`${primaryPrefix}${name}\``),
    "╰────────────⬣",
  ];

  return lines.join("\n");
}

function buildFooter(primaryPrefix) {
  return [
    "╭─〔 NOTAS 〕",
    `│ • Usa \`${primaryPrefix}herramientas\` para utilidades`,
    `│ • Usa \`${primaryPrefix}status\` para ver el estado`,
    `│ • Usa \`${primaryPrefix}owner\` para soporte`,
    "╰────────────⬣",
  ].join("\n");
}

function resolveMenuImagePath() {
  if (MENU_IMAGE_PATH_CACHE && fs.existsSync(MENU_IMAGE_PATH_CACHE)) {
    return MENU_IMAGE_PATH_CACHE;
  }

  const base = path.join(process.cwd(), "imagenes", "menu");
  const candidates = [`${base}.png`, `${base}.jpg`, `${base}.jpeg`, `${base}.webp`];
  const found = candidates.find((filePath) => fs.existsSync(filePath)) || "";

  MENU_IMAGE_PATH_CACHE = found;
  return found;
}

function getMenuImageBuffer() {
  const imagePath = resolveMenuImagePath();
  if (!imagePath) return null;

  try {
    const stat = fs.statSync(imagePath);
    const cacheKey = `${imagePath}:${stat.mtimeMs}:${stat.size}`;

    if (MENU_IMAGE_CACHE?.key === cacheKey && MENU_IMAGE_CACHE?.buffer) {
      return MENU_IMAGE_CACHE.buffer;
    }

    const buffer = fs.readFileSync(imagePath);
    MENU_IMAGE_CACHE = { key: cacheKey, buffer };
    return buffer;
  } catch {
    return null;
  }
}

async function react(sock, msg, emoji) {
  try {
    if (!msg?.key) return;
    await sock.sendMessage(msg.key.remoteJid, {
      react: {
        text: emoji,
        key: msg.key,
      },
    });
  } catch {}
}

function collectCategories(comandos) {
  const categorias = {};

  for (const cmd of new Set(comandos.values())) {
    const categoryRaw = cmd?.categoria || cmd?.category;
    const commandRaw = cmd?.command || cmd?.commands;
    if (!categoryRaw || !commandRaw) continue;

    const category = normalizeCategoryKey(categoryRaw);
    const principal =
      cleanText(cmd?.name) ||
      (Array.isArray(commandRaw) ? cleanText(commandRaw[0]) : cleanText(commandRaw));

    if (!principal) continue;

    if (!categorias[category]) categorias[category] = new Set();
    categorias[category].add(principal.toLowerCase());
  }

  return categorias;
}

export default {
  command: ["menu"],
  categoria: "menu",
  description: "Menu principal con imagen",

  run: async ({ sock, msg, from, settings, comandos, botId, botLabel }) => {
    try {
      await react(sock, msg, "📜");

      if (!comandos) {
        await react(sock, msg, "❌");
        return await sock.sendMessage(
          from,
          { text: "Error interno del menú.", ...global.channelInfo },
          { quoted: msg }
        );
      }

      const imageBuffer = getMenuImageBuffer();
      if (!imageBuffer) {
        await react(sock, msg, "❌");
        return await sock.sendMessage(
          from,
          {
            text: "Imagen del menú no encontrada en imagenes/menu.(png/jpg/jpeg/webp).",
            ...global.channelInfo,
          },
          { quoted: msg }
        );
      }

      const uptime = formatUptime(process.uptime());
      const primaryPrefix = getPrimaryPrefix(settings);
      const prefixLabel = getPrefixLabel(settings);
      const menuContext = getMenuContext({ settings, botId, botLabel });
      const categorias = collectCategories(comandos);

      const categoryNames = Object.keys(categorias).sort((a, b) => {
        const byOrder = getCategorySortIndex(a) - getCategorySortIndex(b);
        if (byOrder !== 0) return byOrder;
        return String(a).localeCompare(String(b));
      });

      const totalCommands = categoryNames.reduce(
        (sum, category) => sum + Array.from(categorias[category]).length,
        0
      );

      const parts = [
        buildTopPanel({
          settings,
          uptime,
          totalCategories: categoryNames.length,
          totalCommands,
          prefixLabel,
          menuTitle: menuContext.title,
          botLine: menuContext.botLine,
        }),
        ...categoryNames.map((category) =>
          buildCategoryBlock(category, Array.from(categorias[category]).sort(), primaryPrefix)
        ),
        buildFooter(primaryPrefix),
      ];

      await sock.sendMessage(
        from,
        {
          image: imageBuffer,
          caption: parts.join("\n\n").trim(),
          ...global.channelInfo,
        },
        { quoted: msg }
      );

      await react(sock, msg, "✅");
    } catch (error) {
      console.error("MENU ERROR:", error);
      await react(sock, msg, "❌");
      await sock.sendMessage(
        from,
        { text: "Error al mostrar el menú.", ...global.channelInfo },
        { quoted: msg }
      );
    }
  },
};