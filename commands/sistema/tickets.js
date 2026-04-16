import path from "path";
import {
  createScheduledJsonStore,
  getPrimaryPrefix,
  normalizeNumber,
} from "../../lib/json-store.js";

const FILE = path.join(process.cwd(), "database", "tickets.json");

const store = createScheduledJsonStore(FILE, () => ({
  nextId: 1,
  items: [],
}));

const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function clipText(value = "", max = 500) {
  const text = cleanText(value);
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 3))}...`;
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString("es-PE");
  } catch {
    return String(value || "");
  }
}

function extractWhatsAppNumber(jid = "") {
  const raw = String(jid || "").trim();
  if (!raw) return "Desconocido";

  const cleaned = raw
    .replace(/@s\.whatsapp\.net$/i, "")
    .replace(/@lid$/i, "")
    .replace(/@g\.us$/i, "");

  const digits = cleaned.replace(/\D/g, "");
  return digits || cleaned || "Desconocido";
}

function normalizeOwnerJids(settings = {}) {
  const values = [
    ...(Array.isArray(settings?.ownerNumbers) ? settings.ownerNumbers : []),
    ...(Array.isArray(settings?.ownerLids) ? settings.ownerLids : []),
    settings?.ownerNumber,
    settings?.ownerLid,
  ].filter(Boolean);

  return [
    ...new Set(
      values
        .map((value) => normalizeNumber(value))
        .filter(Boolean)
        .map((value) => `${value}@s.whatsapp.net`)
    ),
  ];
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

function findRecentDuplicateTicket(senderJid = "", text = "") {
  const normalizedSenderJid = cleanText(senderJid);
  const normalizedText = cleanText(text).toLowerCase();
  const now = Date.now();

  return store.state.items
    .slice()
    .reverse()
    .find((item) => {
      if (cleanText(item?.senderJid) !== normalizedSenderJid) return false;
      if (cleanText(item?.text).toLowerCase() !== normalizedText) return false;
      if (String(item?.status || "open").toLowerCase() === "closed") return false;

      const createdAt = new Date(item?.createdAt || 0).getTime();
      if (!createdAt) return false;

      return now - createdAt <= DUPLICATE_WINDOW_MS;
    });
}

function buildUsage(prefix) {
  return [
    "╭━━━〔 🎫 *SISTEMA DE TICKETS* 〕━━━⬣",
    "┃",
    `┃ 📌 \`${prefix}ticket <mensaje>\``,
    `┃ 📌 \`${prefix}tickets\``,
    `┃ 📌 \`${prefix}closeticket 4\``,
    "╰━━━━━━━━━━━━━━━━━━━━⬣",
  ].join("\n");
}

function buildTicketCreated(ticket) {
  return [
    "╭━━━〔 ✅ *TICKET CREADO* 〕━━━⬣",
    "┃",
    `┃ 🎫 *ID:* #${ticket.id}`,
    `┃ 🤖 *Bot:* ${ticket.bot}`,
    `┃ 📌 *Estado:* ABIERTO`,
    "┃",
    "┃ ✦ El owner fue avisado",
    "╰━━━━━━━━━━━━━━━━━━━━⬣",
  ].join("\n");
}

