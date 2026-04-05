import { getPrimaryPrefix } from "../../lib/json-store.js";
import {
  addGroupCommandXp,
  addGroupMessageXp,
  getGlobalTop,
  getGroupLevelProfile,
  getGroupRankPosition,
  getGroupTop,
  isGroupLevelsEnabled,
  listRoleTable,
  normalizeUserId,
  setGroupLevelsEnabled,
} from "../../lib/group-levels.js";

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getPrefixes(settings) {
  if (Array.isArray(settings?.prefix)) {
    const values = settings.prefix.map((value) => cleanText(value)).filter(Boolean);
    return values.length ? values : ["."];
  }
  return [cleanText(settings?.prefix || ".") || "."];
}

function formatUser(value = "") {
  const id = normalizeUserId(value);
  const digits = id.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : id || "Desconocido";
}

function profileCard(profile, rank = 0) {
  if (!profile) return "Sin datos de nivel todavia.";
  const progressPercent = Math.max(
    0,
    Math.min(100, Math.floor((Number(profile.xpCurrentLevel || 0) / Math.max(1, Number(profile.xpForNextLevel || 1))) * 100))
  );

  return (
    `╭━━━〔 📈 PERFIL DE NIVEL 〕━━━⬣\n` +
    `┃ Nivel: *${profile.level}*\n` +
    `┃ Rol: *${profile.role}*\n` +
    `┃ XP total: *${profile.xp}*\n` +
    `┃ XP nivel: *${profile.xpCurrentLevel}/${profile.xpForNextLevel}* (${progressPercent}%)\n` +
    `┃ XP para subir: *${profile.xpToNextLevel}*\n` +
    `┃ Mensajes: *${profile.messages}*\n` +
    `┃ Comandos: *${profile.commands}*\n` +
    `┃ Rank grupo: *${rank || "N/D"}*\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━⬣`
  );
}

function topRows(rows = [], title = "TOP") {
  if (!rows.length) return `${title}\nSin datos todavia.`;
  const lines = rows.map((row, index) => {
    const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;
    return `${medal} ${formatUser(row.id)} | lvl ${row.level} | XP ${row.xp} | ${row.role}`;
  });
  return `${title}\n\n${lines.join("\n")}`;
}

function rolesText() {
  const rows = listRoleTable();
  return rows.map((row) => `- Nivel ${row.level}: ${row.name}`).join("\n");
}

