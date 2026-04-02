import path from "path";
import { createScheduledJsonStore, getPrimaryPrefix } from "../../lib/json-store.js";

const STORE_FILE = path.join(process.cwd(), "database", "freefire-torneos.json");
const store = createScheduledJsonStore(STORE_FILE, () => ({ groups: {} }));

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value = "") {
  return String(value || "").trim();
}

function normalizeClanKey(value = "") {
  return normalizeText(value).toLowerCase();
}

function getGroupState(groupId) {
  const groups = store.state.groups || (store.state.groups = {});
  if (!groups[groupId]) {
    groups[groupId] = {
      activeTournamentId: "",
      tournaments: {},
    };
  }

  return groups[groupId];
}

function getActiveTournament(groupId) {
  const groupState = getGroupState(groupId);
  const id = normalizeText(groupState.activeTournamentId);
  if (!id) return null;
  return groupState.tournaments[id] || null;
}

function createTournament(groupId, payload = {}) {
  const groupState = getGroupState(groupId);
  const tournamentId = `ff-${Date.now()}`;

  groupState.tournaments[tournamentId] = {
    id: tournamentId,
    name: normalizeText(payload.name) || "Torneo Free Fire",
    createdBy: normalizeText(payload.createdBy) || "",
    createdAt: nowIso(),
    status: "activo",
    scoreRules: {
      win: 3,
      draw: 1,
      loss: 0,
      tieBreaker: "diferencia_kills",
    },
    clans: [],
    matches: [],
    nextMatchNumber: 1,
  };
  groupState.activeTournamentId = tournamentId;
  store.scheduleSave();
  return groupState.tournaments[tournamentId];
}

function ensureTournament(groupId) {
  return getActiveTournament(groupId);
}

function findClan(tournament, clanName) {
  const key = normalizeClanKey(clanName);
  return tournament.clans.find((clan) => normalizeClanKey(clan.name) === key) || null;
}

function addClan(tournament, clanName) {
  const cleanName = normalizeText(clanName);
  if (!cleanName) {
    return { ok: false, message: "Debes enviar el nombre del clan." };
  }

  if (findClan(tournament, cleanName)) {
    return { ok: false, message: "Ese clan ya esta registrado." };
  }

  const clan = {
    name: cleanName,
    points: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    killsFor: 0,
    killsAgainst: 0,
    createdAt: nowIso(),
  };
  tournament.clans.push(clan);
  return { ok: true, clan };
}

function removeClan(tournament, clanName) {
  const key = normalizeClanKey(clanName);
  const index = tournament.clans.findIndex((item) => normalizeClanKey(item.name) === key);
  if (index < 0) {
    return { ok: false, message: "No encontre ese clan en el torneo." };
  }

  const [removed] = tournament.clans.splice(index, 1);
  tournament.matches = tournament.matches.filter((match) => {
    return (
      normalizeClanKey(match.clanA) !== key &&
      normalizeClanKey(match.clanB) !== key
    );
  });

  return { ok: true, clan: removed };
}

function createMatch(tournament, clanAName, clanBName, roundLabel = "") {
  const clanA = findClan(tournament, clanAName);
  const clanB = findClan(tournament, clanBName);
  if (!clanA || !clanB) {
    return { ok: false, message: "Ambos clanes deben estar registrados primero." };
  }

  if (normalizeClanKey(clanA.name) === normalizeClanKey(clanB.name)) {
    return { ok: false, message: "No puedes crear VS contra el mismo clan." };
  }

  const matchId = `M${tournament.nextMatchNumber}`;
  tournament.nextMatchNumber += 1;
  const match = {
    id: matchId,
    clanA: clanA.name,
    clanB: clanB.name,
    round: normalizeText(roundLabel) || "R1",
    status: "pendiente",
    createdAt: nowIso(),
    result: null,
  };
  tournament.matches.push(match);
  return { ok: true, match };
}

function parseScore(value = "") {
  const raw = normalizeText(value);
  const match = raw.match(/^(\d+)\s*[-:]\s*(\d+)$/);
  if (!match) return null;
  return {
    a: Number.parseInt(match[1], 10),
    b: Number.parseInt(match[2], 10),
  };
}

