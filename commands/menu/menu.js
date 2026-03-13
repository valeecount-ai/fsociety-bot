import fs from "fs";
import path from "path";

const BOX_INNER_WIDTH = 54;

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function repeat(char, count) {
  return char.repeat(Math.max(0, count));
}

function border(char = "=") {
  return `+${repeat(char, BOX_INNER_WIDTH + 2)}+`;
}

function padLine(content = "") {
  return `| ${String(content).padEnd(BOX_INNER_WIDTH)} |`;
}

function centerLine(content = "") {
  const text = String(content);
  const totalPadding = Math.max(0, BOX_INNER_WIDTH - text.length);
  const left = Math.floor(totalPadding / 2);
  const right = totalPadding - left;
  return `|${repeat(" ", left + 1)}${text}${repeat(" ", right + 1)}|`;
}

function wrapText(text, width = BOX_INNER_WIDTH) {
  const source = String(text || "").trim();
  if (!source) return [""];

  const words = source.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= width) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
      current = "";
    }

    if (word.length <= width) {
      current = word;
      continue;
    }

    let index = 0;
    while (index < word.length) {
      lines.push(word.slice(index, index + width));
      index += width;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [""];
}

function buildWrappedLines(text, options = {}) {
  const width = options.width || BOX_INNER_WIDTH;
  const prefix = String(options.prefix || "");
  const continuation = String(options.continuation || repeat(" ", prefix.length));
  const lines = wrapText(text, Math.max(10, width - prefix.length));

  return lines.map((line, index) =>
    padLine(`${index === 0 ? prefix : continuation}${line}`)
  );
}

function getPrefix(settings) {
  if (Array.isArray(settings?.prefix)) {
    return settings.prefix.find((value) => String(value || "").trim()) || ".";
  }

  return String(settings?.prefix || ".").trim() || ".";
}

function getCategoryLabel(category) {
  const labels = {
    admin: "ADMIN",
    ai: "AI",
    busqueda: "BUSQUEDA",
    descarga: "DESCARGAS",
    grupo: "GRUPOS",
    media: "MEDIA",
    menu: "MENU",
    sistema: "SISTEMA",
    subbots: "SUBBOTS",
    vip: "VIP",
  };

  return labels[String(category || "").toLowerCase()] || String(category || "").toUpperCase();
}

function buildCategoryMap(comandos) {
  const categories = new Map();

  for (const cmd of new Set(comandos.values())) {
    if (!cmd?.category || !cmd?.command) continue;

    const category = String(cmd.category).toLowerCase();
    const primaryCommand = Array.isArray(cmd.command) ? cmd.command[0] : cmd.command;
    const description = String(cmd.description || "").trim();

    if (!primaryCommand) continue;
    if (!categories.has(category)) categories.set(category, []);

    categories.get(category).push({
      command: String(primaryCommand).toLowerCase(),
      description,
    });
  }

  for (const items of categories.values()) {
    items.sort((a, b) => a.command.localeCompare(b.command));
  }

  return categories;
}

