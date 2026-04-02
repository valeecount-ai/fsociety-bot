import path from "path";
import { createScheduledJsonStore, getPrimaryPrefix } from "../../lib/json-store.js";

const STORE_FILE = path.join(process.cwd(), "database", "freefire-torneos.json");
const store = createScheduledJsonStore(STORE_FILE, () => ({ groups: {} }));

const DEFAULT_SCORE_RULES = Object.freeze({
  win: 3,
  draw: 1,
  loss: 0,
  tieBreaker: "diferencia_kills",
});

const DEFAULT_FORMAT_RULES = Object.freeze({
  mode: "clash_squad",
  teamSize: 4,
  roundsBestOf: 7,
  roundsToWin: 4,
  mapsBestOf: 1,
});

function cloneDefaultScoreRules() {
  return { ...DEFAULT_SCORE_RULES };
}

function cloneDefaultFormatRules() {
  return { ...DEFAULT_FORMAT_RULES };
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value = "") {
  return String(value || "").trim();
}

function normalizeClanKey(value = "") {
  return normalizeText(value).toLowerCase();
}

function normalizeJid(value = "") {
  return normalizeText(value).toLowerCase();
}

function numberFromJid(jid = "") {
  return normalizeJid(jid).split("@")[0].replace(/[^\d]/g, "");
}

function computeRoundsToWin(bestOf) {
  return Math.floor(bestOf / 2) + 1;
}

function parseBestOfValue(rawValue, label) {
  const value = Number.parseInt(String(rawValue || ""), 10);
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, message: `${label} debe ser un numero mayor a 0.` };
  }
  if (value % 2 === 0) {
    return { ok: false, message: `${label} debe ser impar (1, 3, 5, 7...).` };
  }
  return { ok: true, value };
}

function normalizePlayerEntry(rawPlayer = {}, index = 0) {
  const jid = normalizeJid(rawPlayer.jid || rawPlayer.id || "");
  const number = normalizeText(rawPlayer.number || numberFromJid(jid));
  const nick = normalizeText(rawPlayer.nick || rawPlayer.name || `Jugador ${index + 1}`);
  return {
    jid,
    number,
    nick,
    joinedAt: normalizeText(rawPlayer.joinedAt) || nowIso(),
  };
}

function ensureClanShape(clan = {}) {
  let changed = false;
  const next = clan;

  if (!Array.isArray(next.players)) {
    next.players = [];
    changed = true;
  }

  const seenJids = new Set();
  const normalizedPlayers = [];
  next.players.forEach((player, idx) => {
    const normalized = normalizePlayerEntry(player, idx);
    if (!normalized.jid) {
      changed = true;
      return;
    }
    if (seenJids.has(normalized.jid)) {
      changed = true;
      return;
    }
    seenJids.add(normalized.jid);
    normalizedPlayers.push(normalized);
  });

  if (normalizedPlayers.length !== next.players.length) {
    changed = true;
  }
  next.players = normalizedPlayers;

  if (!Number.isFinite(next.points)) {
    next.points = 0;
    changed = true;
  }
  if (!Number.isFinite(next.wins)) {
    next.wins = 0;
    changed = true;
  }
  if (!Number.isFinite(next.draws)) {
    next.draws = 0;
    changed = true;
  }
  if (!Number.isFinite(next.losses)) {
    next.losses = 0;
    changed = true;
  }
  if (!Number.isFinite(next.killsFor)) {
    next.killsFor = 0;
    changed = true;
  }
  if (!Number.isFinite(next.killsAgainst)) {
    next.killsAgainst = 0;
    changed = true;
  }
  if (!normalizeText(next.createdAt)) {
    next.createdAt = nowIso();
    changed = true;
  }

  return { clan: next, changed };
}