function applyMatchResult(tournament, matchId, winnerName, scoreText, killsText = "", actor = "") {
  const match = tournament.matches.find((item) => normalizeClanKey(item.id) === normalizeClanKey(matchId));
  if (!match) {
    return { ok: false, message: "No encontre ese match id." };
  }

  const score = parseScore(scoreText);
  if (!score) {
    return { ok: false, message: "Formato de score invalido. Usa 2-1 o 6:4." };
  }

  const kills = parseScore(killsText || "0-0") || { a: 0, b: 0 };
  const clanA = findClan(tournament, match.clanA);
  const clanB = findClan(tournament, match.clanB);
  if (!clanA || !clanB) {
    return { ok: false, message: "El match tiene clanes invalidos." };
  }

  let winner = normalizeText(winnerName);
  if (!winner) {
    if (score.a > score.b) winner = match.clanA;
    else if (score.b > score.a) winner = match.clanB;
    else winner = "empate";
  }

  const winnerKey = normalizeClanKey(winner);
  const isDraw = winnerKey === "empate" || winnerKey === "draw" || score.a === score.b;
  if (!isDraw && winnerKey !== normalizeClanKey(match.clanA) && winnerKey !== normalizeClanKey(match.clanB)) {
    return { ok: false, message: "El ganador debe ser uno de los dos clanes del match." };
  }

  match.status = "jugado";
  match.result = {
    winner: isDraw ? "empate" : winner,
    scoreA: score.a,
    scoreB: score.b,
    killsA: kills.a,
    killsB: kills.b,
    by: normalizeText(actor),
    at: nowIso(),
  };

  clanA.killsFor += kills.a;
  clanA.killsAgainst += kills.b;
  clanB.killsFor += kills.b;
  clanB.killsAgainst += kills.a;

  if (isDraw) {
    clanA.draws += 1;
    clanB.draws += 1;
    clanA.points += tournament.scoreRules.draw;
    clanB.points += tournament.scoreRules.draw;
  } else if (winnerKey === normalizeClanKey(match.clanA)) {
    clanA.wins += 1;
    clanB.losses += 1;
    clanA.points += tournament.scoreRules.win;
    clanB.points += tournament.scoreRules.loss;
  } else {
    clanB.wins += 1;
    clanA.losses += 1;
    clanB.points += tournament.scoreRules.win;
    clanA.points += tournament.scoreRules.loss;
  }

  return { ok: true, match, clanA, clanB };
}

function getSortedTable(tournament) {
  return [...tournament.clans].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const kdA = (a.killsFor || 0) - (a.killsAgainst || 0);
    const kdB = (b.killsFor || 0) - (b.killsAgainst || 0);
    if (kdB !== kdA) return kdB - kdA;
    if ((b.killsFor || 0) !== (a.killsFor || 0)) return (b.killsFor || 0) - (a.killsFor || 0);
    return a.name.localeCompare(b.name);
  });
}

function formatTable(tournament) {
  const rows = getSortedTable(tournament);
  if (!rows.length) {
    return "No hay clanes registrados todavia.";
  }

  return rows
    .map((clan, idx) => {
      const kd = (clan.killsFor || 0) - (clan.killsAgainst || 0);
      return `${idx + 1}. ${clan.name}\n` +
        `   Pts:${clan.points} W:${clan.wins} D:${clan.draws} L:${clan.losses} KD:${kd}`;
    })
    .join("\n");
}

function formatMatches(tournament) {
  if (!tournament.matches.length) {
    return "No hay VS programados todavia.";
  }

  return tournament.matches
    .slice()
    .reverse()
    .slice(0, 12)
    .map((match) => {
      if (match.status === "jugado" && match.result) {
        return `${match.id} | ${match.round}\n` +
          `${match.clanA} vs ${match.clanB}\n` +
          `Resultado: ${match.result.scoreA}-${match.result.scoreB} | Ganador: ${match.result.winner}`;
      }

      return `${match.id} | ${match.round}\n` +
        `${match.clanA} vs ${match.clanB}\n` +
        `Estado: pendiente`;
    })
    .join("\n\n");
}

function parsePipeArgs(args = []) {
  return String(Array.isArray(args) ? args.join(" ") : "")
    .split("|")
    .map((part) => normalizeText(part));
}

