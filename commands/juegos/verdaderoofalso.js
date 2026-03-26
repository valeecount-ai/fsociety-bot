import {
  buildActiveSessionMessage,
  clearActiveSession,
  ensureSessionAvailable,
  getActiveSession,
  getPrefix,
  isCommandText,
  randomItem,
  recordGameResult,
  setActiveSession,
} from "./_shared.js";
import { TRUE_FALSE_QUESTIONS } from "./_data.js";

function normalizeAnswer(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (["v", "verdadero", "true", "si", "yes"].includes(raw)) return true;
  if (["f", "falso", "false", "no"].includes(raw)) return false;
  return null;
}

export default {
  name: "verdaderoofalso",
  command: ["verdaderoofalso", "vof", "truefalse"],
  category: "juegos",
  description: "Responde si una afirmacion es verdadera o falsa",

  run: async ({ sock, msg, from, sender, settings }) => {
    const prefix = getPrefix(settings);
    const active = getActiveSession(from);

    if (!ensureSessionAvailable(from)) {
      return sock.sendMessage(
        from,
        {
          text: buildActiveSessionMessage(prefix, active),
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    const item = randomItem(TRUE_FALSE_QUESTIONS);
    setActiveSession(from, {
      game: "verdaderoofalso",
      userId: sender,
      statement: item.statement,
      answer: Boolean(item.answer),
      explanation: String(item.explanation || "").trim(),
    });

    return sock.sendMessage(
      from,
      {
        text:
          `*VERDADERO O FALSO*\n\n` +
          `${item.statement}\n\n` +
          `Responde con *verdadero* o *falso*.\n` +
          `Tambien puedes usar *v* o *f*.\n` +
          `Usa *${prefix}salirjuego* para cancelar.`,
        ...global.channelInfo,
      },
      { quoted: msg }
    );
  },

  onMessage: async ({ sock, msg, from, sender, text, settings }) => {
    const session = getActiveSession(from);
    if (!session || session.game !== "verdaderoofalso") return false;
    if (session.userId !== sender) return false;
    if (isCommandText(text, settings)) return false;

    const answer = normalizeAnswer(text);
    if (answer === null) {
      await sock.sendMessage(
        from,
        {
          text: "Responde solo con verdadero, falso, v o f.",
          ...global.channelInfo,
        },
        { quoted: msg }
      );
      return true;
    }

    clearActiveSession(from);

    if (answer === Boolean(session.answer)) {
      recordGameResult({
        userId: sender,
        chatId: from,
        game: "verdaderoofalso",
        points: 5,
        outcome: "win",
      });

      await sock.sendMessage(
        from,
        {
          text:
            `*GANASTE EN VERDADERO O FALSO*\n\n` +
            `Afirmacion: *${session.statement}*\n` +
            `Respuesta: *${session.answer ? "VERDADERO" : "FALSO"}*\n` +
            `${session.explanation ? `Dato: ${session.explanation}\n` : ""}` +
            `Puntos: *+5*`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
      return true;
    }

    recordGameResult({
      userId: sender,
      chatId: from,
      game: "verdaderoofalso",
      points: 0,
      outcome: "loss",
    });

    await sock.sendMessage(
      from,
      {
        text:
          `*PERDISTE EN VERDADERO O FALSO*\n\n` +
          `Afirmacion: *${session.statement}*\n` +
          `Respuesta correcta: *${session.answer ? "VERDADERO" : "FALSO"}*\n` +
          `${session.explanation ? `Dato: ${session.explanation}` : ""}`,
        ...global.channelInfo,
      },
      { quoted: msg }
    );
    return true;
  },
};
