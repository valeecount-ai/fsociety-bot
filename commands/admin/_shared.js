import path from "path";
import {
  ensureDir as ensureDirectory,
  readJson as readJsonFile,
  writeJsonAtomic,
} from "../../lib/json-store.js";

const DB_DIR = path.join(process.cwd(), "database");

export function ensureDir(dirPath) {
  ensureDirectory(dirPath);
}

export function ensureDatabaseDir() {
  ensureDir(DB_DIR);
  return DB_DIR;
}

export function safeParseJson(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
  } catch {
    return fallback;
  }
}

export function readJson(filePath, fallback) {
  return readJsonFile(filePath, fallback);
}

export function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  writeJsonAtomic(filePath, value);
}

export function getQuoted(msg) {
  return msg?.key ? { quoted: msg } : undefined;
}

export function normalizeJidUser(value = "") {
  const jid = String(value || "").trim();
  if (!jid) return "";
  const [user] = jid.split("@");
  return user.split(":")[0];
}

export function normalizeNumber(value = "") {
  return normalizeJidUser(value).replace(/[^\d]/g, "");
}

export function formatUserNumber(value = "") {
  const normalized = normalizeNumber(value);
  return normalized ? `+${normalized}` : "Desconocido";
}

export function extractTargetUser({ args = [], msg, sender = "", includeSenderFallback = false } = {}) {
  const rawArgs = Array.isArray(args) ? args : [];
  const firstToken = String(rawArgs[0] || "").trim();
  const argNumber = normalizeNumber(firstToken);

  if (argNumber) {
    return {
      jid: `${argNumber}@s.whatsapp.net`,
      number: argNumber,
      restArgs: rawArgs.slice(1),
    };
  }

  const quotedParticipant =
    msg?.quoted?.key?.participant ||
    msg?.quoted?.participant ||
    msg?.quoted?.key?.remoteJid ||
    "";
  const quotedNumber = normalizeNumber(quotedParticipant);

  if (quotedNumber) {
    return {
      jid: `${quotedNumber}@s.whatsapp.net`,
      number: quotedNumber,
      restArgs: rawArgs,
    };
  }

  const senderNumber = normalizeNumber(sender);
  if (includeSenderFallback && senderNumber) {
    return {
      jid: `${senderNumber}@s.whatsapp.net`,
      number: senderNumber,
      restArgs: rawArgs,
    };
  }

  return {
    jid: "",
    number: "",
    restArgs: rawArgs,
  };
}

export function getPrefix(settings) {
  if (Array.isArray(settings?.prefix)) {
    return settings.prefix.find((value) => String(value || "").trim()) || ".";
  }

  return String(settings?.prefix || ".").trim() || ".";
}
