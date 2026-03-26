import {
  formatChatLabel,
  formatUserLabel,
  getGameLeaderboard,
  getGamesStatsOverview,
  getPrefix,
} from "./_shared.js";

const GAME_ALIASES = {
  quizanime: "quizanime",
};

const VALID_GAMES = new Set([
  "ppt",
  "adivina",
  "ahorcado",
  "mezclapalabra",
  "mate",
  "trivia",
  "verdaderoofalso",
  "quizanime",
  "emojiquiz",
  "banderas",
  "tictactoe",
  "ruleta",
]);

export default {
  name: "topjuegos",
  command: ["topjuegos", "topgames", "rankinggames"],
  category: "juegos",
  description: "Muestra el ranking global o por grupo de juegos",

  run: async ({ sock, msg, from, args = [], settings }) => {
    const prefix = getPrefix(settings);
    const first = String(args[0] || "").trim().toLowerCase();
    const second = String(args[1] || "").trim().toLowerCase();

    const isGroupRanking = first === "grupo" || first === "group";
    const selectedGame = GAME_ALIASES[isGroupRanking ? second : first] || (isGroupRanking ? second : first);
    const game = VALID_GAMES.has(selectedGame) ? selectedGame : "";
    const board = getGameLeaderboard({
      game,
      chatId: isGroupRanking ? from : "",
      limit: 10,
    });
    const overview = getGamesStatsOverview();

    return sock.sendMessage(
      from,
      {
        text:
          `*TOP JUEGOS*\n\n` +
          `Modo: *${isGroupRanking ? "GRUPO" : "GLOBAL"}*\n` +
          `Juego: *${game || "TODOS"}*\n` +
          `Jugadores registrados: *${overview.players}*\n` +
          `Partidas guardadas: *${overview.totalPlayed}*\n` +
          `Puntos totales: *${overview.totalPoints}*\n` +
          `${isGroupRanking ? `Chat: *${formatChatLabel(from)}*\n` : ""}\n` +
          (board.length
            ? board
                .map(
                  (entry, index) =>
                    `${index + 1}. ${formatUserLabel(entry.userId)} - ${entry.points} pts - ${entry.wins} wins`
                )
                .join("\n")
            : "No hay datos para ese ranking.") +
          `\n\nUso:\n` +
          `${prefix}topjuegos\n` +
          `${prefix}topjuegos grupo\n` +
          `${prefix}topjuegos trivia`,
        ...global.channelInfo,
      },
      { quoted: msg }
    );
  },
};
