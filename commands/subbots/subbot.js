import {
  buildSubbotMediaMessage,
  buildSubbotCard,
  formatDuration,
  getCurrentChatStatus,
  getPrefix,
  getSubbotQuoted,
  hasSubbotRuntime,
  parseSlotToken,
  parseSubbotRequestArgs,
} from "./_shared.js";

export default {
  name: "subbot",
  command: ["subbot", "code", "subbotcode", "codesubbot"],
  category: "subbots",
  description: "Pide el codigo de vinculacion de un subbot",

  run: async ({
    sock,
    msg,
    from,
    sender,
    args = [],
    settings,
    esOwner,
    isGroup,
    botId,
    botLabel,
  }) => {
    const quoted = getSubbotQuoted(msg);
    const prefix = getPrefix(settings);
    const runtime = global.botRuntime;
    const chatStatus = getCurrentChatStatus({ isGroup, botId, botLabel });
    const action = String(args[0] || "").trim().toLowerCase();

    if (!hasSubbotRuntime(runtime)) {
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

    if (["info", "estado"].includes(action)) {
      if (!esOwner) {
        return sock.sendMessage(
          from,
          {
            text: "Solo el owner puede ver el detalle de un slot de subbot.",
            ...global.channelInfo,
          },
          quoted
        );
      }

      const slot = parseSlotToken(args[1], Number(subbotAccess?.maxSlots || 15));
      if (!slot || !runtime?.getBotSummary) {
        return sock.sendMessage(
          from,
          {
            text: `Usa: *${prefix}subbot info 3*`,
            ...global.channelInfo,
          },
          quoted
        );
      }

      const bot = runtime.getBotSummary(`subbot${slot}`);
      if (!bot) {
        return sock.sendMessage(
          from,
          {
            text: `No encontre el slot ${slot}.`,
            ...global.channelInfo,
          },
          quoted
        );
      }

      return sock.sendMessage(
        from,
        {
          text:
            `*INFO SUBBOT ${slot}*\n\n` +
            `Resumen del slot\n\n` +
            `${buildSubbotCard(bot, { compact: false, showSensitive: true })}\n\n` +
            `Vista actual: ${chatStatus}`,
          ...global.channelInfo,
        },
        quoted
      );
    }

    if (["liberar", "release", "free"].includes(action)) {
      if (!esOwner) {
        return sock.sendMessage(
          from,
          {
            text: "Solo el owner puede liberar slots de subbot.",
            ...global.channelInfo,
          },
          quoted
        );
      }

      const slot = parseSlotToken(args[1], Number(subbotAccess?.maxSlots || 15));
      if (!slot || !runtime?.releaseSubbot) {
        return sock.sendMessage(
          from,
          {
            text: `Usa: *${prefix}subbot liberar 3*`,
            ...global.channelInfo,
          },
          quoted
        );
      }

      const result = runtime.releaseSubbot(`subbot${slot}`);
      return sock.sendMessage(
        from,
        {
          text: result?.ok
            ? `Slot ${slot} liberado correctamente.`
            : result?.message || "No pude liberar ese slot.",
          ...global.channelInfo,
        },
        quoted
      );
    }

    if (["reset", "reiniciar"].includes(action)) {
      if (!esOwner) {
        return sock.sendMessage(
          from,
          {
            text: "Solo el owner puede resetear subbots.",
            ...global.channelInfo,
          },
          quoted
        );
      }

      const slot = parseSlotToken(args[1], Number(subbotAccess?.maxSlots || 15));
      if (!slot || !runtime?.resetSubbot) {
        return sock.sendMessage(
          from,
          {
            text: `Usa: *${prefix}subbot reset 3*`,
            ...global.channelInfo,
          },
          quoted
        );
      }

      const result = runtime.resetSubbot(`subbot${slot}`);
      return sock.sendMessage(
        from,
        {
          text: result?.ok
            ? `Slot ${slot} reseteado correctamente.`
            : result?.message || "No pude resetear ese slot.",
          ...global.channelInfo,
        },
        quoted
      );
    }

    if (["slots", "espacios", "capacidad"].includes(action)) {
      if (!esOwner) {
        return sock.sendMessage(
          from,
          {
            text: "Solo el owner puede cambiar la capacidad de subbots.",
            ...global.channelInfo,
          },
          quoted
        );
      }

      const nextSlots = Number.parseInt(String(args[1] || ""), 10);
      if (!Number.isFinite(nextSlots) || !runtime?.setSubbotMaxSlots) {
        return sock.sendMessage(
          from,
          {
            text: `Usa: *${prefix}subbot slots 20*`,
            ...global.channelInfo,
          },
          quoted
        );
      }

      const result = runtime.setSubbotMaxSlots(nextSlots);
      return sock.sendMessage(
        from,
        {
          text: result?.ok
            ? `Capacidad actualizada a *${result.state.maxSlots}* slots.`
            : result?.message || "No pude actualizar la capacidad de subbots.",
          ...global.channelInfo,
        },
        quoted
      );
    }

    const parsed = parseSubbotRequestArgs(
      args,
      Number(subbotAccess?.maxSlots || 15)
    );

    if (parsed.invalid) {
      return sock.sendMessage(
        from,
        {
          text:
            `Uso correcto:\n` +
            `*${prefix}subbot*\n` +
            `*${prefix}subbot 3*\n` +
            `*${prefix}subbot 519xxxxxxxxx*\n` +
            `*${prefix}subbot 3 519xxxxxxxxx*\n` +
            `*${prefix}subbot info 3*\n` +
            `*${prefix}subbot liberar 3*\n` +
            `*${prefix}subbot reset 3*\n` +
            `*${prefix}subbot slots 20*`,
          ...global.channelInfo,
        },
        quoted
      );
    }

    if (!parsed.number) {
      const slotHint = parsed.slot ? ` ${parsed.slot}` : "";

      return sock.sendMessage(
        from,
        buildSubbotMediaMessage(
          "subbotcodigo.png",
          `*NOTIFICACION SUBBOT*\n\n` +
            `Para pedir tu subbot debes enviar tu numero con codigo de pais.\n` +
            `Ejemplo:\n` +
            `*${prefix}subbot${slotHint} 51xxxxx*\n\n` +
            `Si no eliges slot, el bot usa el primer espacio libre.\n` +
            `En este chat: ${chatStatus}`
        ),
        quoted
      );
    }

    if (!subbotAccess.publicRequests && !esOwner) {
      return sock.sendMessage(
        from,
        {
          text:
            `*SUBBOTS APAGADOS POR OWNER*\n\n` +
            `Ahora mismo nadie puede pedir codigo.\n` +
            `En este chat: ${chatStatus}`,
          ...global.channelInfo,
        },
        quoted
      );
    }

    const targetNumber = parsed.number;
    const loadingText =
      parsed.slot
        ? `Generando codigo del subbot ${parsed.slot} para ${targetNumber}...`
        : `Generando codigo para tu subbot ${targetNumber}...`;

    await sock.sendMessage(
      from,
      {
        text:
          `${loadingText}\n` +
          `Modo publico: *${subbotAccess.publicRequests ? "ENCENDIDO" : "APAGADO"}*`,
        ...global.channelInfo,
      },
      quoted
    );

    const result = await runtime.requestBotPairingCode(
      parsed.slot ? `subbot${parsed.slot}` : "subbot",
      {
        number: targetNumber,
        requesterNumber: targetNumber,
        requesterJid: String(sender || ""),
        bypassPublicRequests: Boolean(esOwner),
        useCache: true,
      }
    );

    if (!result?.ok) {
      let text = result?.message || "No pude obtener el codigo del subbot.";

      if (result?.status === "missing_bot") {
        text =
          `No encontre ese slot de subbot.\n` +
          `Usa un numero del 1 al ${subbotAccess.maxSlots}.`;
      } else if (result?.status === "no_capacity") {
        text =
          `No hay slots libres ahora mismo.\n` +
          `Revisa *${prefix}codigosubbots* para ver quien esta conectado.`;
      } else if (result?.status === "slot_busy") {
        text =
          `${result.message}\n` +
          `Prueba con otro slot o revisa *${prefix}codigosubbots*.`;
      } else if (result?.status === "main_not_ready") {
        text = "Primero vincula y conecta el bot principal desde la consola.";
      } else if (result?.status === "already_linked") {
        text =
          `Ese subbot ya esta vinculado y funcionando.\n` +
          `En este chat: ${chatStatus}`;
      } else if (result?.status === "pending") {
        text =
          "Ya hay una solicitud de codigo en proceso para ese subbot. Espera un momento y vuelve a intentar.";
      } else if (result?.status === "missing_number") {
        const slotHint = parsed.slot ? ` ${parsed.slot}` : "";
        text =
          `Debes enviar tu numero con codigo de pais.\n` +
          `Usa: *${prefix}subbot${slotHint} 51912345678*`;
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

    const slotLabel = result.slot ? ` ${result.slot}` : "";
    const header = result.cached
      ? `CODIGO ACTUAL DEL SUBBOT${slotLabel}`
      : `CODIGO DE VINCULACION DEL SUBBOT${slotLabel}`;

    return sock.sendMessage(
      from,
      buildSubbotMediaMessage(
        "subbotcodigo.png",
        `*${header}*\n\n` +
          `Bot: *${result.displayName}*\n` +
          `Numero: *${result.number}*\n` +
          `Solicitante: *${targetNumber}*\n` +
          `Codigo: *${result.code}*\n` +
          `Expira aprox: *${formatDuration(result.expiresInMs)}*\n` +
          `En este chat: ${chatStatus}\n\n` +
          `Abre WhatsApp > Dispositivos vinculados > Vincular con numero de telefono.`
      ),
      quoted
    );
  },
};