function sortCategories(categories) {
  const preferredOrder = [
    "menu",
    "subbots",
    "descarga",
    "busqueda",
    "grupo",
    "admin",
    "sistema",
    "media",
    "ai",
    "vip",
  ];

  return Array.from(categories.keys()).sort((a, b) => {
    const aIndex = preferredOrder.indexOf(a);
    const bIndex = preferredOrder.indexOf(b);

    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}

function countCommands(categories) {
  return Array.from(categories.values()).reduce(
    (total, items) => total + items.length,
    0
  );
}

function renderStandardCategory(category, items, prefix) {
  const title = `${getCategoryLabel(category)} :: ${items.length} comandos`;
  const lines = [];

  for (const item of items) {
    lines.push(...buildWrappedLines(`\`${prefix}${item.command}\``, { prefix: "- " }));
  }

  return [
    border("-"),
    centerLine(title),
    border("-"),
    ...lines,
    border("-"),
  ].join("\n");
}

function getSubbotStats() {
  const runtime = global.botRuntime;
  if (!runtime?.getSubbotRequestState) {
    return {
      publicRequests: false,
      maxSlots: 15,
      availableSlots: 0,
      activeSlots: 0,
      enabledSlots: 0,
    };
  }

  return runtime.getSubbotRequestState();
}

function renderSubbotsCategory(items, prefix) {
  const stats = getSubbotStats();
  const preferredOrder = ["subbot", "subbots", "subboton", "subbotoff"];
  const labels = {
    subbot: "pide un codigo nuevo para vincular otro bot",
    subbots: "mira slots, tiempos y subbots activos",
    subboton: "abre el acceso publico para que todos pidan subbots",
    subbotoff: "cierra el acceso publico cuando quieras pausar",
  };
  const itemMap = new Map(items.map((item) => [item.command, item]));
  const orderedItems = [
    ...preferredOrder
      .filter((command) => itemMap.has(command))
      .map((command) => itemMap.get(command)),
    ...items.filter((item) => !preferredOrder.includes(item.command)),
  ];
  const modeLabel = stats.publicRequests ? "ENCENDIDO" : "APAGADO";
  const lines = [
    padLine(
      `Slots ${stats.maxSlots} | libres ${stats.availableSlots} | activos ${stats.activeSlots}`
    ),
    padLine(`Modo publico ${modeLabel} | reservados ${stats.enabledSlots}`),
    padLine(""),
  ];

  orderedItems.forEach((item, index) => {
    const title = `${String(index + 1).padStart(2, "0")}. \`${prefix}${item.command}\``;
    const description = labels[item.command] || item.description || "control de subbots";
    lines.push(...buildWrappedLines(title, { prefix: "> " }));
    lines.push(...buildWrappedLines(description, { prefix: "  " }));
  });

  lines.push(padLine(""));
  lines.push(
    ...buildWrappedLines(`Rapido: \`${prefix}subbot 519xxxxxxxxx\``, {
      prefix: "* ",
    })
  );
  lines.push(
    ...buildWrappedLines(`Fijo: \`${prefix}subbot 3 519xxxxxxxxx\``, {
      prefix: "* ",
    })
  );
  lines.push(
    ...buildWrappedLines(`Panel: \`${prefix}subbots\``, {
      prefix: "* ",
    })
  );

  return [
    border("="),
    centerLine("SUBBOTS CONTROL"),
    centerLine("crea, vigila y administra tus slots"),
    border("="),
    ...lines,
    border("="),
  ].join("\n");
}

function buildHeader(settings, categories, prefix) {
  const totalCommands = countCommands(categories);
  const totalCategories = categories.size;

  return [
    border("="),
    centerLine(String(settings.botName || "BOT")),
    centerLine("menu principal"),
    border("="),
    padLine(`Prefijo   : ${prefix}`),
    padLine("Estado    : online"),
    padLine(`Uptime    : ${formatUptime(process.uptime())}`),
    padLine(`Categorias: ${totalCategories}`),
    padLine(`Comandos  : ${totalCommands}`),
    border("="),
    centerLine("MENU DE COMANDOS"),
    border("="),
  ];
}

function buildFooter() {
  return [
    border("="),
    centerLine("bot premium activo"),
    border("="),
  ];
}

function buildMenuCaption(settings, comandos) {
  const prefix = getPrefix(settings);
  const categories = buildCategoryMap(comandos);
  const sections = [];

  for (const category of sortCategories(categories)) {
    const items = categories.get(category) || [];
    if (!items.length) continue;

    sections.push(
      category === "subbots"
        ? renderSubbotsCategory(items, prefix)
        : renderStandardCategory(category, items, prefix)
    );
  }

  return [...buildHeader(settings, categories, prefix), ...sections, ...buildFooter()].join(
    "\n"
  );
}

export default {
  command: ["menu"],
  category: "menu",
  description: "Menu principal con estilo premium",

  run: async ({ sock, msg, from, settings, comandos }) => {
    try {
      if (!comandos) {
        return sock.sendMessage(
          from,
          { text: "error interno", ...global.channelInfo },
          { quoted: msg }
        );
      }

      const videoPath = path.join(process.cwd(), "videos", "menu-video.mp4");
      if (!fs.existsSync(videoPath)) {
        return sock.sendMessage(
          from,
          { text: "video del menu no encontrado", ...global.channelInfo },
          { quoted: msg }
        );
      }

      const caption = buildMenuCaption(settings, comandos);

      await sock.sendMessage(
        from,
        {
          video: fs.readFileSync(videoPath),
          mimetype: "video/mp4",
          gifPlayback: true,
          caption,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    } catch (err) {
      console.error("MENU ERROR:", err);
      await sock.sendMessage(
        from,
        { text: "error al mostrar el menu", ...global.channelInfo },
        { quoted: msg }
      );
    }
  },
};
