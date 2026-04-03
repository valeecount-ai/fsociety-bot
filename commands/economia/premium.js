import path from "path";
import { createScheduledJsonStore } from "../../lib/json-store.js";
import {
  addCoins,
  addDownloadRequests,
  formatCoins,
  formatUserLabel,
  getEconomyProfile,
  getPrefix,
  spendCoins,
} from "./_shared.js";

const STORE_FILE = path.join(process.cwd(), "database", "economia-premium.json");
const store = createScheduledJsonStore(STORE_FILE, () => ({
  trackedSince: new Date().toISOString(),
  users: {},
}));

const ACTIVITY_STEP_COMMANDS = 20;
const PREMIUM_PASS_PRICE = 2500;

const WEEKLY_MISSIONS = Object.freeze([
  {
    id: "m1",
    title: "Actividad semanal",
    description: "Ejecuta 40 comandos esta semana.",
    metric: "commands",
    target: 40,
    reward: { coins: 300, xp: 140, passXp: 55 },
  },
  {
    id: "m2",
    title: "Ganancias semanales",
    description: "Acumula 2,000 dolares ganados esta semana.",
    metric: "earned",
    target: 2000,
    reward: { coins: 450, xp: 190, passXp: 65 },
  },
  {
    id: "m3",
    title: "Descargas activas",
    description: "Consume 8 solicitudes de descarga esta semana.",
    metric: "requests",
    target: 8,
    reward: { coins: 280, xp: 120, passXp: 45 },
  },
]);

const SEASON_MISSIONS = Object.freeze([
  {
    id: "t1",
    title: "Temporada: actividad",
    description: "Ejecuta 180 comandos en la temporada.",
    metric: "commands",
    target: 180,
    reward: { coins: 900, xp: 340, passXp: 160 },
  },
  {
    id: "t2",
    title: "Temporada: economia",
    description: "Acumula 8,000 dolares ganados en la temporada.",
    metric: "earned",
    target: 8000,
    reward: { coins: 1200, xp: 430, passXp: 200 },
  },
  {
    id: "t3",
    title: "Temporada: descargas",
    description: "Consume 35 solicitudes en la temporada.",
    metric: "requests",
    target: 35,
    reward: { coins: 700, xp: 260, passXp: 120 },
  },
]);

const ACHIEVEMENTS = Object.freeze([
  {
    id: "ach_cmd_500",
    title: "Comandante 500",
    description: "Llega a 500 comandos ejecutados.",
    metric: "commands",
    target: 500,
    reward: { coins: 900, xp: 280, passXp: 80 },
  },
  {
    id: "ach_earn_15000",
    title: "Magnate",
    description: "Llega a 15,000 dolares ganados totales.",
    metric: "earned",
    target: 15000,
    reward: { coins: 1200, xp: 340, passXp: 95 },
  },
  {
    id: "ach_req_100",
    title: "Descargador elite",
    description: "Usa 100 solicitudes de descarga.",
    metric: "requests",
    target: 100,
    reward: { coins: 800, xp: 220, passXp: 70 },
  },
  {
    id: "ach_bank_5000",
    title: "Banco fuerte",
    description: "Alcanza 5,000 dolares en banco.",
    metric: "bank",
    target: 5000,
    reward: { coins: 1000, xp: 300, passXp: 85 },
  },
]);

const PASS_TIERS = Object.freeze([
  {
    tier: 1,
    requiredXp: 120,
    freeReward: { coins: 180 },
    premiumReward: { requests: 4 },
  },
  {
    tier: 2,
    requiredXp: 280,
    freeReward: { xp: 90 },
    premiumReward: { coins: 260 },
  },
  {
    tier: 3,
    requiredXp: 460,
    freeReward: { requests: 3 },
    premiumReward: { coins: 320, xp: 110 },
  },
  {
    tier: 4,
    requiredXp: 680,
    freeReward: { coins: 260 },
    premiumReward: { requests: 7 },
  },
  {
    tier: 5,
    requiredXp: 930,
    freeReward: { item: "badge_season_5" },
    premiumReward: { coins: 540, xp: 180 },
  },
  {
    tier: 6,
    requiredXp: 1220,
    freeReward: { coins: 300, xp: 120 },
    premiumReward: { requests: 10, item: "crate_premium" },
  },
]);

const PREMIUM_SHOP = Object.freeze([
  {
    id: "xp_boost_250",
    name: "Boost XP 250",
    description: "Sube tu progreso premium rapidamente.",
    levelRequired: 1,
    price: 500,
    grant: { xp: 250 },
  },
  {
    id: "req_premium_10",
    name: "Pack premium 10 requests",
    description: "Recibe 10 solicitudes extra de descarga.",
    levelRequired: 2,
    price: 700,
    grant: { requests: 10 },
  },
  {
    id: "skin_neon",
    name: "Skin Neon",
    description: "Item cosmetico premium para inventario.",
    levelRequired: 3,
    price: 1400,
    grant: { item: "skin_neon" },
  },
  {
    id: "tag_diamante",
    name: "Tag Diamante",
    description: "Tag premium de alto nivel.",
    levelRequired: 5,
    price: 2600,
    grant: { item: "tag_diamante" },
  },
  {
    id: "caja_elite",
    name: "Caja Elite",
    description: "Caja de coleccion nivel alto.",
    levelRequired: 7,
    price: 3900,
    grant: { item: "caja_elite" },
  },
]);

