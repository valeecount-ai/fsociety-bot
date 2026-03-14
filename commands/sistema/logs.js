export default {
  name: "logs",
  command: ["logs", "console", "errores"],
  category: "sistema",
  description: "Muestra lineas recientes de la consola del bot",

  run: async ({ sock, msg, from, args = [], esOwner }) => {
    if (!esOwner) {
      return sock.sendMessage(
        from,
        {
          text: "Solo el owner puede ver los logs del bot.",
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    const runtime = global.botRuntime;
    if (!runtime?.getConsoleLines) {
      return sock.sendMessage(
        from,
        {
          text: "No pude acceder al buffer de logs.",
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    const requested = Number.parseInt(String(args[0] || "20"), 10);
    const limit = Number.isFinite(requested)
      ? Math.max(5, Math.min(40, requested))
      : 20;
    const lines = runtime.getConsoleLines(limit);

    if (!lines.length) {
      return sock.sendMessage(
        from,
        {
          text: "No hay logs recientes guardados.",
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    return sock.sendMessage(
      from,
      {
        text:
          `*LOGS BOT*\n\n` +
          `Lineas: *${lines.length}*\n\n` +
          "```" +
          lines.join("\n").slice(-3900) +
          "```",
        ...global.channelInfo,
      },
      { quoted: msg }
    );
  },
};
