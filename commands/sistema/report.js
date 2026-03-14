import fs from "fs";
import path from "path";

const REPORTS_FILE = path.join(process.cwd(), "database", "reports.json");

function appendReport(entry) {
  let reports = [];

  try {
    if (fs.existsSync(REPORTS_FILE)) {
      const raw = fs.readFileSync(REPORTS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      reports = Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    reports = [];
  }

  reports.push(entry);
  fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports.slice(-300), null, 2));
}

function normalizeOwnerJids(settings = {}) {
  const values = Array.isArray(settings.ownerNumbers)
    ? settings.ownerNumbers
    : settings.ownerNumber
      ? [settings.ownerNumber]
      : [];

  return values
    .map((value) => String(value || "").replace(/\D/g, ""))
    .filter(Boolean)
    .map((value) => `${value}@s.whatsapp.net`);
}

export default {
  name: "report",
  command: ["report", "reporte", "soporte", "support"],
  category: "sistema",
  description: "Envia un reporte o error directo al owner",

  run: async ({ sock, msg, from, sender, args = [], isGroup, settings, botLabel }) => {
    const reportText = args.join(" ").trim();

    if (!reportText) {
      return sock.sendMessage(
        from,
        {
          text:
            "Escribe tu reporte junto al comando.\n\n" +
            "Ejemplo:\n" +
            `${Array.isArray(settings?.prefix) ? settings.prefix[0] : settings?.prefix || "."}report el comando ytmp3 fallo`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    const senderId = String(sender || "").trim();
    const entry = {
      at: new Date().toISOString(),
      chat: from,
      sender: senderId,
      text: reportText,
      isGroup: Boolean(isGroup),
      bot: botLabel || "MAIN",
    };

    try {
      appendReport(entry);
    } catch {}

    const owners = normalizeOwnerJids(settings);
    const ownerMessage =
      `*NUEVO REPORTE BOT*\n\n` +
      `Bot: *${botLabel || "MAIN"}*\n` +
      `Chat: *${from}*\n` +
      `Sender: *${senderId}*\n` +
      `Grupo: *${isGroup ? "SI" : "NO"}*\n` +
      `Mensaje:\n${reportText}`;

    for (const owner of owners) {
      try {
        await sock.sendMessage(
          owner,
          {
            text: ownerMessage,
            ...global.channelInfo,
          },
          {}
        );
      } catch {}
    }

    return sock.sendMessage(
      from,
      {
        text: "Tu reporte fue enviado al owner. Gracias por avisar.",
        ...global.channelInfo,
      },
      { quoted: msg }
    );
  },
};
