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
  updateActiveSession,
} from "./_shared.js";
import { FLAG_QUIZZES } from "./_data.js";

const MAX_ATTEMPTS = 3;

function normalizeAnswer(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesAnswer(input, answers = []) {
  const normalizedInput = normalizeAnswer(input);
  if (!normalizedInput) return false;

  return (Array.isArray(answers) ? answers : []).some(
    (answer) => normalizeAnswer(answer) === normalizedInput
  );
}

export default {
  name: "banderas",
  command: ["banderas", "flagquiz", "adivinabandera"],
  category: "juegos",
  description: "Adivina el pais segun su bandera",

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

    const item = randomItem(FLAG_QUIZZES);
    setActiveSession(from, {
      game: "banderas",
      userId: sender,
      flag: item.flag,
      country: item.country,
      answers: item.answers,
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
    });

    return sock.sendMessage(
      from,
      {
        text:
          `*QUIZ BANDERAS*\n\n` +
          `Que pais corresponde a esta bandera?\n` +
          `${item.flag}\n\n` +
          `Intentos: *0/${MAX_ATTEMPTS}*\n` +
          `Usa *${prefix}salirjuego* para cancelar.`,
        ...global.channelInfo,
      },
      { quoted: msg }
    );
  },

  onMessage: async ({ sock, msg, from, sender, text, settings }) => {
    const session = getActiveSession(from);
    if (!session || session.game !== "banderas") return false;
    if (session.userId !== sender) return false;
    if (isCommandText(text, settings)) return false;

    const answer = String(text || "").trim();
    if (!answer) return false;

    const attempts = Number(session.attempts || 0) + 1;

    if (matchesAnswer(answer, session.answers)) {
      clearActiveSession(from);
      const points = Math.max(4, 8 - attempts);
      recordGameResult({
        userId: sender,
        chatId: from,
        game: "banderas",
        points,
        outcome: "win",
      });

      await sock.sendMessage(
        from,
        {
          text:
            `*GANASTE EN BANDERAS*\n\n` +
            `${session.flag}\n` +
            `Pais: *${session.country.toUpperCase()}*\n` +
            `Puntos: *+${points}*`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
      return true;
    }

    if (attempts >= Number(session.maxAttempts || MAX_ATTEMPTS)) {
      clearActiveSession(from);
      recordGameResult({
        userId: sender,
        chatId: from,
        game: "banderas",
        points: 0,
        outcome: "loss",
      });

      await sock.sendMessage(
        from,
        {
          text:
            `*PERDISTE EN BANDERAS*\n\n` +
            `${session.flag}\n` +
            `Respuesta correcta: *${session.country.toUpperCase()}*`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
      return true;
    }

    updateActiveSession(from, { attempts });
    await sock.sendMessage(
      from,
      {
        text:
          `No era ese pais.\n` +
          `${session.flag}\n` +
          `Intentos: *${attempts}/${session.maxAttempts}*`,
        ...global.channelInfo,
      },
      { quoted: msg }
    );
    return true;
  },
};