function ensureFormatRulesShape(tournament = {}) {
  let changed = false;
  const base = cloneDefaultFormatRules();
  const current = tournament.formatRules || {};
  const next = {
    mode: normalizeText(current.mode) || base.mode,
    teamSize: Number.parseInt(String(current.teamSize ?? base.teamSize), 10),
    roundsBestOf: Number.parseInt(String(current.roundsBestOf ?? base.roundsBestOf), 10),
    roundsToWin: Number.parseInt(String(current.roundsToWin ?? base.roundsToWin), 10),
    mapsBestOf: Number.parseInt(String(current.mapsBestOf ?? base.mapsBestOf), 10),
  };

  if (!Number.isFinite(next.teamSize) || next.teamSize <= 0 || next.teamSize > 12) {
    next.teamSize = base.teamSize;
    changed = true;
  }
  if (!Number.isFinite(next.roundsBestOf) || next.roundsBestOf <= 0 || next.roundsBestOf % 2 === 0) {
    next.roundsBestOf = base.roundsBestOf;
    changed = true;
  }
  if (!Number.isFinite(next.mapsBestOf) || next.mapsBestOf <= 0 || next.mapsBestOf % 2 === 0) {
    next.mapsBestOf = base.mapsBestOf;
    changed = true;
  }

  const expectedRoundsToWin = computeRoundsToWin(next.roundsBestOf);
  if (!Number.isFinite(next.roundsToWin) || next.roundsToWin <= 0 || next.roundsToWin > next.roundsBestOf) {
    next.roundsToWin = expectedRoundsToWin;
    changed = true;
  }
  if (next.roundsToWin !== expectedRoundsToWin) {
    next.roundsToWin = expectedRoundsToWin;
    changed = true;
  }

  if (
    !tournament.formatRules ||
    normalizeText(tournament.formatRules.mode) !== next.mode ||
    tournament.formatRules.teamSize !== next.teamSize ||
    tournament.formatRules.roundsBestOf !== next.roundsBestOf ||
    tournament.formatRules.roundsToWin !== next.roundsToWin ||
    tournament.formatRules.mapsBestOf !== next.mapsBestOf
  ) {
    changed = true;
  }

  tournament.formatRules = next;
  return changed;
}

function ensureTournamentShape(tournament = {}) {
  let changed = false;
  const next = tournament;

  if (!normalizeText(next.id)) {
    next.id = `ff-${Date.now()}`;
    changed = true;
  }
  if (!normalizeText(next.name)) {
    next.name = "Torneo Free Fire";
    changed = true;
  }
  if (!normalizeText(next.status)) {
    next.status = "activo";
    changed = true;
  }
  if (!normalizeText(next.createdAt)) {
    next.createdAt = nowIso();
    changed = true;
  }

  if (!next.scoreRules || typeof next.scoreRules !== "object") {
    next.scoreRules = cloneDefaultScoreRules();
    changed = true;
  } else {
    const base = cloneDefaultScoreRules();
    const scoreRules = next.scoreRules;
    if (!Number.isFinite(scoreRules.win)) {
      scoreRules.win = base.win;
      changed = true;
    }
    if (!Number.isFinite(scoreRules.draw)) {
      scoreRules.draw = base.draw;
      changed = true;
    }
    if (!Number.isFinite(scoreRules.loss)) {
      scoreRules.loss = base.loss;
      changed = true;
    }
    if (!normalizeText(scoreRules.tieBreaker)) {
      scoreRules.tieBreaker = base.tieBreaker;
      changed = true;
    }
  }

  if (!Array.isArray(next.clans)) {
    next.clans = [];
    changed = true;
  }
  if (!Array.isArray(next.matches)) {
    next.matches = [];
    changed = true;
  }
  if (!Number.isFinite(next.nextMatchNumber) || next.nextMatchNumber <= 0) {
    next.nextMatchNumber = next.matches.length + 1;
    changed = true;
  }

  next.clans = next.clans.map((clan) => {
    const result = ensureClanShape(clan);
    if (result.changed) changed = true;
    return result.clan;
  });

  if (ensureFormatRulesShape(next)) {
    changed = true;
  }

  if (changed) {
    store.scheduleSave();
  }

  return next;
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
  const tournament = groupState.tournaments[id] || null;
  return tournament ? ensureTournamentShape(tournament) : null;
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
    scoreRules: cloneDefaultScoreRules(),
    formatRules: cloneDefaultFormatRules(),
    clans: [],
    matches: [],
    nextMatchNumber: 1,
  };
  groupState.activeTournamentId = tournamentId;
  store.scheduleSave();
  return groupState.tournaments[tournamentId];
}