function buildTicketClosed(ticket) {
  return [
    "╭━━━〔 ✅ *TICKET CERRADO* 〕━━━⬣",
    "┃",
    `┃ 🎫 *ID:* #${ticket.id}`,
    `┃ 📌 *Estado:* CERRADO`,
    ticket.closedAt ? `┃ 🕒 *Cerrado:* ${formatDate(ticket.closedAt)}` : null,
    "╰━━━━━━━━━━━━━━━━━━━━⬣",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildOwnerTicketMessage(ticket) {
  return [
    "╭━━━〔 🚨 *NUEVO TICKET* 〕━━━⬣",
    "┃",
    `┃ 🎫 *ID:* #${ticket.id}`,
    `┃ 🤖 *Bot:* ${ticket.bot}`,
    `┃ 👤 *Usuario:* ${ticket.sender}`,
    ticket.senderJid ? `┃ 🔗 *JID:* ${ticket.senderJid}` : null,
    ticket.pushName ? `┃ 🏷️ *Nombre:* ${ticket.pushName}` : null,
    `┃ 💬 *Chat:* ${ticket.chat}`,
    `┃ 👥 *Grupo:* ${ticket.isGroup ? "Sí" : "No"}`,
    `┃ 🕒 *Fecha:* ${formatDate(ticket.createdAt)}`,
    "┃",
    "┃ ✦ *Mensaje:*",
    `┃ ${ticket.text}`,
    "╰━━━━━━━━━━━━━━━━━━━━⬣",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildTicketList(items = []) {
  if (!items.length) {
    return [
      "╭━━━〔 🎫 *TICKETS ABIERTOS* 〕━━━⬣",
      "┃",
      "┃ No hay tickets abiertos.",
      "╰━━━━━━━━━━━━━━━━━━━━⬣",
    ].join("\n");
  }

  return [
    "╭━━━〔 🎫 *TICKETS ABIERTOS* 〕━━━⬣",
    ...items.flatMap((item) => [
      "┃",
      `┃ #${item.id} • ${String(item.status || "open").toUpperCase()}`,
      `┃ 👤 ${item.sender}`,
      item.senderJid ? `┃ 🔗 ${item.senderJid}` : null,
      `┃ 💬 ${item.chat}`,
      `┃ 🕒 ${formatDate(item.createdAt)}`,
      `┃ ✦ ${clipText(item.text, 120)}`,
    ].filter(Boolean)),
    "╰━━━━━━━━━━━━━━━━━━━━⬣",
  ].join("\n");
}

export default {
  command: ["ticket", "tickets", "closeticket"],
  categoria: "sistema",
  description: "Crea y administra tickets de soporte",

  run: async ({
    sock,
    msg,
    from,
    sender,
    args = [],
    settings,
    esOwner,
    commandName,
    isGroup,
    botLabel,
    pushName,
  }) => {
    const prefix = getPrimaryPrefix(settings);
    const normalized = cleanText(commandName || "ticket").toLowerCase();
    const action =
      normalized === "closeticket"
        ? "close"
        : cleanText(args[0] || "").toLowerCase();

    try {
      await react(sock, msg, "🎫");

      if (normalized === "tickets" || action === "list") {
        if (!esOwner) {
          await react(sock, msg, "❌");
          return await sock.sendMessage(
            from,
            { text: "Solo el owner puede ver los tickets.", ...global.channelInfo },
            { quoted: msg }
          );
        }

        const openItems = store.state.items
          .filter((item) => String(item.status || "").toLowerCase() !== "closed")
          .slice(-20)
          .reverse();

        await sock.sendMessage(
          from,
          { text: buildTicketList(openItems), ...global.channelInfo },
          { quoted: msg }
        );
        await react(sock, msg, "✅");
        return;
      }

      if (action === "close") {
        if (!esOwner) {
          await react(sock, msg, "❌");
          return await sock.sendMessage(
            from,
            { text: "Solo el owner puede cerrar tickets.", ...global.channelInfo },
            { quoted: msg }
          );
        }

        const rawId = normalized === "closeticket" ? args[0] : args[1];
        const id = Number(rawId);

        if (!Number.isInteger(id) || id <= 0) {
          await react(sock, msg, "❌");
          return await sock.sendMessage(
            from,
            { text: `Usa: ${prefix}closeticket 4`, ...global.channelInfo },
            { quoted: msg }
          );
        }

        const ticket = store.state.items.find((item) => Number(item.id) === id);
        if (!ticket) {
          await react(sock, msg, "❌");
          return await sock.sendMessage(
            from,
            { text: "No encontré ese ticket.", ...global.channelInfo },
            { quoted: msg }
          );
        }

        if (String(ticket.status || "").toLowerCase() === "closed") {
          await react(sock, msg, "⚠️");
          return await sock.sendMessage(
            from,
            { text: `El ticket #${id} ya estaba cerrado.`, ...global.channelInfo },
            { quoted: msg }
          );
        }

        ticket.status = "closed";
        ticket.closedAt = new Date().toISOString();
        store.scheduleSave();

        await sock.sendMessage(
          from,
          { text: buildTicketClosed(ticket), ...global.channelInfo },
          { quoted: msg }
        );
        await react(sock, msg, "✅");
        return;
      }

      const text = clipText(args.join(" "), 500);
      if (!text) {
        await react(sock, msg, "❌");
        return await sock.sendMessage(
          from,
          { text: buildUsage(prefix), ...global.channelInfo },
          { quoted: msg }
        );
      }

      const duplicate = findRecentDuplicateTicket(sender, text);
      if (duplicate) {
        await react(sock, msg, "⚠️");
        return await sock.sendMessage(
          from,
          {
            text: `Ya tienes un ticket abierto reciente con ID #${duplicate.id}.`,
            ...global.channelInfo,
          },
          { quoted: msg }
        );
      }

      const ticket = {
        id: Number(store.state.nextId || 1),
        sender: extractWhatsAppNumber(sender || ""),
        senderJid: String(sender || ""),
        pushName: cleanText(pushName || msg?.pushName || ""),
        chat: from,
        text,
        createdAt: new Date().toISOString(),
        status: "open",
        isGroup: Boolean(isGroup),
        bot: botLabel || "MAIN",
      };

      store.state.nextId = ticket.id + 1;
      store.state.items.push(ticket);
      store.state.items = store.state.items.slice(-300);
      store.scheduleSave();

      const ownerText = buildOwnerTicketMessage(ticket);

      for (const ownerJid of normalizeOwnerJids(settings)) {
        try {
          await sock.sendMessage(ownerJid, { text: ownerText, ...global.channelInfo });
        } catch {}
      }

      await sock.sendMessage(
        from,
        { text: buildTicketCreated(ticket), ...global.channelInfo },
        { quoted: msg }
      );
      await react(sock, msg, "✅");
    } catch (error) {
      console.error("TICKET ERROR:", error);
      await react(sock, msg, "❌");
      await sock.sendMessage(
        from,
        { text: "Error al procesar el ticket.", ...global.channelInfo },
        { quoted: msg }
      );
    }
  },
};