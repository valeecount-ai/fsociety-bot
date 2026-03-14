import { formatChatLabel, formatDateTime, formatUserLabel } from "./_shared.js";

function renderRank(title, items, formatter) {
  if (!items?.length) {
    return `${title}:\n- Sin datos`;
  }

  return (
    `${title}:\n` +
    items
      .map((item, index) => `${index + 1}. ${formatter(item)}`)
      .join("\n")
  );
}

export default {
  name: "estadisticas",
  command: ["estadisticas", "stats", "botstatsfull"],
  category: "sistema",
  description: "Muestra estadisticas de uso del bot",

  run: async ({ sock, msg, from, args = [], esOwner }) => {
    if (!esOwner) {
      return sock.sendMessage(
        from,
        {
          text: "Solo el owner puede ver las estadisticas del bot.",
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    const runtime = global.botRuntime;
    if (!runtime?.getUsageStats) {
      return sock.sendMessage(
        from,
        {
          text: "No pude acceder a las estadisticas internas.",
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    const requested = Number.parseInt(String(args[0] || "5"), 10);
    const limit = Number.isFinite(requested)
      ? Math.max(3, Math.min(10, requested))
      : 5;
    const stats = runtime.getUsageStats(limit);

    const text =
      `*ESTADISTICAS BOT*\n\n` +
      `Desde: ${formatDateTime(stats.trackedSince)}\n` +
      `Mensajes: *${stats.totalMessages}*\n` +
      `Comandos: *${stats.totalCommands}*\n` +
      `Grupos: *${stats.messagesByType?.Grupo || 0}*\n` +
      `Privados: *${stats.messagesByType?.Privado || 0}*\n\n` +
      `${renderRank("Top comandos", stats.topCommands, (item) => `${item.command} (${item.count})`)}\n\n` +
      `${renderRank("Top chats por comandos", stats.topChatsByCommands, (item) => `${formatChatLabel(item.id)} (${item.value})`)}\n\n` +
      `${renderRank("Top usuarios por comandos", stats.topUsersByCommands, (item) => `${formatUserLabel(item.id)} (${item.value})`)}\n\n` +
      `${renderRank("Actividad por bots", stats.bots, (item) => `${item.id} (${item.value})`)}`;

    return sock.sendMessage(
      from,
      {
        text: text.slice(0, 3900),
        ...global.channelInfo,
      },
      { quoted: msg }
    );
  },
};