function ensureTournament(groupId) {
  const tournament = getActiveTournament(groupId);
  if (!tournament) return null;
  return ensureTournamentShape(tournament);
}

function findClan(tournament, clanName) {
  const key = normalizeClanKey(clanName);
  return tournament.clans.find((clan) => normalizeClanKey(clan.name) === key) || null;
}

function findPlayerRegistration(tournament, jid = "") {
  const targetJid = normalizeJid(jid);
  if (!targetJid) return null;
  for (const clan of tournament.clans) {
    const player = (clan.players || []).find((item) => normalizeJid(item.jid) === targetJid);
    if (player) {
      return { clan, player };
    }
  }
  return null;
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
    players: [],
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

function addPlayerToClan(tournament, clanName, { jid = "", nick = "" } = {}) {
  const clan = findClan(tournament, clanName);
  if (!clan) {
    return { ok: false, message: "No encontre ese clan. Usa ffclanes para revisar nombres." };
  }

  const targetJid = normalizeJid(jid);
  if (!targetJid) {
    return { ok: false, message: "No pude detectar tu numero para registrarte." };
  }

  const current = findPlayerRegistration(tournament, targetJid);
  if (current && normalizeClanKey(current.clan.name) !== normalizeClanKey(clan.name)) {
    return {
      ok: false,
      message: `Ya estas inscrito en *${current.clan.name}*. Usa ffbaja para cambiarte.`,
    };
  }

  const teamSize = tournament.formatRules?.teamSize || DEFAULT_FORMAT_RULES.teamSize;
  if (!current && (clan.players || []).length >= teamSize) {
    return {
      ok: false,
      message: `*${clan.name}* ya completo sus cupos (${teamSize}/${teamSize}).`,
    };
  }

  if (current) {
    const updatedNick = normalizeText(nick);
    if (updatedNick) {
      current.player.nick = updatedNick;
    }
    return { ok: true, existed: true, clan: current.clan, player: current.player };
  }

  const player = normalizePlayerEntry(
    {
      jid: targetJid,
      number: numberFromJid(targetJid),
      nick: normalizeText(nick) || `Jugador ${((clan.players || []).length || 0) + 1}`,
      joinedAt: nowIso(),
    },
    (clan.players || []).length
  );

  clan.players.push(player);
  return { ok: true, existed: false, clan, player };
}

function removePlayerFromClan(tournament, clanName, jid = "") {
  const targetJid = normalizeJid(jid);
  if (!targetJid) {
    return { ok: false, message: "No pude detectar tu numero para darte de baja." };
  }

  const current = findPlayerRegistration(tournament, targetJid);
  if (!current) {
    return { ok: false, message: "No estas inscrito en ningun clan de este torneo." };
  }

  if (normalizeText(clanName) && normalizeClanKey(clanName) !== normalizeClanKey(current.clan.name)) {
    return { ok: false, message: `Estas inscrito en *${current.clan.name}*, no en ese clan.` };
  }

  const before = current.clan.players.length;
  current.clan.players = current.clan.players.filter(
    (player) => normalizeJid(player.jid) !== targetJid
  );

  if (before === current.clan.players.length) {
    return { ok: false, message: "No pude quitar tu registro del clan." };
  }

  return { ok: true, clan: current.clan, player: current.player };
}

function clanIsReady(clan, teamSize) {
  return ((clan.players || []).length || 0) >= teamSize;
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

  const teamSize = tournament.formatRules?.teamSize || DEFAULT_FORMAT_RULES.teamSize;
  const missingA = Math.max(teamSize - (clanA.players || []).length, 0);
  const missingB = Math.max(teamSize - (clanB.players || []).length, 0);

  if (missingA > 0 || missingB > 0) {
    const lines = [];
    if (missingA > 0) lines.push(`- ${clanA.name}: faltan ${missingA} jugador(es).`);
    if (missingB > 0) lines.push(`- ${clanB.name}: faltan ${missingB} jugador(es).`);
    return {
      ok: false,
      message:
        `No puedo programar el VS todavia.\n` +
        `Formato actual: *${teamSize}v${teamSize}*\n` +
        `${lines.join("\n")}\n\n` +
        `Usa ffinscribir para completar equipos.`,
    };
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
    format: {
      teamSize,
      roundsBestOf: tournament.formatRules.roundsBestOf,
      roundsToWin: tournament.formatRules.roundsToWin,
      mapsBestOf: tournament.formatRules.mapsBestOf,
    },
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

  if (match.status === "jugado" && match.result) {
    return { ok: false, message: "Ese match ya tiene resultado cargado." };
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
      const formatText = match.format
        ? `Formato: ${match.format.teamSize}v${match.format.teamSize} | BO${match.format.mapsBestOf}`
        : "";

      if (match.status === "jugado" && match.result) {
        return `${match.id} | ${match.round}\n` +
          `${match.clanA} vs ${match.clanB}\n` +
          `${formatText}\n` +
          `Resultado: ${match.result.scoreA}-${match.result.scoreB} | Ganador: ${match.result.winner}`;
      }

      return `${match.id} | ${match.round}\n` +
        `${match.clanA} vs ${match.clanB}\n` +
        `${formatText}\n` +
        `Estado: pendiente`;
    })
    .join("\n\n");
}

function parsePipeArgs(args = []) {
  return String(Array.isArray(args) ? args.join(" ") : "")
    .split("|")
    .map((part) => normalizeText(part))
    .filter(Boolean);
}

function buildRulesSummary(rules = cloneDefaultFormatRules()) {
  return (
    `Modo: *Clash Squad*\n` +
    `VS: *${rules.teamSize}v${rules.teamSize}*\n` +
    `Rondas por mapa: *BO${rules.roundsBestOf}* (primero a ${rules.roundsToWin})\n` +
    `Serie de mapas: *BO${rules.mapsBestOf}*\n` +
    `Desempate de tabla: *kills*`
  );
}

function formatPlayerLine(player, idx) {
  const nick = normalizeText(player.nick) || `Jugador ${idx + 1}`;
  const number = normalizeText(player.number || numberFromJid(player.jid));
  return `${idx + 1}. ${nick} (${number ? `+${number}` : "sin numero"})`;
}

function formatClanRoster(clan, teamSize) {
  const players = Array.isArray(clan.players) ? clan.players : [];
  const readyText = clanIsReady(clan, teamSize) ? "listo" : "incompleto";
  const header = `*${clan.name}* (${players.length}/${teamSize}) - ${readyText}`;
  if (!players.length) {
    return `${header}\nSin jugadores inscritos.`;
  }

  return `${header}\n${players.map((player, idx) => formatPlayerLine(player, idx)).join("\n")}`;
}

function updateTournamentFormat(tournament, textInput) {
  const input = normalizeText(textInput).toLowerCase();
  if (!input) {
    return { ok: false, message: "Debes enviar el formato. Ej: ffformato 4v4 | bo3 | rbo7" };
  }

  const next = { ...(tournament.formatRules || cloneDefaultFormatRules()) };
  let changed = false;
  let recognized = 0;

  const teamPattern = input.match(/(\d+)\s*v\s*(\d+)/i);
  if (teamPattern) {
    const left = Number.parseInt(teamPattern[1], 10);
    const right = Number.parseInt(teamPattern[2], 10);
    if (!Number.isFinite(left) || !Number.isFinite(right) || left <= 0 || right <= 0) {
      return { ok: false, message: "Formato de equipos invalido. Usa por ejemplo 4v4 o 5v5." };
    }
    if (left !== right) {
      return { ok: false, message: "Solo soporta formato simetrico (ej: 4v4, 5v5)." };
    }
    if (left > 12) {
      return { ok: false, message: "Maximo permitido: 12v12." };
    }
    if (next.teamSize !== left) {
      next.teamSize = left;
      changed = true;
    }
    recognized += 1;
  }

  const teamAlt = input.match(/(?:team|equipo|jugadores?)\s*=?\s*(\d+)/i);
  if (teamAlt) {
    const teamSize = Number.parseInt(teamAlt[1], 10);
    if (!Number.isFinite(teamSize) || teamSize <= 0 || teamSize > 12) {
      return { ok: false, message: "Cantidad de jugadores invalida. Usa un valor entre 1 y 12." };
    }
    if (next.teamSize !== teamSize) {
      next.teamSize = teamSize;
      changed = true;
    }
    recognized += 1;
  }

  const roundsPattern = input.match(/(?:^|[\s|,])(?:rbo|rounds?bo|csbo)\s*(\d+)(?=$|[\s|,])/i);
  if (roundsPattern) {
    const parsed = parseBestOfValue(roundsPattern[1], "El BO de rondas");
    if (!parsed.ok) return parsed;
    if (next.roundsBestOf !== parsed.value) {
      next.roundsBestOf = parsed.value;
      next.roundsToWin = computeRoundsToWin(parsed.value);
      changed = true;
    }
    recognized += 1;
  }

  const mapSeriesPattern = input.match(/(?:^|[\s|,])bo\s*(\d+)\s*(?:maps?)?(?=$|[\s|,])/i);
  if (mapSeriesPattern) {
    const parsed = parseBestOfValue(mapSeriesPattern[1], "El BO de mapas");
    if (!parsed.ok) return parsed;
    if (next.mapsBestOf !== parsed.value) {
      next.mapsBestOf = parsed.value;
      changed = true;
    }
    recognized += 1;
  }

  if (!recognized) {
    return {
      ok: false,
      message:
        `No reconoci ese formato.\n` +
        `Ejemplos validos:\n` +
        `- ffformato 4v4\n` +
        `- ffformato 4v4 | bo3\n` +
        `- ffformato 4v4 | bo5 | rbo7`,
    };
  }

  if (!changed) {
    return { ok: true, changed: false, rules: next };
  }

  tournament.formatRules = next;
  return { ok: true, changed: true, rules: next };
}

function buildUsage(prefix = ".") {
  return (
    `*FREE FIRE TORNEOS*\n\n` +
    `Crear torneo (admin):\n` +
    `- ${prefix}ffcrear Nombre del torneo\n\n` +
    `Formato y reglas (admin):\n` +
    `- ${prefix}ffreglas\n` +
    `- ${prefix}ffformato 4v4 | bo3 | rbo7\n\n` +
    `Clanes (admin):\n` +
    `- ${prefix}ffclan add Nombre Clan\n` +
    `- ${prefix}ffclan del Nombre Clan\n` +
    `- ${prefix}ffclanes\n\n` +
    `Inscripciones (miembros):\n` +
    `- ${prefix}ffinscribir Clan Alpha | TuNick\n` +
    `- ${prefix}ffbaja\n` +
    `- ${prefix}ffinscritos\n` +
    `- ${prefix}ffinscritos Clan Alpha\n\n` +
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
    "ffformato",
    "ffreglas",
    "ffinscribir",
    "ffjoin",
    "ffbaja",
    "ffleave",
    "ffinscritos",
    "ffjugadores",
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

    const senderJid = normalizeJid(sender || msg?.key?.participant || "");
    const normalizedCommand = normalizeText(commandName).toLowerCase();
    const actionFromAliasMap = {
      ffcrear: "crear",
      ffclan: "clan",
      ffclanes: "clanes",
      ffformato: "formato",
      ffreglas: "reglas",
      ffinscribir: "inscribir",
      ffjoin: "inscribir",
      ffbaja: "baja",
      ffleave: "baja",
      ffinscritos: "inscritos",
      ffjugadores: "inscritos",
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
        createdBy: senderJid,
      });

      return sock.sendMessage(
        from,
        {
          text:
            `*TORNEO CREADO*\n\n` +
            `Nombre: *${tournament.name}*\n` +
            `ID: *${tournament.id}*\n` +
            `Estado: *${tournament.status}*\n\n` +
            `Formato base:\n` +
            `${buildRulesSummary(tournament.formatRules)}\n\n` +
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

    if (action === "reglas") {
      return sock.sendMessage(
        from,
        {
          text:
            `*REGLAS FREE FIRE*\n` +
            `Torneo: *${tournament.name}*\n\n` +
            `${buildRulesSummary(tournament.formatRules)}\n\n` +
            `Tip: ${prefix}ffformato 4v4 | bo3 | rbo7`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "formato") {
      if (!requireAdmin({ esAdmin, esOwner })) {
        return sock.sendMessage(from, { text: "Solo admin/owner puede cambiar formato.", ...global.channelInfo }, { quoted: msg });
      }

      const rawInput = normalizeText(payloadArgs.join(" "));
      if (!rawInput) {
        return sock.sendMessage(
          from,
          {
            text:
              `*FORMATO ACTUAL*\n\n` +
              `${buildRulesSummary(tournament.formatRules)}\n\n` +
              `Ejemplos:\n` +
              `- ${prefix}ffformato 4v4\n` +
              `- ${prefix}ffformato 4v4 | bo3\n` +
              `- ${prefix}ffformato 4v4 | bo5 | rbo7`,
            ...global.channelInfo,
          },
          { quoted: msg }
        );
      }

      const formatResult = updateTournamentFormat(tournament, rawInput);
      if (!formatResult.ok) {
        return sock.sendMessage(from, { text: formatResult.message, ...global.channelInfo }, { quoted: msg });
      }

      if (formatResult.changed) {
        store.scheduleSave();
      }

      return sock.sendMessage(
        from,
        {
          text:
            formatResult.changed
              ? `*FORMATO ACTUALIZADO*\n\n${buildRulesSummary(formatResult.rules)}`
              : `No hubo cambios. Formato actual:\n\n${buildRulesSummary(formatResult.rules)}`,
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
      const teamSize = tournament.formatRules?.teamSize || DEFAULT_FORMAT_RULES.teamSize;
      const list = tournament.clans.length
        ? tournament.clans
          .map((clan, i) => {
            const players = (clan.players || []).length;
            const ready = clanIsReady(clan, teamSize) ? "listo" : "incompleto";
            return `${i + 1}. ${clan.name} (${players}/${teamSize}) - ${ready}`;
          })
          .join("\n")
        : "No hay clanes registrados.";
      return sock.sendMessage(
        from,
        {
          text:
            `*CLANES REGISTRADOS*\n` +
            `Torneo: *${tournament.name}*\n` +
            `Formato: *${teamSize}v${teamSize}*\n\n` +
            `${list}`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "inscribir") {
      const [clanName = "", nick = ""] = parsePipeArgs(payloadArgs);
      if (!clanName) {
        return sock.sendMessage(
          from,
          {
            text:
              `Uso:\n` +
              `- ${prefix}ffinscribir Clan Alpha\n` +
              `- ${prefix}ffinscribir Clan Alpha | TuNick`,
            ...global.channelInfo,
          },
          { quoted: msg }
        );
      }

      const result = addPlayerToClan(tournament, clanName, { jid: senderJid, nick });
      if (!result.ok) {
        return sock.sendMessage(from, { text: result.message, ...global.channelInfo }, { quoted: msg });
      }

      store.scheduleSave();
      const players = (result.clan.players || []).length;
      const teamSize = tournament.formatRules?.teamSize || DEFAULT_FORMAT_RULES.teamSize;
      return sock.sendMessage(
        from,
        {
          text:
            result.existed
              ? `Actualice tu registro en *${result.clan.name}*.\n` +
                `Nick: *${result.player.nick}*\n` +
                `Cupos: *${players}/${teamSize}*`
              : `Inscripcion completada en *${result.clan.name}*.\n` +
                `Jugador: *${result.player.nick}*\n` +
                `Cupos: *${players}/${teamSize}*`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "baja") {
      const [clanName = ""] = parsePipeArgs(payloadArgs);
      const result = removePlayerFromClan(tournament, clanName, senderJid);
      if (!result.ok) {
        return sock.sendMessage(from, { text: result.message, ...global.channelInfo }, { quoted: msg });
      }

      store.scheduleSave();
      return sock.sendMessage(
        from,
        {
          text: `Te quite del clan *${result.clan.name}* correctamente.`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "inscritos") {
      const clanName = normalizeText(payloadArgs.join(" "));
      const teamSize = tournament.formatRules?.teamSize || DEFAULT_FORMAT_RULES.teamSize;

      if (clanName) {
        const clan = findClan(tournament, clanName);
        if (!clan) {
          return sock.sendMessage(
            from,
            { text: "No encontre ese clan. Usa ffclanes para revisar el nombre.", ...global.channelInfo },
            { quoted: msg }
          );
        }

        return sock.sendMessage(
          from,
          {
            text:
              `*INSCRITOS FREE FIRE*\n` +
              `Torneo: *${tournament.name}*\n\n` +
              `${formatClanRoster(clan, teamSize)}`,
            ...global.channelInfo,
          },
          { quoted: msg }
        );
      }

      if (!tournament.clans.length) {
        return sock.sendMessage(
          from,
          { text: "No hay clanes registrados todavia.", ...global.channelInfo },
          { quoted: msg }
        );
      }

      const blocks = tournament.clans.map((clan) => formatClanRoster(clan, teamSize)).join("\n\n");
      return sock.sendMessage(
        from,
        {
          text:
            `*INSCRITOS FREE FIRE*\n` +
            `Torneo: *${tournament.name}*\n` +
            `Formato: *${teamSize}v${teamSize}*\n\n` +
            `${blocks}`,
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
            `${result.match.clanA} vs ${result.match.clanB}\n` +
            `Formato: *${result.match.format.teamSize}v${result.match.format.teamSize} | BO${result.match.format.mapsBestOf}*\n\n` +
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
        senderJid
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
      const teamSize = tournament.formatRules?.teamSize || DEFAULT_FORMAT_RULES.teamSize;
      const played = tournament.matches.filter((match) => match.status === "jugado").length;
      const readyClans = tournament.clans.filter((clan) => clanIsReady(clan, teamSize)).length;
      return sock.sendMessage(
        from,
        {
          text:
            `*ESTADO TORNEO*\n\n` +
            `Nombre: *${tournament.name}*\n` +
            `ID: *${tournament.id}*\n` +
            `Estado: *${tournament.status}*\n` +
            `Clanes: *${tournament.clans.length}* (listos: ${readyClans})\n` +
            `Partidos: *${tournament.matches.length}*\n` +
            `Jugados: *${played}*\n\n` +
            `${buildRulesSummary(tournament.formatRules)}`,
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