function normalizeText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function dayKey(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function weekStartKey(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function monthKey(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function xpRequiredForLevel(level = 1) {
  const safe = Math.max(1, Math.floor(Number(level || 1)));
  return 220 + (safe - 1) * 90;
}

function metricValue(profile, metric) {
  const safeProfile = profile || {};
  if (metric === "commands") return Number(safeProfile.commandCount || 0);
  if (metric === "earned") return Number(safeProfile.totalEarned || 0);
  if (metric === "requests") return Number(safeProfile?.requests?.totalConsumed || 0);
  if (metric === "bank") return Number(safeProfile.bank || 0);
  return 0;
}

function ensureSeason(user, profile) {
  const nowSeason = monthKey();
  const commands = metricValue(profile, "commands");
  const earned = metricValue(profile, "earned");
  const requests = metricValue(profile, "requests");

  if (!user.season || typeof user.season !== "object" || Array.isArray(user.season)) {
    user.season = {};
  }

  if (normalizeText(user.season.key) !== nowSeason) {
    user.season = {
      key: nowSeason,
      baselineCommands: commands,
      baselineEarned: earned,
      baselineRequests: requests,
      claimedMissions: {},
      pass: {
        owned: false,
        xp: 0,
        claimedFree: {},
        claimedPremium: {},
      },
    };
    return;
  }

  user.season.baselineCommands = Number(user.season.baselineCommands || 0);
  user.season.baselineEarned = Number(user.season.baselineEarned || 0);
  user.season.baselineRequests = Number(user.season.baselineRequests || 0);
  if (
    !user.season.claimedMissions ||
    typeof user.season.claimedMissions !== "object" ||
    Array.isArray(user.season.claimedMissions)
  ) {
    user.season.claimedMissions = {};
  }
  if (!user.season.pass || typeof user.season.pass !== "object" || Array.isArray(user.season.pass)) {
    user.season.pass = {};
  }
  user.season.pass.owned = user.season.pass.owned === true;
  user.season.pass.xp = Math.max(0, Math.floor(Number(user.season.pass.xp || 0)));
  if (
    !user.season.pass.claimedFree ||
    typeof user.season.pass.claimedFree !== "object" ||
    Array.isArray(user.season.pass.claimedFree)
  ) {
    user.season.pass.claimedFree = {};
  }
  if (
    !user.season.pass.claimedPremium ||
    typeof user.season.pass.claimedPremium !== "object" ||
    Array.isArray(user.season.pass.claimedPremium)
  ) {
    user.season.pass.claimedPremium = {};
  }
}

function ensureStreak(user) {
  if (!user.streak || typeof user.streak !== "object" || Array.isArray(user.streak)) {
    user.streak = {};
  }
  user.streak.count = Math.max(0, Math.floor(Number(user.streak.count || 0)));
  user.streak.best = Math.max(user.streak.count, Math.floor(Number(user.streak.best || 0)));
  user.streak.lastClaimDay = normalizeText(user.streak.lastClaimDay);
}

function ensureGroupScore(user) {
  if (!user.groupScore || typeof user.groupScore !== "object" || Array.isArray(user.groupScore)) {
    user.groupScore = {};
  }
}

function addGroupScore(user, chatId = "", amount = 0) {
  const groupId = normalizeText(chatId);
  if (!groupId.endsWith("@g.us")) return;
  ensureGroupScore(user);
  const value = Math.max(0, Math.floor(Number(amount || 0)));
  if (!value) return;
  user.groupScore[groupId] = Number(user.groupScore[groupId] || 0) + value;
}

function seasonMetricProgress(user, profile, metric) {
  if (!user?.season) return 0;
  if (metric === "commands") {
    return Math.max(0, metricValue(profile, "commands") - Number(user.season.baselineCommands || 0));
  }
  if (metric === "earned") {
    return Math.max(0, metricValue(profile, "earned") - Number(user.season.baselineEarned || 0));
  }
  if (metric === "requests") {
    return Math.max(0, metricValue(profile, "requests") - Number(user.season.baselineRequests || 0));
  }
  return 0;
}

function weeklyMetricProgress(user, profile, metric) {
  if (!user?.weekly) return 0;
  if (metric === "commands") {
    return Math.max(0, metricValue(profile, "commands") - Number(user.weekly.baselineCommands || 0));
  }
  if (metric === "earned") {
    return Math.max(0, metricValue(profile, "earned") - Number(user.weekly.baselineEarned || 0));
  }
  if (metric === "requests") {
    return Math.max(0, metricValue(profile, "requests") - Number(user.weekly.baselineRequests || 0));
  }
  return 0;
}

function getOrCreateUserState(userId, economyProfile) {
  const users = store.state.users || (store.state.users = {});
  const key = normalizeText(userId);
  const nowWeek = weekStartKey();
  const profile = economyProfile || {};

  if (!users[key]) {
    users[key] = {
      id: key,
      level: 1,
      xpInLevel: 0,
      totalXpEarned: 0,
      inventory: {},
      achievementsClaimed: {},
      weekly: {
        key: nowWeek,
        baselineCommands: metricValue(profile, "commands"),
        baselineEarned: metricValue(profile, "earned"),
        baselineRequests: metricValue(profile, "requests"),
        claimedMissions: {},
      },
      activity: {
        step: ACTIVITY_STEP_COMMANDS,
        nextCommandMilestone: metricValue(profile, "commands") + ACTIVITY_STEP_COMMANDS,
        lastClaimAt: 0,
      },
      season: {},
      streak: {},
      groupScore: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  const user = users[key];
  user.level = Math.max(1, Math.floor(Number(user.level || 1)));
  user.xpInLevel = Math.max(0, Math.floor(Number(user.xpInLevel || 0)));
  user.totalXpEarned = Math.max(0, Math.floor(Number(user.totalXpEarned || 0)));
  if (!user.inventory || typeof user.inventory !== "object" || Array.isArray(user.inventory)) {
    user.inventory = {};
  }
  if (
    !user.achievementsClaimed ||
    typeof user.achievementsClaimed !== "object" ||
    Array.isArray(user.achievementsClaimed)
  ) {
    user.achievementsClaimed = {};
  }
  if (!user.weekly || typeof user.weekly !== "object" || Array.isArray(user.weekly)) {
    user.weekly = {
      key: nowWeek,
      baselineCommands: metricValue(profile, "commands"),
      baselineEarned: metricValue(profile, "earned"),
      baselineRequests: metricValue(profile, "requests"),
      claimedMissions: {},
    };
  }
  if (
    !user.weekly.claimedMissions ||
    typeof user.weekly.claimedMissions !== "object" ||
    Array.isArray(user.weekly.claimedMissions)
  ) {
    user.weekly.claimedMissions = {};
  }
  if (!user.activity || typeof user.activity !== "object" || Array.isArray(user.activity)) {
    user.activity = {};
  }
  user.activity.step = ACTIVITY_STEP_COMMANDS;
  const currentCommands = metricValue(profile, "commands");
  if (!Number.isFinite(Number(user.activity.nextCommandMilestone)) || Number(user.activity.nextCommandMilestone) <= 0) {
    user.activity.nextCommandMilestone = currentCommands + ACTIVITY_STEP_COMMANDS;
  }
  user.activity.lastClaimAt = Number(user.activity.lastClaimAt || 0);

  if (normalizeText(user.weekly.key) !== nowWeek) {
    user.weekly.key = nowWeek;
    user.weekly.baselineCommands = currentCommands;
    user.weekly.baselineEarned = metricValue(profile, "earned");
    user.weekly.baselineRequests = metricValue(profile, "requests");
    user.weekly.claimedMissions = {};
  }

  ensureSeason(user, profile);
  ensureStreak(user);
  ensureGroupScore(user);
  user.updatedAt = new Date().toISOString();
  return user;
}

function grantXp(user, amount = 0) {
  const normalized = Math.max(0, Math.floor(Number(amount || 0)));
  if (!normalized) return { amount: 0, levelUps: 0, level: user.level };

  let remaining = normalized;
  let levelUps = 0;
  user.totalXpEarned += normalized;

  while (remaining > 0) {
    const required = xpRequiredForLevel(user.level);
    const missing = Math.max(1, required - user.xpInLevel);
    if (remaining >= missing) {
      user.xpInLevel = 0;
      user.level += 1;
      levelUps += 1;
      remaining -= missing;
      continue;
    }
    user.xpInLevel += remaining;
    remaining = 0;
  }

  return { amount: normalized, levelUps, level: user.level };
}

function grantSeasonPassXp(user, amount = 0) {
  const value = Math.max(0, Math.floor(Number(amount || 0)));
  if (!value) return 0;
  ensureSeason(user, {});
  user.season.pass.xp = Number(user.season.pass.xp || 0) + value;
  return value;
}

function resolveShopItem(itemId = "") {
  const key = normalizeText(itemId).toLowerCase();
  return PREMIUM_SHOP.find((item) => item.id === key) || null;
}

function rewardParts(reward = {}) {
  const lines = [];
  if (Number(reward.coins || 0) > 0) lines.push(`${formatCoins(reward.coins)}`);
  if (Number(reward.xp || 0) > 0) lines.push(`${reward.xp} XP`);
  if (Number(reward.requests || 0) > 0) lines.push(`${reward.requests} requests`);
  if (normalizeText(reward.item)) lines.push(`item ${normalizeText(reward.item).toLowerCase()}`);
  if (Number(reward.passXp || 0) > 0) lines.push(`${reward.passXp} Pass XP`);
  return lines;
}

function applyRewardPackage({ sender, settings, user, reward, reason, meta = {}, chatId = "" }) {
  const grants = {
    coins: 0,
    xp: 0,
    levelUps: 0,
    level: user.level,
    requests: 0,
    items: [],
    passXp: 0,
  };

  const coins = Math.max(0, Math.floor(Number(reward?.coins || 0)));
  if (coins > 0) {
    addCoins(sender, coins, reason, meta);
    grants.coins += coins;
  }

  const xp = Math.max(0, Math.floor(Number(reward?.xp || 0)));
  if (xp > 0) {
    const xpResult = grantXp(user, xp);
    grants.xp += xpResult.amount;
    grants.levelUps += xpResult.levelUps;
    grants.level = xpResult.level;
  }

  const requests = Math.max(0, Math.floor(Number(reward?.requests || 0)));
  if (requests > 0) {
    addDownloadRequests(
      sender,
      requests,
      `${reason}_requests`,
      { ...meta, countAsPurchased: false },
      settings
    );
    grants.requests += requests;
  }

  const item = normalizeText(reward?.item).toLowerCase();
  if (item) {
    user.inventory[item] = Number(user.inventory[item] || 0) + 1;
    grants.items.push(item);
  }

  const passXp = Math.max(0, Math.floor(Number(reward?.passXp || 0)));
  if (passXp > 0) {
    grants.passXp = grantSeasonPassXp(user, passXp);
  }

  const scoreValue = Math.floor(grants.coins / 60) + Math.floor(grants.xp / 15) + Math.floor(grants.passXp / 12);
  addGroupScore(user, chatId, Math.max(0, scoreValue));
  return grants;
}

function grantsToLine(grants = {}) {
  const parts = [];
  if (grants.coins > 0) parts.push(formatCoins(grants.coins));
  if (grants.xp > 0) parts.push(`${grants.xp} XP`);
  if (grants.requests > 0) parts.push(`${grants.requests} requests`);
  if (grants.passXp > 0) parts.push(`${grants.passXp} Pass XP`);
  if (Array.isArray(grants.items) && grants.items.length) {
    parts.push(grants.items.map((item) => `item ${item}`).join(", "));
  }
  return parts.length ? parts.join(" | ") : "Sin recompensas";
}

function buildWeeklyMissionRows(user, profile) {
  return WEEKLY_MISSIONS.map((mission) => {
    const progress = weeklyMetricProgress(user, profile, mission.metric);
    return {
      ...mission,
      progress,
      done: progress >= mission.target,
      claimed: user.weekly.claimedMissions?.[mission.id] === true,
    };
  });
}

function buildSeasonMissionRows(user, profile) {
  return SEASON_MISSIONS.map((mission) => {
    const progress = seasonMetricProgress(user, profile, mission.metric);
    return {
      ...mission,
      progress,
      done: progress >= mission.target,
      claimed: user.season.claimedMissions?.[mission.id] === true,
    };
  });
}

function buildAchievementRows(user, profile) {
  return ACHIEVEMENTS.map((achievement) => {
    const progress = metricValue(profile, achievement.metric);
    return {
      ...achievement,
      progress,
      done: progress >= achievement.target,
      claimed: user.achievementsClaimed?.[achievement.id] === true,
    };
  });
}

function buildPassRows(user) {
  const passXp = Number(user?.season?.pass?.xp || 0);
  return PASS_TIERS.map((tier) => ({
    ...tier,
    unlocked: passXp >= tier.requiredXp,
    freeClaimed: user?.season?.pass?.claimedFree?.[`p${tier.tier}`] === true,
    premiumClaimed: user?.season?.pass?.claimedPremium?.[`pp${tier.tier}`] === true,
  }));
}

function profileSummary(user, profile) {
  const commands = metricValue(profile, "commands");
  const earned = metricValue(profile, "earned");
  const requests = metricValue(profile, "requests");
  const bank = metricValue(profile, "bank");
  const nextXp = xpRequiredForLevel(user.level);
  const progressPercent = Math.max(0, Math.min(100, Math.floor((Number(user.xpInLevel || 0) / nextXp) * 100)));
  const inventoryList = Object.entries(user.inventory || {})
    .filter(([, count]) => Number(count || 0) > 0)
    .map(([itemId, count]) => `- ${itemId}: ${count}`);
  const passXp = Number(user?.season?.pass?.xp || 0);

  return (
    `*ECONOMIA PREMIUM PRO*\n\n` +
    `Usuario: *${formatUserLabel(profile?.id || user.id)}*\n` +
    `Nivel premium: *${user.level}*\n` +
    `XP: *${user.xpInLevel}/${nextXp}* (${progressPercent}%)\n` +
    `XP total: *${user.totalXpEarned}*\n` +
    `Temporada: *${user.season.key}*\n` +
    `Pass: *${user.season.pass.owned ? "Premium activo" : "Solo free"}*\n` +
    `Pass XP: *${passXp}*\n` +
    `Racha diaria: *${user.streak.count}* (best ${user.streak.best})\n` +
    `Comandos usados: *${commands}*\n` +
    `Ganado total: *${formatCoins(earned)}*\n` +
    `Solicitudes usadas: *${requests}*\n` +
    `Banco actual: *${formatCoins(bank)}*\n` +
    `Hito actividad: *${user.activity.nextCommandMilestone} comandos*\n\n` +
    `Inventario premium:\n${inventoryList.length ? inventoryList.join("\n") : "- Vacio"}`
  );
}

function claimWeeklyMission({ sender, settings, user, profile, missionId, chatId }) {
  const mission = WEEKLY_MISSIONS.find((item) => item.id === normalizeText(missionId).toLowerCase());
  if (!mission) return { ok: false, message: "No encontre esa mision semanal." };
  if (user.weekly.claimedMissions?.[mission.id]) {
    return { ok: false, message: "Esa mision ya fue cobrada esta semana." };
  }
  const progress = weeklyMetricProgress(user, profile, mission.metric);
  if (progress < mission.target) {
    return { ok: false, message: `Aun no completas la mision.\nProgreso: *${progress}/${mission.target}*` };
  }
  user.weekly.claimedMissions[mission.id] = true;
  const grants = applyRewardPackage({
    sender,
    settings,
    user,
    reward: mission.reward,
    reason: "premium_weekly_mission",
    meta: { missionId: mission.id, week: user.weekly.key },
    chatId,
  });
  store.scheduleSave();
  return { ok: true, mission, grants };
}

function claimSeasonMission({ sender, settings, user, profile, missionId, chatId }) {
  const mission = SEASON_MISSIONS.find((item) => item.id === normalizeText(missionId).toLowerCase());
  if (!mission) return { ok: false, message: "No encontre esa mision de temporada." };
  if (user.season.claimedMissions?.[mission.id]) {
    return { ok: false, message: "Esa mision de temporada ya fue cobrada." };
  }
  const progress = seasonMetricProgress(user, profile, mission.metric);
  if (progress < mission.target) {
    return { ok: false, message: `Aun no completas la mision de temporada.\nProgreso: *${progress}/${mission.target}*` };
  }
  user.season.claimedMissions[mission.id] = true;
  const grants = applyRewardPackage({
    sender,
    settings,
    user,
    reward: mission.reward,
    reason: "premium_season_mission",
    meta: { missionId: mission.id, season: user.season.key },
    chatId,
  });
  store.scheduleSave();
  return { ok: true, mission, grants };
}

function claimAchievement({ sender, settings, user, profile, achievementId, chatId }) {
  const achievement = ACHIEVEMENTS.find((item) => item.id === normalizeText(achievementId).toLowerCase());
  if (!achievement) return { ok: false, message: "No encontre ese logro." };
  if (user.achievementsClaimed?.[achievement.id]) {
    return { ok: false, message: "Ese logro ya fue cobrado." };
  }
  const progress = metricValue(profile, achievement.metric);
  if (progress < achievement.target) {
    return { ok: false, message: `Ese logro aun no esta listo.\nProgreso: *${progress}/${achievement.target}*` };
  }
  user.achievementsClaimed[achievement.id] = true;
  const grants = applyRewardPackage({
    sender,
    settings,
    user,
    reward: achievement.reward,
    reason: "premium_achievement",
    meta: { achievementId: achievement.id },
    chatId,
  });
  store.scheduleSave();
  return { ok: true, achievement, grants };
}

function claimActivityReward({ sender, settings, user, profile, chatId }) {
  const commands = metricValue(profile, "commands");
  const nextMilestone = Number(user.activity.nextCommandMilestone || ACTIVITY_STEP_COMMANDS);
  if (commands < nextMilestone) {
    return {
      ok: false,
      message: `Aun no puedes cobrar actividad.\nTe faltan *${nextMilestone - commands}* comandos.`,
    };
  }

  const reward = {
    coins: 160 + user.level * 22,
    xp: 95 + Math.floor(user.level * 6),
    passXp: 60,
  };
  const grants = applyRewardPackage({
    sender,
    settings,
    user,
    reward,
    reason: "premium_activity_reward",
    meta: { milestone: nextMilestone },
    chatId,
  });
  user.activity.lastClaimAt = Date.now();
  user.activity.nextCommandMilestone = nextMilestone + ACTIVITY_STEP_COMMANDS;
  store.scheduleSave();

  return { ok: true, grants, nextMilestone: user.activity.nextCommandMilestone };
}

function claimStreakReward({ sender, settings, user, chatId }) {
  const today = dayKey();
  const yesterday = dayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));

  if (normalizeText(user.streak.lastClaimDay) === today) {
    return { ok: false, message: "Ya reclamaste tu recompensa de racha hoy." };
  }

  if (normalizeText(user.streak.lastClaimDay) === yesterday) {
    user.streak.count += 1;
  } else {
    user.streak.count = 1;
  }
  user.streak.best = Math.max(user.streak.best, user.streak.count);
  user.streak.lastClaimDay = today;

  const reward = {
    coins: Math.min(900, 120 + user.streak.count * 35),
    xp: Math.min(380, 45 + user.streak.count * 12),
    passXp: Math.min(150, 20 + user.streak.count * 3),
  };

  const grants = applyRewardPackage({
    sender,
    settings,
    user,
    reward,
    reason: "premium_streak_reward",
    meta: { streak: user.streak.count, day: today },
    chatId,
  });
  store.scheduleSave();
  return { ok: true, grants, streak: user.streak.count, best: user.streak.best };
}

function buyPremiumPass({ sender, user }) {
  if (user.season.pass.owned) {
    return { ok: false, message: "Ya tienes el pase premium activo en esta temporada." };
  }
  const spend = spendCoins(sender, PREMIUM_PASS_PRICE, "premium_pass_buy", {
    season: user.season.key,
  });
  if (!spend.ok) {
    return {
      ok: false,
      message: `Saldo insuficiente. Te faltan *${formatCoins(spend.missing || 0)}*.`,
    };
  }
  user.season.pass.owned = true;
  store.scheduleSave();
  return { ok: true };
}

function claimPassTierReward({ sender, settings, user, tierNumber, premiumTrack = false, chatId }) {
  const tier = PASS_TIERS.find((item) => item.tier === Number(tierNumber));
  if (!tier) return { ok: false, message: "No existe ese tier del pase." };

  const passXp = Number(user.season.pass.xp || 0);
  if (passXp < tier.requiredXp) {
    return { ok: false, message: `Ese tier aun no esta desbloqueado.\nFalta Pass XP: *${tier.requiredXp - passXp}*` };
  }

  const claimKey = premiumTrack ? `pp${tier.tier}` : `p${tier.tier}`;
  const claimedBucket = premiumTrack ? user.season.pass.claimedPremium : user.season.pass.claimedFree;
  if (claimedBucket?.[claimKey]) {
    return { ok: false, message: "Ese premio del pase ya fue reclamado." };
  }

  if (premiumTrack && !user.season.pass.owned) {
    return { ok: false, message: "Necesitas comprar el pase premium para reclamar esa linea." };
  }

  const reward = premiumTrack ? tier.premiumReward : tier.freeReward;
  const grants = applyRewardPackage({
    sender,
    settings,
    user,
    reward,
    reason: premiumTrack ? "premium_pass_claim_premium" : "premium_pass_claim_free",
    meta: { season: user.season.key, tier: tier.tier, track: premiumTrack ? "premium" : "free" },
    chatId,
  });
  claimedBucket[claimKey] = true;
  store.scheduleSave();
  return { ok: true, tier, premiumTrack, grants };
}

function buyPremiumItem({ sender, settings, user, itemId }) {
  const item = resolveShopItem(itemId);
  if (!item) {
    return { ok: false, message: "No existe ese item premium." };
  }
  if (user.level < item.levelRequired) {
    return { ok: false, message: `Necesitas nivel premium *${item.levelRequired}* para comprar *${item.id}*.` };
  }
  const spend = spendCoins(sender, item.price, "premium_shop_buy", { itemId: item.id });
  if (!spend.ok) {
    return { ok: false, message: `Saldo insuficiente. Te faltan *${formatCoins(spend.missing || 0)}*.` };
  }

  const grants = applyRewardPackage({
    sender,
    settings,
    user,
    reward: item.grant || {},
    reason: "premium_shop_buy_reward",
    meta: { itemId: item.id },
  });
  store.scheduleSave();
  return { ok: true, item, grants };
}

function buildGlobalLeaderboard(limit = 10) {
  const users = Object.values(store.state.users || {}).map((user) => ({
    id: normalizeText(user.id),
    level: Number(user.level || 1),
    totalXpEarned: Number(user.totalXpEarned || 0),
    streak: Number(user?.streak?.count || 0),
    bestStreak: Number(user?.streak?.best || 0),
    passXp: Number(user?.season?.pass?.xp || 0),
  }));

  return users
    .sort((a, b) => {
      if (b.level !== a.level) return b.level - a.level;
      if (b.totalXpEarned !== a.totalXpEarned) return b.totalXpEarned - a.totalXpEarned;
      if (b.bestStreak !== a.bestStreak) return b.bestStreak - a.bestStreak;
      return b.passXp - a.passXp;
    })
    .slice(0, Math.max(1, Math.min(30, Number(limit || 10))));
}

function buildGroupLeaderboard(groupId, limit = 10) {
  const key = normalizeText(groupId);
  const users = Object.values(store.state.users || {})
    .map((user) => ({
      id: normalizeText(user.id),
      groupScore: Number(user?.groupScore?.[key] || 0),
      level: Number(user.level || 1),
      totalXpEarned: Number(user.totalXpEarned || 0),
      streak: Number(user?.streak?.count || 0),
    }))
    .filter((row) => row.groupScore > 0);

  return users
    .sort((a, b) => {
      if (b.groupScore !== a.groupScore) return b.groupScore - a.groupScore;
      if (b.level !== a.level) return b.level - a.level;
      return b.totalXpEarned - a.totalXpEarned;
    })
    .slice(0, Math.max(1, Math.min(30, Number(limit || 10))));
}

function formatLeaderboardRows(rows = [], kind = "global") {
  if (!rows.length) return "Sin datos todavia.";
  return rows
    .map((row, index) => {
      const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;
      if (kind === "grupo") {
        return `${medal} ${formatUserLabel(row.id)} | score ${row.groupScore} | lvl ${row.level}`;
      }
      return `${medal} ${formatUserLabel(row.id)} | lvl ${row.level} | XP ${row.totalXpEarned} | racha ${row.bestStreak}`;
    })
    .join("\n");
}

function formatMissionRow(row) {
  const status = row.claimed ? "COBRADA ✅" : row.done ? "LISTA 🟢" : "PENDIENTE 🟡";
  return (
    `*${row.id.toUpperCase()}* - ${status}\n` +
    `${row.title}\n` +
    `${row.description}\n` +
    `Progreso: *${row.progress}/${row.target}*\n` +
    `Premio: *${rewardParts(row.reward).join(" | ")}*`
  );
}

function formatAchievementRow(row) {
  const status = row.claimed ? "COBRADO ✅" : row.done ? "LISTO 🟢" : "BLOQUEADO ⚪";
  return (
    `*${row.id}* - ${status}\n` +
    `${row.title}\n` +
    `${row.description}\n` +
    `Progreso: *${row.progress}/${row.target}*\n` +
    `Premio: *${rewardParts(row.reward).join(" | ")}*`
  );
}

function formatPassRow(row) {
  const status = row.unlocked ? "DESBLOQUEADO ✅" : "BLOQUEADO 🔒";
  const free = row.freeClaimed ? "FREE: COBRADO" : "FREE: DISPONIBLE";
  const premium = row.premiumClaimed ? "PREMIUM: COBRADO" : "PREMIUM: DISPONIBLE";
  return (
    `*Tier ${row.tier}* - ${status}\n` +
    `Requiere: *${row.requiredXp} Pass XP*\n` +
    `${free} (${rewardParts(row.freeReward).join(" | ")})\n` +
    `${premium} (${rewardParts(row.premiumReward).join(" | ")})`
  );
}

function formatShopRow(item) {
  return (
    `*${item.id}* (Nivel ${item.levelRequired}+)\n` +
    `${item.name}\n` +
    `${item.description}\n` +
    `Precio: *${formatCoins(item.price)}*`
  );
}

async function sendPremiumPanel({ sock, from, msg, settings, profile, user }) {
  const prefix = getPrefix(settings);
  const weeklyRows = buildWeeklyMissionRows(user, profile);
  const seasonRows = buildSeasonMissionRows(user, profile);
  const achievementRows = buildAchievementRows(user, profile);
  const readyWeekly = weeklyRows.filter((row) => row.done && !row.claimed).length;
  const readySeason = seasonRows.filter((row) => row.done && !row.claimed).length;
  const readyAchievements = achievementRows.filter((row) => row.done && !row.claimed).length;

  const panelText =
    `${profileSummary(user, profile)}\n\n` +
    `Misiones semanales listas: *${readyWeekly}*\n` +
    `Misiones temporada listas: *${readySeason}*\n` +
    `Logros listos: *${readyAchievements}*`;

  const messagePayload = {
    text: panelText,
    title: "FSOCIETY BOT",
    subtitle: "Economia Premium PRO",
    footer: "Temporadas, pase, racha y ranking",
    interactiveButtons: [
      {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "Abrir panel premium",
          sections: [
            {
              title: "Progreso",
              rows: [
                {
                  header: "PERFIL",
                  title: "Ver perfil premium",
                  description: "Nivel, XP, pass y racha.",
                  id: `${prefix}premium perfil`,
                },
                {
                  header: "TEMPORADA",
                  title: "Ver temporada mensual",
                  description: `Temporada ${user.season.key}`,
                  id: `${prefix}premium temporada`,
                },
                {
                  header: "PASE",
                  title: "Ver pase premium",
                  description: "Tiers, pass XP y recompensas.",
                  id: `${prefix}premium pase`,
                },
                {
                  header: "RACHA",
                  title: "Ver estado de racha",
                  description: "Recompensa diaria acumulable.",
                  id: `${prefix}premium racha`,
                },
              ],
            },
            {
              title: "Reclamar",
              rows: [
                { header: "SEMANAL", title: "Reclamar m1", description: "Actividad semanal", id: `${prefix}premium reclamar m1` },
                { header: "SEMANAL", title: "Reclamar m2", description: "Economia semanal", id: `${prefix}premium reclamar m2` },
                { header: "SEMANAL", title: "Reclamar m3", description: "Descargas semanales", id: `${prefix}premium reclamar m3` },
                { header: "TEMPORADA", title: "Reclamar t1", description: "Actividad de temporada", id: `${prefix}premium reclamar t1` },
                { header: "RACHA", title: "Reclamar racha diaria", description: "Se reinicia si fallas un dia", id: `${prefix}premium reclamar racha` },
                { header: "ACTIVIDAD", title: "Reclamar actividad", description: "Premio por uso de comandos", id: `${prefix}premium reclamar actividad` },
              ],
            },
            {
              title: "Pase y rankings",
              rows: [
                {
                  header: "PASE",
                  title: "Comprar pase premium",
                  description: `${formatCoins(PREMIUM_PASS_PRICE)} por temporada`,
                  id: `${prefix}premium pase comprar`,
                },
                {
                  header: "PASE",
                  title: "Reclamar pase tier 1 free",
                  description: "Linea free del tier 1",
                  id: `${prefix}premium reclamar pase 1`,
                },
                {
                  header: "PASE",
                  title: "Reclamar pase tier 1 premium",
                  description: "Linea premium del tier 1",
                  id: `${prefix}premium reclamar pasepremium 1`,
                },
                {
                  header: "RANKING",
                  title: "Top premium global",
                  description: "Ranking general de usuarios",
                  id: `${prefix}premium top global`,
                },
                {
                  header: "RANKING",
                  title: "Top premium del grupo",
                  description: "Ranking por este grupo",
                  id: `${prefix}premium top grupo`,
                },
              ],
            },
          ],
        }),
      },
    ],
    ...global.channelInfo,
  };

  try {
    return await sock.sendMessage(from, messagePayload, { quoted: msg });
  } catch {
    return sock.sendMessage(
      from,
      {
        text:
          `${panelText}\n\n` +
          `Atajos:\n` +
          `- ${prefix}premium temporada\n` +
          `- ${prefix}premium pase\n` +
          `- ${prefix}premium pase comprar\n` +
          `- ${prefix}premium reclamar racha\n` +
          `- ${prefix}premium top global\n` +
          `- ${prefix}premium top grupo`,
        ...global.channelInfo,
      },
      { quoted: msg }
    );
  }
}

export default {
  name: "premium",
  command: [
    "premium",
    "economiapremium",
    "misiones",
    "misionessemanales",
    "temporada",
    "season",
    "pase",
    "pasepremium",
    "pass",
    "logros",
    "logrospremium",
    "actividadpremium",
    "reclamaractividad",
    "racha",
    "streak",
    "tiendapremium",
    "comprarpremium",
    "nivelpremium",
    "toppremium",
    "rankpremium",
    "rankingpremium",
  ],
  category: "economia",
  description: "Temporadas mensuales, pase premium, racha diaria y leaderboard.",

  run: async ({ sock, msg, from, sender, args = [], settings = {}, commandName = "" }) => {
    const command = normalizeText(commandName).toLowerCase();
    const profile = getEconomyProfile(sender, settings);
    const user = getOrCreateUserState(sender, profile);
    const prefix = getPrefix(settings);
    store.scheduleSave();

    const aliasActionMap = {
      misiones: "misiones",
      misionessemanales: "misiones",
      logros: "logros",
      logrospremium: "logros",
      actividadpremium: "actividad",
      reclamaractividad: "reclamar_actividad",
      temporada: "temporada",
      season: "temporada",
      pase: "pase",
      pasepremium: "pase",
      pass: "pase",
      racha: "racha",
      streak: "racha",
      tiendapremium: "tienda",
      comprarpremium: "comprar",
      nivelpremium: "perfil",
      toppremium: "top",
      rankpremium: "top",
      rankingpremium: "top",
      economiapremium: "panel",
      premium: "",
    };

    let action = aliasActionMap[command] || normalizeText(args[0]).toLowerCase();
    let payload = aliasActionMap[command] ? args : args.slice(1);

    if (!action || ["panel", "menu", "help", "inicio"].includes(action)) {
      return sendPremiumPanel({ sock, from, msg, settings, profile, user });
    }

    if (action === "perfil" || action === "estado") {
      return sock.sendMessage(
        from,
        { text: profileSummary(user, profile), ...global.channelInfo },
        { quoted: msg }
      );
    }

    if (action === "misiones") {
      const weeklyRows = buildWeeklyMissionRows(user, profile);
      return sock.sendMessage(
        from,
        {
          text:
            `*MISIONES SEMANALES* (${user.weekly.key})\n\n` +
            `${weeklyRows.map((row) => formatMissionRow(row)).join("\n\n")}\n\n` +
            `Reclama con: *${prefix}premium reclamar m1|m2|m3*`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "temporada") {
      const seasonRows = buildSeasonMissionRows(user, profile);
      const passRows = buildPassRows(user).slice(0, 4);
      return sock.sendMessage(
        from,
        {
          text:
            `*TEMPORADA MENSUAL* (${user.season.key})\n` +
            `Pass activo: *${user.season.pass.owned ? "SI" : "NO"}*\n` +
            `Pass XP: *${user.season.pass.xp}*\n\n` +
            `Misiones temporada:\n\n` +
            `${seasonRows.map((row) => formatMissionRow(row)).join("\n\n")}\n\n` +
            `Primeros tiers del pase:\n\n` +
            `${passRows.map((row) => formatPassRow(row)).join("\n\n")}\n\n` +
            `Atajos:\n` +
            `- ${prefix}premium pase comprar\n` +
            `- ${prefix}premium reclamar t1|t2|t3\n` +
            `- ${prefix}premium reclamar pase 1`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "pase") {
      const passRows = buildPassRows(user);
      const subAction = normalizeText(payload[0]).toLowerCase();
      if (subAction === "comprar" || subAction === "buy") {
        const result = buyPremiumPass({ sender, user });
        if (!result.ok) {
          return sock.sendMessage(from, { text: result.message, ...global.channelInfo }, { quoted: msg });
        }
        return sock.sendMessage(
          from,
          {
            text:
              `*PASE PREMIUM ACTIVADO*\n\n` +
              `Temporada: *${user.season.key}*\n` +
              `Ahora puedes reclamar linea premium del pase.`,
            ...global.channelInfo,
          },
          { quoted: msg }
        );
      }

      return sock.sendMessage(
        from,
        {
          text:
            `*PASE DE TEMPORADA* (${user.season.key})\n\n` +
            `Estado: *${user.season.pass.owned ? "Premium activo ✅" : "Solo free ⚪"}*\n` +
            `Pass XP: *${user.season.pass.xp}*\n\n` +
            `${passRows.map((row) => formatPassRow(row)).join("\n\n")}\n\n` +
            `Comprar pase: *${prefix}premium pase comprar* (${formatCoins(PREMIUM_PASS_PRICE)})\n` +
            `Reclamar free: *${prefix}premium reclamar pase 2*\n` +
            `Reclamar premium: *${prefix}premium reclamar pasepremium 2*`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "racha") {
      const today = dayKey();
      const alreadyClaimedToday = normalizeText(user.streak.lastClaimDay) === today;
      return sock.sendMessage(
        from,
        {
          text:
            `*RACHA DIARIA PREMIUM*\n\n` +
            `Racha actual: *${user.streak.count}*\n` +
            `Mejor racha: *${user.streak.best}*\n` +
            `Ultimo reclamo: *${user.streak.lastClaimDay || "Nunca"}*\n` +
            `Estado hoy: *${alreadyClaimedToday ? "YA COBRADO ✅" : "DISPONIBLE 🟢"}*\n\n` +
            `Reclama con: *${prefix}premium reclamar racha*`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "logros") {
      const rows = buildAchievementRows(user, profile);
      return sock.sendMessage(
        from,
        {
          text:
            `*LOGROS PREMIUM*\n\n` +
            `${rows.map((row) => formatAchievementRow(row)).join("\n\n")}\n\n` +
            `Reclama con: *${prefix}premium reclamar ach_id*`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "actividad") {
      const commands = metricValue(profile, "commands");
      const nextMilestone = Number(user.activity.nextCommandMilestone || ACTIVITY_STEP_COMMANDS);
      const ready = commands >= nextMilestone;
      return sock.sendMessage(
        from,
        {
          text:
            `*RECOMPENSA POR ACTIVIDAD*\n\n` +
            `Comandos actuales: *${commands}*\n` +
            `Siguiente hito: *${nextMilestone}*\n` +
            `Estado: *${ready ? "LISTO PARA COBRAR ✅" : "EN PROGRESO 🟡"}*\n\n` +
            `Reclama con: *${prefix}premium reclamar actividad*`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "tienda" || action === "shop") {
      return sock.sendMessage(
        from,
        {
          text:
            `*TIENDA PREMIUM POR NIVELES*\n\n` +
            `${PREMIUM_SHOP.map((item) => formatShopRow(item)).join("\n\n")}\n\n` +
            `Tu nivel actual: *${user.level}*\n` +
            `Compra con: *${prefix}premium comprar id_item*`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "comprar") {
      const itemId = normalizeText(payload[0]);
      if (!itemId) {
        return sock.sendMessage(
          from,
          { text: `Usa: *${prefix}premium comprar id_item*`, ...global.channelInfo },
          { quoted: msg }
        );
      }

      const result = buyPremiumItem({ sender, settings, user, itemId });
      if (!result.ok) {
        return sock.sendMessage(from, { text: result.message, ...global.channelInfo }, { quoted: msg });
      }

      return sock.sendMessage(
        from,
        {
          text:
            `*COMPRA PREMIUM EXITOSA*\n\n` +
            `Item: *${result.item.name}* (${result.item.id})\n` +
            `Costo: *${formatCoins(result.item.price)}*\n` +
            `Recompensas: ${grantsToLine(result.grants)}\n` +
            `Nivel actual: *${user.level}*`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "top" || action === "leaderboard" || action === "ranking") {
      const mode = normalizeText(payload[0] || "global").toLowerCase();
      if (mode === "grupo" || mode === "group") {
        if (!String(from || "").endsWith("@g.us")) {
          return sock.sendMessage(
            from,
            { text: "El ranking de grupo solo funciona dentro de un grupo.", ...global.channelInfo },
            { quoted: msg }
          );
        }
        const rows = buildGroupLeaderboard(from, 10);
        return sock.sendMessage(
          from,
          {
            text:
              `*TOP PREMIUM DEL GRUPO*\n\n` +
              `${formatLeaderboardRows(rows, "grupo")}\n\n` +
              `Tip: gana score reclamando recompensas premium en el grupo.`,
            ...global.channelInfo,
          },
          { quoted: msg }
        );
      }

      const rows = buildGlobalLeaderboard(10);
      return sock.sendMessage(
        from,
        {
          text:
            `*TOP PREMIUM GLOBAL*\n\n` +
            `${formatLeaderboardRows(rows, "global")}`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "reclamar_actividad") {
      const result = claimActivityReward({ sender, settings, user, profile, chatId: from });
      if (!result.ok) {
        return sock.sendMessage(from, { text: result.message, ...global.channelInfo }, { quoted: msg });
      }
      return sock.sendMessage(
        from,
        {
          text:
            `*ACTIVIDAD COBRADA*\n\n` +
            `Ganaste: *${grantsToLine(result.grants)}*\n` +
            `Siguiente hito: *${result.nextMilestone} comandos*`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (action === "reclamar") {
      const target = normalizeText(payload[0]).toLowerCase();
      const extra = normalizeText(payload[1]).toLowerCase();

      if (!target) {
        return sock.sendMessage(
          from,
          {
            text:
              `Usa:\n` +
              `*${prefix}premium reclamar m1*\n` +
              `*${prefix}premium reclamar t1*\n` +
              `*${prefix}premium reclamar racha*\n` +
              `*${prefix}premium reclamar actividad*\n` +
              `*${prefix}premium reclamar ach_cmd_500*\n` +
              `*${prefix}premium reclamar pase 1*\n` +
              `*${prefix}premium reclamar pasepremium 1*`,
            ...global.channelInfo,
          },
          { quoted: msg }
        );
      }

      if (target === "actividad") {
        const result = claimActivityReward({ sender, settings, user, profile, chatId: from });
        if (!result.ok) {
          return sock.sendMessage(from, { text: result.message, ...global.channelInfo }, { quoted: msg });
        }
        return sock.sendMessage(
          from,
          {
            text:
              `*ACTIVIDAD COBRADA*\n\n` +
              `Ganaste: *${grantsToLine(result.grants)}*\n` +
              `Siguiente hito: *${result.nextMilestone} comandos*`,
            ...global.channelInfo,
          },
          { quoted: msg }
        );
      }

      if (target === "racha" || target === "streak") {
        const result = claimStreakReward({ sender, settings, user, chatId: from });
        if (!result.ok) {
          return sock.sendMessage(from, { text: result.message, ...global.channelInfo }, { quoted: msg });
        }
        return sock.sendMessage(
          from,
          {
            text:
              `*RACHA COBRADA*\n\n` +
              `Racha actual: *${result.streak}*\n` +
              `Mejor racha: *${result.best}*\n` +
              `Ganaste: *${grantsToLine(result.grants)}*`,
            ...global.channelInfo,
          },
          { quoted: msg }
        );
      }

      if (target.startsWith("m")) {
        const result = claimWeeklyMission({
          sender,
          settings,
          user,
          profile,
          missionId: target,
          chatId: from,
        });
        if (!result.ok) {
          return sock.sendMessage(from, { text: result.message, ...global.channelInfo }, { quoted: msg });
        }
        return sock.sendMessage(
          from,
          {
            text:
              `*MISION SEMANAL COBRADA*\n\n` +
              `${result.mission.title}\n` +
              `Ganaste: *${grantsToLine(result.grants)}*`,
            ...global.channelInfo,
          },
          { quoted: msg }
        );
      }

      if (target.startsWith("t")) {
        const result = claimSeasonMission({
          sender,
          settings,
          user,
          profile,
          missionId: target,
          chatId: from,
        });
        if (!result.ok) {
          return sock.sendMessage(from, { text: result.message, ...global.channelInfo }, { quoted: msg });
        }
        return sock.sendMessage(
          from,
          {
            text:
              `*MISION DE TEMPORADA COBRADA*\n\n` +
              `${result.mission.title}\n` +
              `Ganaste: *${grantsToLine(result.grants)}*`,
            ...global.channelInfo,
          },
          { quoted: msg }
        );
      }

      if (target.startsWith("ach_")) {
        const result = claimAchievement({
          sender,
          settings,
          user,
          profile,
          achievementId: target,
          chatId: from,
        });
        if (!result.ok) {
          return sock.sendMessage(from, { text: result.message, ...global.channelInfo }, { quoted: msg });
        }
        return sock.sendMessage(
          from,
          {
            text:
              `*LOGRO COBRADO*\n\n` +
              `${result.achievement.title}\n` +
              `Ganaste: *${grantsToLine(result.grants)}*`,
            ...global.channelInfo,
          },
          { quoted: msg }
        );
      }

      if (target === "pase" || target === "pass" || target === "pasepremium") {
        const tier = Number.parseInt(String(payload[1] || ""), 10);
        const premiumTrack = target === "pasepremium" || extra === "premium";
        if (!Number.isFinite(tier) || tier <= 0) {
          return sock.sendMessage(
            from,
            {
              text:
                `Usa:\n` +
                `*${prefix}premium reclamar pase 1*\n` +
                `*${prefix}premium reclamar pasepremium 1*`,
              ...global.channelInfo,
            },
            { quoted: msg }
          );
        }
        const result = claimPassTierReward({
          sender,
          settings,
          user,
          tierNumber: tier,
          premiumTrack,
          chatId: from,
        });
        if (!result.ok) {
          return sock.sendMessage(from, { text: result.message, ...global.channelInfo }, { quoted: msg });
        }
        return sock.sendMessage(
          from,
          {
            text:
              `*TIER DEL PASE COBRADO*\n\n` +
              `Tier: *${result.tier.tier}*\n` +
              `Linea: *${result.premiumTrack ? "PREMIUM" : "FREE"}*\n` +
              `Ganaste: *${grantsToLine(result.grants)}*`,
            ...global.channelInfo,
          },
          { quoted: msg }
        );
      }

      if (/^p\d+$/.test(target) || /^pp\d+$/.test(target)) {
        const premiumTrack = target.startsWith("pp");
        const tier = Number.parseInt(target.replace(/[^\d]/g, ""), 10);
        const result = claimPassTierReward({
          sender,
          settings,
          user,
          tierNumber: tier,
          premiumTrack,
          chatId: from,
        });
        if (!result.ok) {
          return sock.sendMessage(from, { text: result.message, ...global.channelInfo }, { quoted: msg });
        }
        return sock.sendMessage(
          from,
          {
            text:
              `*TIER DEL PASE COBRADO*\n\n` +
              `Tier: *${result.tier.tier}*\n` +
              `Linea: *${result.premiumTrack ? "PREMIUM" : "FREE"}*\n` +
              `Ganaste: *${grantsToLine(result.grants)}*`,
            ...global.channelInfo,
          },
          { quoted: msg }
        );
      }

      return sock.sendMessage(
        from,
        {
          text: "No reconoci ese objetivo de reclamo.",
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    return sock.sendMessage(
      from,
      {
        text:
          `Accion no valida.\n` +
          `Usa *${prefix}premium* para abrir el panel premium.`,
        ...global.channelInfo,
      },
      { quoted: msg }
    );
  },
};
