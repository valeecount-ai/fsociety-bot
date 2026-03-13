function getPrefix(settings) {
  if (Array.isArray(settings?.prefix)) {
    return settings.prefix.find((value) => String(value || "").trim()) || ".";
  }

  return String(settings?.prefix || ".").trim() || ".";
}

function normalizeNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

export default {
  name: "subbot",
  command: ["subbot", "subbotcode", "codesubbot", "subbots"],
  category: "admin",
  description: "Pide el codigo de vinculacion del subbot o lista subbots activos",

  run: async ({ sock, msg, from, args = [], settings, esOwner, commandName }) => {
    const quoted = msg?.key ? { quoted: msg } : undefined;
    const prefix = getPrefix(settings);

    if (!esOwner) {
      return sock.sendMessage(
        from,
        {
          text: "Solo el owner puede pedir el codigo del subbot.",
          ...global.channelInfo,
        },
        quoted
      );
    }

    const runtime = global.botRuntime;
    if (!runtime?.requestBotPairingCode || !runtime?.listBots) {
      return sock.sendMessage(
        from,
        {
          text: "No pude acceder al control interno del subbot.",
          ...global.channelInfo,
        },
        quoted
      );
    }

    const rawArg = String(args[0] || "").trim();
    const action = rawArg.toLowerCase();
    const effectiveAction =
      !rawArg && String(commandName || "").toLowerCase() === "subbots"
        ? "list"
        : action;
    const requestedNumber = normalizeNumber(rawArg);

    if ((!rawArg && effectiveAction !== "list") || requestedNumber) {
      await sock.sendMessage(
        from,
        {
          text: "Generando codigo del subbot, espera unos segundos...",
          ...global.channelInfo,
        },
        quoted
      );

      const result = await runtime.requestBotPairingCode("subbot", {
        number: requestedNumber,
      });

      if (!result?.ok) {
        let text = result?.message || "No pude obtener el codigo del subbot.";

        if (result?.status === "missing_bot") {
          text =
            "El subbot no esta activo en este momento. Revisa que `subbot.enabled` siga en true.";
        } else if (result?.status === "already_linked") {
          text = "El subbot ya esta vinculado y funcionando.";
        } else if (result?.status === "pending") {
          text = "Ya hay una solicitud en proceso para el subbot. Espera un momento y vuelve a intentar.";
        } else if (result?.status === "missing_number") {
          text =
            `Debes enviar el numero con codigo de pais.\n` +
            `Ejemplo: *${prefix}subbot 51912345678*`;
        }

        return sock.sendMessage(
          from,
          {
            text,
            ...global.channelInfo,
          },
          quoted
        );
      }

      const header = result.cached
        ? "Codigo actual del subbot"
        : "Codigo de vinculacion del subbot";

      const text =
        `*${header}*\n\n` +
        `Bot: *${result.displayName}*\n` +
        `Numero: *${result.number}*\n` +
        `Codigo: *${result.code}*\n\n` +
        `Abre WhatsApp > Dispositivos vinculados > Vincular con numero de telefono.`;

      return sock.sendMessage(
        from,
        {
          text,
          ...global.channelInfo,
        },
        quoted
      );
    }

    if (["list", "lista", "status", "estado"].includes(effectiveAction)) {
      const bots = runtime.listBots();

      if (!bots.length) {
        return sock.sendMessage(
          from,
          {
            text: "No hay subbots activos en este momento.",
            ...global.channelInfo,
          },
          quoted
        );
      }

      const lines = bots.map((bot) => {
        const estado = bot.connected
          ? "Conectado"
          : bot.connecting
            ? "Conectando"
            : bot.registered
              ? "Vinculado pero desconectado"
              : bot.pairingPending
                ? "Esperando vinculacion"
                : "Sin vincular";

        const numero = bot.hasConfiguredNumber
          ? bot.configuredNumber
          : "No configurado";

        return (
          `• *${bot.label}* (${bot.displayName})\n` +
          `Estado: ${estado}\n` +
          `Numero: ${numero}\n` +
          `Sesion: ${bot.authFolder}`
        );
      });

      return sock.sendMessage(
        from,
        {
          text: `*SUBBOTS ACTIVOS*\n\n${lines.join("\n\n")}`,
          ...global.channelInfo,
        },
        quoted
      );
    }

    return sock.sendMessage(
      from,
      {
        text:
          `Uso correcto:\n` +
          `*${prefix}subbot*\n` +
          `*${prefix}subbot 519xxxxxxxxx*\n` +
          `*${prefix}subbot list*`,
        ...global.channelInfo,
      },
      quoted
    );
  },
};
