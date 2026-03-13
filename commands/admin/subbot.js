function getPrefix(settings) {
  if (Array.isArray(settings?.prefix)) {
    return settings.prefix.find((value) => String(value || "").trim()) || ".";
  }

  return String(settings?.prefix || ".").trim() || ".";
}

function normalizeNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatDateTime(value) {
  if (!value) return "Sin registro";

  try {
    return new Date(value).toLocaleString("es-PE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch {
    return "Sin registro";
  }
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function getCurrentChatStatus({ isGroup, botId, botLabel }) {
  if (!isGroup) {
    return "Panel abierto por privado.";
  }

  if (String(botId || "").toLowerCase() === "main") {
    return "YA BOT principal activo aqui.";
  }

  return `${String(botLabel || "SUBBOT").toUpperCase()} activo aqui.`;
}

function getSubbotStateLabel(bot) {
  if (bot.connected) return "ACTIVO AHORA";
  if (bot.connecting) return "CONECTANDO";
  if (bot.registered) return "VINCULADO";
  if (bot.pairingPending) return "ESPERANDO VINCULACION";
  return "SIN VINCULAR";
}

function buildSubbotCard(bot) {
  const numero = bot.hasConfiguredNumber ? bot.configuredNumber : "No configurado";
  const horaActiva = bot.connectedAt ? formatDateTime(bot.connectedAt) : "No conectado";
  const ultimaSalida = bot.lastDisconnectAt
    ? formatDateTime(bot.lastDisconnectAt)
    : "Sin desconexion reciente";

  let extra = "";

  if (bot.cachedPairingCode) {
    extra =
      `\nCodigo en cache: ${bot.cachedPairingCode}` +
      `\nExpira en: ${formatDuration(bot.cachedPairingExpiresInMs)}`;
  }

  return (
    `• *${bot.label}* (${bot.displayName})\n` +
    `Estado: ${getSubbotStateLabel(bot)}\n` +
    `Numero: ${numero}\n` +
    `Sesion: ${bot.authFolder}\n` +
    `Hora activa: ${horaActiva}\n` +
    `Ultimo cambio: ${ultimaSalida}${extra}`
  );
}

export default {
  name: "subbot",
  command: ["subbot", "subbotcode", "codesubbot", "subbots"],
  category: "admin",
  description: "Panel para pedir, activar y revisar subbots",

  run: async ({
    sock,
    msg,
    from,
    args = [],
    settings,
    esOwner,
    commandName,
    isGroup,
    botId,
    botLabel,
  }) => {
    const quoted = msg?.key ? { quoted: msg } : undefined;
    const prefix = getPrefix(settings);
    const runtime = global.botRuntime;
    const rawArg = String(args[0] || "").trim();
    const action = rawArg.toLowerCase();
    const effectiveAction =
      !rawArg && String(commandName || "").toLowerCase() === "subbots"
        ? "list"
        : action;
    const requestedNumber = normalizeNumber(rawArg);
    const chatStatus = getCurrentChatStatus({ isGroup, botId, botLabel });

    if (
      !runtime?.requestBotPairingCode ||
      !runtime?.listBots ||
      !runtime?.getSubbotRequestState ||
      !runtime?.setSubbotPublicRequests
    ) {
      return sock.sendMessage(
        from,
        {
          text: "No pude acceder al control interno del subbot.",
          ...global.channelInfo,
        },
        quoted
      );
    }

    const subbotAccess = runtime.getSubbotRequestState();

    if (["on", "activar", "encender", "publico", "public"].includes(effectiveAction)) {
      if (!esOwner) {
        return sock.sendMessage(
          from,
          {
            text: "Solo el owner puede activar el subbot para todos.",
            ...global.channelInfo,
          },
          quoted
        );
      }

      runtime.setSubbotPublicRequests(true);

      return sock.sendMessage(
        from,
        {
          text:
            `*SUBBOT ACTIVADO*\n\n` +
            `Acceso publico: *ENCENDIDO*\n` +
            `Ahora todos pueden usar *${prefix}subbot* para pedir el codigo.\n` +
            `En este chat: ${chatStatus}`,
          ...global.channelInfo,
        },
        quoted
      );
    }

    if (["off", "desactivar", "apagar", "cerrar", "close"].includes(effectiveAction)) {
      if (!esOwner) {
        return sock.sendMessage(
          from,
          {
            text: "Solo el owner puede apagar el acceso al subbot.",
            ...global.channelInfo,
          },
          quoted
        );
      }

      runtime.setSubbotPublicRequests(false);

      return sock.sendMessage(
        from,
        {
          text:
            `*SUBBOT APAGADO*\n\n` +
            `Acceso publico: *APAGADO*\n` +
            `Nadie podra pedir el codigo del subbot hasta que lo vuelvas a activar.\n` +
            `En este chat: ${chatStatus}`,
          ...global.channelInfo,
        },
        quoted
      );
    }

    if (["list", "lista", "status", "estado", "panel"].includes(effectiveAction)) {
      const bots = runtime.listBots();
      const publicLabel = subbotAccess.publicRequests ? "ENCENDIDO" : "APAGADO";
      const lines = bots.length
        ? bots.map((bot) => buildSubbotCard(bot))
        : ["• No hay subbots activos en este momento."];

      return sock.sendMessage(
        from,
        {
          text:
            `*PANEL SUBBOTS*\n\n` +
            `Modo publico: *${publicLabel}*\n` +
            `Hora actual: ${formatDateTime(Date.now())}\n` +
            `En este chat: ${chatStatus}\n\n` +
            `${lines.join("\n\n")}\n\n` +
            `Comandos:\n` +
            `• ${prefix}subbot\n` +
            `• ${prefix}subbot 519xxxxxxxxx\n` +
            `• ${prefix}subbot on\n` +
            `• ${prefix}subbot off`,
          ...global.channelInfo,
        },
        quoted
      );
    }

    if (rawArg && !requestedNumber) {
      return sock.sendMessage(
        from,
        {
          text:
            `Uso correcto:\n` +
            `*${prefix}subbot*\n` +
            `*${prefix}subbot 519xxxxxxxxx*\n` +
            `*${prefix}subbot list*\n` +
            `*${prefix}subbot on*\n` +
            `*${prefix}subbot off*`,
          ...global.channelInfo,
        },
        quoted
      );
    }

    if (!subbotAccess.publicRequests && !esOwner) {
      return sock.sendMessage(
        from,
        {
          text:
            `*SUBBOT APAGADO POR OWNER*\n\n` +
            `Ahora mismo nadie puede pedir el codigo del subbot.\n` +
            `En este chat: ${chatStatus}`,
          ...global.channelInfo,
        },
        quoted
      );
    }

    await sock.sendMessage(
      from,
      {
        text:
          `Generando codigo del subbot...\n` +
          `Modo publico: *${subbotAccess.publicRequests ? "ENCENDIDO" : "APAGADO"}*`,
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
        text = `El subbot ya esta vinculado y funcionando.\nEn este chat: ${chatStatus}`;
      } else if (result?.status === "pending") {
        text =
          "Ya hay una solicitud de codigo en proceso para el subbot. Espera un momento y vuelve a intentar.";
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
      ? "CODIGO ACTUAL DEL SUBBOT"
      : "CODIGO DE VINCULACION DEL SUBBOT";

    return sock.sendMessage(
      from,
      {
        text:
          `*${header}*\n\n` +
          `Bot: *${result.displayName}*\n` +
          `Numero: *${result.number}*\n` +
          `Codigo: *${result.code}*\n` +
          `Expira aprox: *${formatDuration(result.expiresInMs)}*\n` +
          `En este chat: ${chatStatus}\n\n` +
          `Abre WhatsApp > Dispositivos vinculados > Vincular con numero de telefono.`,
        ...global.channelInfo,
      },
      quoted
    );
  },
};
