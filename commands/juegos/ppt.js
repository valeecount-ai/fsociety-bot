import { getPrefix, recordGameResult, randomItem } from "./_shared.js";

const OPTIONS = ["piedra", "papel", "tijera"];

function normalizeChoice(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "rock") return "piedra";
  if (raw === "scissors") return "tijera";
  return raw;
}

function resolveOutcome(userChoice, botChoice) {
  if (userChoice === botChoice) return { outcome: "draw", points: 1 };

  const wins =
    (userChoice === "piedra" && botChoice === "tijera") ||
    (userChoice === "papel" && botChoice === "piedra") ||
    (userChoice === "tijera" && botChoice === "papel");

  return wins
    ? { outcome: "win", points: 3 }
    : { outcome: "loss", points: 0 };
}

export default {
  name: "ppt",
  command: ["ppt", "piedrapapeltijera"],
  category: "juegos",
  description: "Juega piedra papel o tijera contra el bot",

  run: async ({ sock, msg, from, args = [], sender, settings }) => {
    const choice = normalizeChoice(args[0]);
    const prefix = getPrefix(settings);

    if (!OPTIONS.includes(choice)) {
      return sock.sendMessage(
        from,
        {
          text: `Uso: ${prefix}ppt piedra | papel | tijera`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    const botChoice = randomItem(OPTIONS);
    const result = resolveOutcome(choice, botChoice);
    recordGameResult({
      userId: sender,
      chatId: from,
      game: "ppt",
      points: result.points,
      outcome: result.outcome,
    });

    const label =
      result.outcome === "win"
        ? "GANASTE"
        : result.outcome === "loss"
          ? "PERDISTE"
          : "EMPATE";

    return sock.sendMessage(
      from,
      {
        text:
          `*PIEDRA PAPEL O TIJERA*\n\n` +
          `Tu: *${choice}*\n` +
          `Bot: *${botChoice}*\n` +
          `Resultado: *${label}*\n` +
          `Puntos: *+${result.points}*`,
        ...global.channelInfo,
      },
      { quoted: msg }
    );
  },
};