function buildUsage(prefix = ".") {
  return (
    `*FREE FIRE TORNEOS*\n\n` +
    `Crear torneo (admin):\n` +
    `- ${prefix}ffcrear Nombre del torneo\n\n` +
    `Clanes (admin):\n` +
    `- ${prefix}ffclan add Nombre Clan\n` +
    `- ${prefix}ffclan del Nombre Clan\n` +
    `- ${prefix}ffclanes\n\n` +
    `Programar VS (admin):\n` +
    `- ${prefix}ffvs Clan A | Clan B | Ronda 1\n\n` +
    `Resultado (admin):\n` +
    `- ${prefix}ffresultado M1 | Clan A | 2-1 | 15-10\n` +
    `  (ultimo valor = killsA-killsB, opcional)\n\n` +
    `Ver estado:\n` +
    `- ${prefix}ffestado\n` +
    `- ${prefix}ffpartidos\n` +
    `- ${prefix}fftabla\n\n` +
    `Cerrar torneo (admin):\n` +
    `- ${prefix}ffcerrar`
  );
}

function requireAdmin({ esAdmin, esOwner }) {
  return Boolean(esAdmin || esOwner);
}

export default {
  name: "freefire",
  command: [
    "ff",
    "freefire",
    "ffcrear",
    "ffclan",
    "ffclanes",
    "ffvs",
    "ffresultado",
    "fftabla",
    "ffpartidos",
    "ffestado",
    "ffcerrar",
  ],
  category: "juegos",
  description: "Organiza torneos y VS de clanes de Free Fire en grupos",
  groupOnly: true,

  run: async ({
    sock,
    msg,
    from,
    args = [],
    commandName = "",
    settings = {},
    esAdmin = false,
    esOwner = false,
    esGrupo = false,
    isGroup = false,
    sender = "",
  }) => {
    const prefix = getPrimaryPrefix(settings);
    const isGroupChat = Boolean(esGrupo || isGroup || String(from || "").endsWith("@g.us"));
    if (!isGroupChat) {
      return sock.sendMessage(
        from,
        { text: "Este comando solo funciona en grupos.", ...global.channelInfo },
        { quoted: msg }
      );
    }

    const normalizedCommand = normalizeText(commandName).toLowerCase();
    const actionFromAliasMap = {
      ffcrear: "crear",
      ffclan: "clan",
      ffclanes: "clanes",
      ffvs: "vs",
      ffresultado: "resultado",
      fftabla: "tabla",
      ffpartidos: "partidos",
      ffestado: "estado",
      ffcerrar: "cerrar",
    };

    let action = actionFromAliasMap[normalizedCommand] || normalizeText(args[0]).toLowerCase();
    let payloadArgs = actionFromAliasMap[normalizedCommand] ? args : args.slice(1);

    if (!action || action === "ff" || action === "freefire" || action === "menu" || action === "help") {
      action = "help";
      payloadArgs = [];
    }

    if (action === "crear") {
      if (!requireAdmin({ esAdmin, esOwner })) {
        return sock.sendMessage(from, { text: "Solo admin/owner puede crear torneos.", ...global.channelInfo }, { quoted: msg });
      }

      const tournamentName = normalizeText(payloadArgs.join(" ")) || "Torneo Free Fire";
      const tournament = createTournament(from, {
        name: tournamentName,
        createdBy: sender,
      });

      return sock.sendMessage(
        from,
        {
          text:
            `*TORNEO CREADO*\n\n` +
            `Nombre: *${tournament.name}*\n` +
            `ID: *${tournament.id}*\n` +
            `Estado: *${tournament.status}*\n\n` +
            `Siguiente paso:\n` +
            `- ${prefix}ffclan add Nombre Clan`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    const tournament = ensureTournament(from);
    if (!tournament) {
      return sock.sendMessage(
        from,
        {
          text:
            `No hay torneo activo en este grupo.\n` +
            `Crea uno con: *${prefix}ffcrear Nombre del torneo*`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "clan") {
      if (!requireAdmin({ esAdmin, esOwner })) {
        return sock.sendMessage(from, { text: "Solo admin/owner puede gestionar clanes.", ...global.channelInfo }, { quoted: msg });
      }

      const subAction = normalizeText(payloadArgs[0]).toLowerCase();
      const clanName = normalizeText(payloadArgs.slice(1).join(" "));
      if (!subAction || !["add", "del", "remove", "delete"].includes(subAction)) {
        return sock.sendMessage(
          from,
          {
            text:
              `Uso:\n` +
              `- ${prefix}ffclan add Nombre Clan\n` +
              `- ${prefix}ffclan del Nombre Clan`,
            ...global.channelInfo,
          },
          { quoted: msg }
        );
      }

      const result =
        subAction === "add"
          ? addClan(tournament, clanName)
          : removeClan(tournament, clanName);

      if (!result.ok) {
        return sock.sendMessage(from, { text: result.message, ...global.channelInfo }, { quoted: msg });
      }

      store.scheduleSave();
      return sock.sendMessage(
        from,
        {
          text:
            subAction === "add"
              ? `Clan registrado: *${result.clan.name}*`
              : `Clan eliminado: *${result.clan.name}*`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "clanes") {
      const list = tournament.clans.length
        ? tournament.clans.map((clan, i) => `${i + 1}. ${clan.name}`).join("\n")
        : "No hay clanes registrados.";
      return sock.sendMessage(
        from,
        {
          text:
            `*CLANES REGISTRADOS*\n` +
            `Torneo: *${tournament.name}*\n\n` +
            `${list}`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "vs") {
      if (!requireAdmin({ esAdmin, esOwner })) {
        return sock.sendMessage(from, { text: "Solo admin/owner puede programar VS.", ...global.channelInfo }, { quoted: msg });
      }

      const [clanA, clanB, round = "R1"] = parsePipeArgs(payloadArgs);
      const result = createMatch(tournament, clanA, clanB, round);
      if (!result.ok) {
        return sock.sendMessage(from, { text: result.message, ...global.channelInfo }, { quoted: msg });
      }

      store.scheduleSave();
      return sock.sendMessage(
        from,
        {
          text:
            `*VS PROGRAMADO*\n\n` +
            `Match: *${result.match.id}*\n` +
            `Ronda: *${result.match.round}*\n` +
            `${result.match.clanA} vs ${result.match.clanB}\n\n` +
            `Resultado:\n` +
            `- ${prefix}ffresultado ${result.match.id} | ${result.match.clanA} | 2-1 | 15-10`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "resultado") {
      if (!requireAdmin({ esAdmin, esOwner })) {
        return sock.sendMessage(from, { text: "Solo admin/owner puede cargar resultados.", ...global.channelInfo }, { quoted: msg });
      }

      const [matchId, winnerName, scoreText, killsText = "0-0"] = parsePipeArgs(payloadArgs);
      const result = applyMatchResult(
        tournament,
        matchId,
        winnerName,
        scoreText,
        killsText,
        sender
      );

      if (!result.ok) {
        return sock.sendMessage(from, { text: result.message, ...global.channelInfo }, { quoted: msg });
      }

      store.scheduleSave();
      return sock.sendMessage(
        from,
        {
          text:
            `*RESULTADO CARGADO*\n\n` +
            `Match: *${result.match.id}*\n` +
            `${result.match.clanA} ${result.match.result.scoreA} - ${result.match.result.scoreB} ${result.match.clanB}\n` +
            `Ganador: *${result.match.result.winner}*\n\n` +
            `Consulta tabla:\n` +
            `- ${prefix}fftabla`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "tabla") {
      return sock.sendMessage(
        from,
        {
          text:
            `*TABLA FREE FIRE*\n` +
            `Torneo: *${tournament.name}*\n\n` +
            `${formatTable(tournament)}`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "partidos") {
      return sock.sendMessage(
        from,
        {
          text:
            `*PARTIDOS FREE FIRE*\n` +
            `Torneo: *${tournament.name}*\n\n` +
            `${formatMatches(tournament)}`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "estado") {
      const played = tournament.matches.filter((match) => match.status === "jugado").length;
      return sock.sendMessage(
        from,
        {
          text:
            `*ESTADO TORNEO*\n\n` +
            `Nombre: *${tournament.name}*\n` +
            `ID: *${tournament.id}*\n` +
            `Estado: *${tournament.status}*\n` +
            `Clanes: *${tournament.clans.length}*\n` +
            `Partidos: *${tournament.matches.length}*\n` +
            `Jugados: *${played}*`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "cerrar") {
      if (!requireAdmin({ esAdmin, esOwner })) {
        return sock.sendMessage(from, { text: "Solo admin/owner puede cerrar torneos.", ...global.channelInfo }, { quoted: msg });
      }

      tournament.status = "cerrado";
      const groupState = getGroupState(from);
      groupState.activeTournamentId = "";
      store.scheduleSave();
      return sock.sendMessage(
        from,
        {
          text:
            `*TORNEO CERRADO*\n\n` +
            `Nombre: *${tournament.name}*\n` +
            `Tabla final:\n\n${formatTable(tournament)}`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    return sock.sendMessage(
      from,
      {
        text: buildUsage(prefix),
        ...global.channelInfo,
      },
      { quoted: msg }
    );
  },
};
