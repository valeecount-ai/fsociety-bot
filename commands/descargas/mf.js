// mf.js (ESM) - Comando .mf / .mediafire
// npm i axios
import fs from "fs";
import path from "path";
import axios from "axios";

const VIP_FILE = path.join(process.cwd(), "settings", "vip.json");

// ================== VIP HELPERS ==================
function ensureVipFile() {
  const dir = path.dirname(VIP_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(VIP_FILE)) fs.writeFileSync(VIP_FILE, JSON.stringify({ users: {} }, null, 2));
}

function readVip() {
  ensureVipFile();
  try {
    const raw = fs.readFileSync(VIP_FILE, "utf-8");
    const data = JSON.parse(raw);
    if (!data.users || typeof data.users !== "object") data.users = {};
    return data;
  } catch {
    return { users: {} };
  }
}

function saveVip(data) {
  ensureVipFile();
  fs.writeFileSync(VIP_FILE, JSON.stringify(data, null, 2));
}

function normId(x) {
  // Para números y LID: deja solo dígitos
  return String(x || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/[^\d]/g, "")
    .trim();
}

function getSenderJid(msg, from) {
  return msg?.key?.participant || msg?.participant || msg?.key?.remoteJid || from;
}

function getSenderId(msg, from) {
  return normId(getSenderJid(msg, from));
}

function getOwnersIds(settings) {
  const ids = [];

  // ownerNumbers
  if (Array.isArray(settings?.ownerNumbers)) ids.push(...settings.ownerNumbers);
  if (typeof settings?.ownerNumber === "string") ids.push(settings.ownerNumber);

  // ownerLids (para @lid)
  if (Array.isArray(settings?.ownerLids)) ids.push(...settings.ownerLids);
  if (typeof settings?.ownerLid === "string") ids.push(settings.ownerLid);

  // opcional
  if (typeof settings?.botNumber === "string") ids.push(settings.botNumber);

  return ids.map(normId).filter(Boolean);
}

function esOwner(msg, from, settings) {
  const senderId = getSenderId(msg, from);
  const owners = getOwnersIds(settings);
  return owners.includes(senderId);
}

// limpia expirados o sin usos
function limpiar(data) {
  const now = Date.now();
  for (const [num, info] of Object.entries(data.users || {})) {
    if (!info) delete data.users[num];
    else if (typeof info.expiresAt === "number" && now >= info.expiresAt) delete data.users[num];
    else if (typeof info.usesLeft === "number" && info.usesLeft <= 0) delete data.users[num];
  }
}

function fmtMs(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function vipValido(senderId, data) {
  limpiar(data);
  const info = data.users?.[senderId];
  if (!info) return null;

  const now = Date.now();
  const expLeft = typeof info.expiresAt === "number" ? info.expiresAt - now : Infinity;
  const usesLeft = typeof info.usesLeft === "number" ? info.usesLeft : Infinity;

  if (expLeft <= 0) return null;
  if (usesLeft <= 0) return null;

  return { info, expLeft, usesLeft };
}

// ================== API CONFIG ==================
const APIKEY = "dvyer";
const API_URL = "https://api-adonix.ultraplus.click/download/mediafire";

// ================== COMMAND ==================
export default {
  name: "mediafire",
  command: ["mf", "mediafire"],
  category: "downloader",
  description: "Convierte MediaFire a link directo usando API (owner/VIP)",

  run: async ({ sock, msg, from, args = [], settings }) => {
    try {
      if (!sock || !from) return;

      const senderId = getSenderId(msg, from);
      const owner = esOwner(msg, from, settings);

      // 🔐 Permisos: owner o VIP
      const vipData = readVip();
      limpiar(vipData);
      saveVip(vipData);

      const vip = owner ? null : vipValido(senderId, vipData);

      if (!owner && !vip) {
        return sock.sendMessage(
          from,
          { text: "⛔ Solo *OWNER* o usuarios *VIP* pueden usar este comando." },
          { quoted: msg }
        );
      }

      const url = String(args[0] || "").trim();
      if (!url || !url.includes("mediafire.com")) {
        return sock.sendMessage(
          from,
          { text: `📌 Uso: *${settings?.prefix || "."}mf* <link_mediafire>` },
          { quoted: msg }
        );
      }

      // ✅ Llamada a tu API (GET /download/mediafire?apikey=...&url=...)
      const { data: res } = await axios.get(API_URL, {
        params: { apikey: APIKEY, url },
        timeout: 30000,
      });

      if (!res?.status || !res?.result?.link) {
        return sock.sendMessage(
          from,
          { text: `❌ La API no devolvió link válido.${res?.error ? `\n🧩 Error: ${res.error}` : ""}` },
          { quoted: msg }
        );
      }

      // ✅ Consumir 1 uso si es VIP (no owner)
      if (!owner) {
        const info = vipData.users[senderId];
        if (info && typeof info.usesLeft === "number") {
          info.usesLeft = Math.max(0, info.usesLeft - 1);
          saveVip(vipData);
        }
      }

      const r = res.result;
      const now = Date.now();

      // Footer VIP
      let vipFooter = "";
      if (!owner) {
        const info = vipData.users[senderId];
        const left = typeof info?.usesLeft === "number" ? info.usesLeft : "∞";
        const exp = typeof info?.expiresAt === "number" ? fmtMs(info.expiresAt - now) : "∞";
        vipFooter = `\n\n🎟️ *VIP usos restantes:* ${left}\n⏳ *VIP vence en:* ${exp}`;
      }

      const out =
        `✅ *MediaFire listo*\n\n` +
        `📄 *Archivo:* ${r.filename || "N/A"}\n` +
        `📦 *Tamaño:* ${r.size || "N/A"}\n` +
        `🧾 *Tipo:* ${r.filetype || r.type || "N/A"}\n` +
        `📅 *Subido:* ${r.uploaded || "N/A"}\n\n` +
        `🔗 *Link directo:*\n${r.link}` +
        vipFooter;

      return sock.sendMessage(from, { text: out }, { quoted: msg });
    } catch (e) {
      console.error("[MF] Error:", e?.response?.data || e?.message || e);
      return sock.sendMessage(
        from,
        { text: `❌ Error API:\n${typeof (e?.response?.data) === "object" ? JSON.stringify(e.response.data) : (e?.message || "Error")}` },
        { quoted: msg }
      );
    }
  },
};