function parseLimit(raw = "", fallback = 10, min = 3, max = 30) {
  const value = Number.parseInt(String(raw || "").trim(), 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function parseCommandFromText(text = "", settings = {}, comandos) {
  const content = cleanText(text);
  if (!content) return "";
  const prefixes = getPrefixes(settings);
  const matchedPrefix = prefixes.find((prefix) => prefix && content.startsWith(prefix));
  if (!matchedPrefix) return "";
  const body = cleanText(content.slice(matchedPrefix.length));
  const cmd = cleanText(body.split(/\s+/)[0] || "").toLowerCase();
  if (!cmd) return "";
  if (!(comandos instanceof Map)) return cmd;
  return comandos.has(cmd) ? cmd : "";
}

export default {
  name: "niveles",
  command: ["niveles", "nivel", "ranknivel", "topniveles", "topnivel", "nivelesglobal", "rolesnivel"],
  category: "grupo",
  description: "Sistema de niveles por grupo: XP, roles automaticos, rank y top.",
  groupOnly: true,

  run: async ({ sock, msg, from, sender, args = [], settings = {}, esAdmin = false, esOwner = false, commandName = "" }) => {
    const prefix = getPrimaryPrefix(settings);
    const command = cleanText(commandName).toLowerCase();
    const aliasActionMap = {
      nivel: "perfil",
      ranknivel: "rank",
      topniveles: "top",
      topnivel: "top",
      nivelesglobal: "global",
      rolesnivel: "roles",
      niveles: "",
    };

    let action = aliasActionMap[command] || cleanText(args[0]).toLowerCase();
    let payload = aliasActionMap[command] ? args : args.slice(1);

    if (!action || ["menu", "help", "ayuda"].includes(action)) {
      const enabled = isGroupLevelsEnabled(from);
      return sock.sendMessage(
        from,
        {
          text:
            `*SISTEMA DE NIVELES*\n\n` +
            `Estado en este grupo: *${enabled ? "ON ✅" : "OFF ❌"}*\n\n` +
            `Comandos:\n` +
            `- ${prefix}nivel\n` +
            `- ${prefix}niveles rank\n` +
            `- ${prefix}niveles top 10\n` +
            `- ${prefix}niveles global 10\n` +
            `- ${prefix}niveles roles\n` +
            `- ${prefix}niveles on|off (admin)\n`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "on" || action === "off") {
      if (!(esAdmin || esOwner)) {
        return sock.sendMessage(
          from,
          {
            text: "Solo admin/owner puede cambiar el sistema de niveles.",
            ...global.channelInfo,
          },
          { quoted: msg }
        );
      }
      const enabled = setGroupLevelsEnabled(from, action === "on");
      return sock.sendMessage(
        from,
        {
          text: `Sistema de niveles ahora esta: *${enabled ? "ON ✅" : "OFF ❌"}*`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "roles") {
      return sock.sendMessage(
        from,
        {
          text:
            `*ROLES AUTOMATICOS POR NIVEL*\n\n` +
            `${rolesText()}`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "global") {
      const limit = parseLimit(payload[0], 10);
      const top = getGlobalTop(limit);
      return sock.sendMessage(
        from,
        { text: topRows(top, "🌎 *TOP NIVELES GLOBAL*"), ...global.channelInfo },
        { quoted: msg }
      );
    }

    if (action === "top" || action === "ranking") {
      const limit = parseLimit(payload[0], 10);
      const top = getGroupTop(from, limit);
      return sock.sendMessage(
        from,
        { text: topRows(top, "🏆 *TOP NIVELES DEL GRUPO*"), ...global.channelInfo },
        { quoted: msg }
      );
    }

    if (action === "rank" || action === "perfil" || action === "yo") {
      const profile = getGroupLevelProfile(from, sender);
      const rank = getGroupRankPosition(from, sender);
      return sock.sendMessage(
        from,
        { text: profileCard(profile, rank), ...global.channelInfo },
        { quoted: msg }
      );
    }

    return sock.sendMessage(
      from,
      {
        text: `Accion invalida. Usa *${prefix}niveles*`,
        ...global.channelInfo,
      },
      { quoted: msg }
    );
  },

  onMessage: async ({ sock, from, esGrupo, msg, settings, comandos }) => {
    if (!esGrupo) return;
    if (!isGroupLevelsEnabled(from)) return;

    const text = cleanText(msg?.text || msg?.body || "");
    if (!text) return;
    const sender = cleanText(msg?.sender);
    if (!sender) return;
    if (msg?.key?.fromMe) return;

    const isCommand = Boolean(parseCommandFromText(text, settings, comandos));
    const result = isCommand
      ? addGroupCommandXp(from, sender, 12, 8_000)
      : addGroupMessageXp(from, sender, 6, 25_000);

    if (!result?.ok || !result?.leveledUp) return;

    const roleText = result.roleChanged
      ? `\nNuevo rol: *${result.newRole}*`
      : "";

    const waName = cleanText(msg?.pushName || msg?.notifyName || "");
    const numberLine = `${waName ? `${waName} · ` : ""}${formatUser(sender) || "Sin numero"}`;

    await sock.sendMessage(from, {
      text:
        `🎉 *SUBISTE DE NIVEL*\n` +
        `${numberLine}\n` +
        `${formatUser(sender)} pasó de *${result.previousLevel}* a *${result.newLevel}*${roleText}`,
      ...global.channelInfo,
    });
  },
};
