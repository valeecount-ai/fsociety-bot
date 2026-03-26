import { getPrefix, recordGameResult } from "./_shared.js";

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18,
  19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

function getRouletteColor(number) {
  if (number === 0) return "verde";
  return RED_NUMBERS.has(number) ? "rojo" : "negro";
}

function normalizeBet(rawValue = "") {
  const value = String(rawValue || "").trim().toLowerCase();
  if (!value) return { type: "help", label: "" };

  if (["rojo", "red"].includes(value)) return { type: "color", value: "rojo", label: "ROJO" };
  if (["negro", "black"].includes(value)) return { type: "color", value: "negro", label: "NEGRO" };
  if (["verde", "green", "cero", "0"].includes(value)) {
    if (value === "0") return { type: "number", value: 0, label: "0" };
    return { type: "color", value: "verde", label: "VERDE" };
  }
  if (["par", "even"].includes(value)) return { type: "parity", value: "par", label: "PAR" };
  if (["impar", "odd"].includes(value)) return { type: "parity", value: "impar", label: "IMPAR" };
  if (["bajo", "1-18", "low"].includes(value)) return { type: "range", value: "1-18", label: "1-18" };
  if (["alto", "19-36", "high"].includes(value)) {
    return { type: "range", value: "19-36", label: "19-36" };
  }

  if (/^\d+$/.test(value)) {
    const number = Number.parseInt(value, 10);
    if (number >= 0 && number <= 36) {
      return { type: "number", value: number, label: String(number) };
    }
  }

  return { type: "invalid", label: value };
}

function resolveResult(bet, rolledNumber) {
  const color = getRouletteColor(rolledNumber);

  if (bet.type === "number") {
    const win = bet.value === rolledNumber;
    return {
      outcome: win ? "win" : "loss",
      points: win ? (rolledNumber === 0 ? 20 : 18) : 0,
      detail: `Numero: *${rolledNumber}*`,
      color,
    };
  }

  if (bet.type === "color") {
    const win = bet.value === color;
    return {
      outcome: win ? "win" : "loss",
      points: win ? (color === "verde" ? 12 : 5) : 0,
      detail: `Color: *${color.toUpperCase()}*`,
      color,
    };
  }

  if (bet.type === "parity") {
    const parity = rolledNumber === 0 ? "ninguno" : rolledNumber % 2 === 0 ? "par" : "impar";
    const win = parity === bet.value;
    return {
      outcome: win ? "win" : "loss",
      points: win ? 4 : 0,
      detail: `Numero: *${rolledNumber}* (${parity.toUpperCase()})`,
      color,
    };
  }

  const inLowRange = rolledNumber >= 1 && rolledNumber <= 18;
  const inHighRange = rolledNumber >= 19 && rolledNumber <= 36;
  const matchedRange =
    (bet.value === "1-18" && inLowRange) ||
    (bet.value === "19-36" && inHighRange);

  return {
    outcome: matchedRange ? "win" : "loss",
    points: matchedRange ? 4 : 0,
    detail: `Numero: *${rolledNumber}* (${color.toUpperCase()})`,
    color,
  };
}

function buildUsage(prefix) {
  return (
    `*RULETA*\n\n` +
    `Uso:\n` +
    `${prefix}ruleta rojo\n` +
    `${prefix}ruleta negro\n` +
    `${prefix}ruleta verde\n` +
    `${prefix}ruleta par\n` +
    `${prefix}ruleta impar\n` +
    `${prefix}ruleta bajo\n` +
    `${prefix}ruleta alto\n` +
    `${prefix}ruleta 7\n\n` +
    `Apuestas validas: rojo, negro, verde, par, impar, bajo, alto o un numero del 0 al 36.`
  );
}

export default {
  name: "ruleta",
  command: ["ruleta", "roulette"],
  category: "juegos",
  description: "Apuesta a color, rango o numero en la ruleta del bot",

  run: async ({ sock, msg, from, args = [], sender, settings }) => {
    const prefix = getPrefix(settings);
    const bet = normalizeBet(args[0]);

    if (bet.type === "help" || bet.type === "invalid") {
      return sock.sendMessage(
        from,
        {
          text: buildUsage(prefix),
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    const rolledNumber = Math.floor(Math.random() * 37);
    const result = resolveResult(bet, rolledNumber);
    const outcomeLabel = result.outcome === "win" ? "GANASTE" : "PERDISTE";

    recordGameResult({
      userId: sender,
      chatId: from,
      game: "ruleta",
      points: result.points,
      outcome: result.outcome,
    });

    return sock.sendMessage(
      from,
      {
        text:
          `*RULETA DEL BOT*\n\n` +
          `Tu apuesta: *${bet.label}*\n` +
          `${result.detail}\n` +
          `Color final: *${result.color.toUpperCase()}*\n` +
          `Resultado: *${outcomeLabel}*\n` +
          `Puntos: *+${result.points}*`,
        ...global.channelInfo,
      },
      { quoted: msg }
    );
  },
};
