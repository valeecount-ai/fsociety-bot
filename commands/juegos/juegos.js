import fs from "fs";
import path from "path";
import { getPrefix } from "./_shared.js";

function buildJuegosMessage(caption) {
  const imagePath = path.join(process.cwd(), "imagenes", "juegos.png");

  if (fs.existsSync(imagePath)) {
    return {
      image: fs.readFileSync(imagePath),
      caption,
      ...global.channelInfo,
    };
  }

  return {
    text: caption,
    ...global.channelInfo,
  };
}

export default {
  name: "juegos",
  command: ["juegos", "games", "menujuegos"],
  category: "juegos",
  description: "Muestra el menu de juegos del bot",

  run: async ({ sock, msg, from, settings }) => {
    const prefix = getPrefix(settings);

    return sock.sendMessage(
      from,
      buildJuegosMessage(
        `*JUEGOS BOT*\n\n` +
          `Disponibles:\n` +
          `- ${prefix}ppt piedra\n` +
          `- ${prefix}adivina\n` +
          `- ${prefix}ahorcado\n` +
          `- ${prefix}mezclapalabra\n` +
        `- ${prefix}mate\n` +
        `- ${prefix}trivia\n` +
        `- ${prefix}verdaderoofalso\n` +
        `- ${prefix}quizanime\n` +
        `- ${prefix}emojiquiz\n` +
        `- ${prefix}banderas\n` +
        `- ${prefix}tictactoe\n` +
        `- ${prefix}ruleta rojo\n\n` +
          `Free Fire:\n` +
          `- ${prefix}ff\n` +
          `- ${prefix}ffcrear Torneo Semanal\n` +
          `- ${prefix}ffreglas\n` +
          `- ${prefix}ffformato 4v4 | bo3 | rbo7\n` +
          `- ${prefix}ffclan add Clan Alpha\n` +
          `- ${prefix}ffinscribir Clan Alpha | Nick\n` +
          `- ${prefix}ffinscritos\n` +
          `- ${prefix}ffvs Clan Alpha | Clan Beta | R1\n` +
          `- ${prefix}ffresultado M1 | Clan Alpha | 2-1 | 15-10\n` +
          `- ${prefix}fftabla\n\n` +
          `Rankings:\n` +
          `- ${prefix}topjuegos\n` +
          `- ${prefix}topjuegos grupo\n` +
          `- ${prefix}topjuegos trivia\n` +
          `- ${prefix}topjuegos quizanime\n` +
          `- ${prefix}topjuegos verdaderoofalso\n` +
          `- ${prefix}topjuegos grupo trivia\n` +
          `- ${prefix}perfilgame\n\n` +
          `Control:\n` +
          `- ${prefix}salirjuego`
      ),
      { quoted: msg }
    );
  },
};
