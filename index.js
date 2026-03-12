// =========================
// DVYER BOT - INDEX (PAIRING STABLE)
// =========================

import * as baileys from "@whiskeysockets/baileys";
import pino from "pino";
import chalk from "chalk";
import readline from "readline";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const makeWASocket =
  (typeof baileys.makeWASocket === "function" && baileys.makeWASocket) ||
  (typeof baileys.default === "function" && baileys.default) ||
  (baileys.default &&
    typeof baileys.default.makeWASocket === "function" &&
    baileys.default.makeWASocket);

if (typeof makeWASocket !== "function") {
  throw new Error("makeWASocket no compatible con este hosting");
}

const {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  makeInMemoryStore,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = baileys;

// ================= CONFIG =================

const CARPETA_AUTH = "dvyer-session";
const logger = pino({ level: "silent" });
const FIXED_BROWSER = ["Windows", "Chrome", "114.0.5735.198"];

const settings = JSON.parse(
  fs.readFileSync("./settings/settings.json", "utf-8")
);

if (settings?.apiKey) {
  process.env.DVYER_API_KEY = String(settings.apiKey);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================= INFO CHANNEL =================

global.channelInfo = settings?.newsletter?.enabled
  ? {
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: settings.newsletter.jid,
          newsletterName: settings.newsletter.name,
          serverMessageId: -1,
        },
      },
    }
  : {};

// ================= TMP / STORE =================

const TMP_DIR = path.join(process.cwd(), "tmp");
const STORE_FILE = path.join(TMP_DIR, "baileys_store.json");

try {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
} catch {}

process.env.TMPDIR = TMP_DIR;
process.env.TMP = TMP_DIR;
process.env.TEMP = TMP_DIR;

// ================= VARIABLES =================

let sockGlobal = null;
let conectando = false;
let pairingRequested = false;
let reconnectTimer = null;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const preguntar = (q) => new Promise((r) => rl.question(q, r));
const comandos = new Map();
const groupCache = new Map();

let totalMensajes = 0;
let totalComandos = 0;

const mensajesPorTipo = {
  Grupo: 0,
  Privado: 0,
  Desconocido: 0,
};

const store =
  typeof makeInMemoryStore === "function"
    ? makeInMemoryStore({ logger })
    : null;

try {
  if (store?.readFromFile && fs.existsSync(STORE_FILE)) {
    store.readFromFile(STORE_FILE);
  }
} catch {}

if (store?.writeToFile) {
  setInterval(() => {
    try {
      store.writeToFile(STORE_FILE);
    } catch {}
  }, 10000).unref();
}

// ================= CONSOLA =================

global.consoleBuffer = [];
global.MAX_CONSOLE_LINES = 120;

function pushConsole(level, args) {
  const line =
    `[${new Date().toLocaleString()}] [${level}] ` +
    args
      .map((a) => {
        try {
          if (a instanceof Error) return a.stack;
          if (typeof a === "string") return a;
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(" ");

  global.consoleBuffer.push(line);

  if (global.consoleBuffer.length > global.MAX_CONSOLE_LINES) {
    global.consoleBuffer.shift();
  }
}

function shouldIgnoreError(value) {
  const txt = String(value || "");
  return (
    txt.includes("Bad MAC") ||
    txt.includes("SessionCipher") ||
    txt.includes("Failed to decrypt message with any known session") ||
    txt.includes("No session record") ||
    txt.includes("Closing open session in favor of incoming prekey bundle")
  );
}

const log = console.log;
const warn = console.warn;
const error = console.error;

console.log = (...a) => {
  pushConsole("LOG", a);
  log(chalk.cyan("[LOG]"), ...a);
};

console.warn = (...a) => {
  pushConsole("WARN", a);
  warn(chalk.yellow("[WARN]"), ...a);
};

console.error = (...a) => {
  if (shouldIgnoreError(a[0])) return;
  pushConsole("ERROR", a);
  error(chalk.red("[ERROR]"), ...a);
};

// ================= ANTI CRASH =================

process.on("unhandledRejection", (reason) => {
  if (shouldIgnoreError(reason)) return;
  console.error(reason);
});

process.on("uncaughtException", (err) => {
  if (shouldIgnoreError(err?.message || err)) return;
  console.error(err);
});

// ================= UTIL =================

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tipoChat(jid = "") {
  if (jid.endsWith("@g.us")) return "Grupo";
  if (jid.endsWith("@s.whatsapp.net")) return "Privado";
  return "Desconocido";
}

function shouldIgnoreJid(jid = "") {
  return (
    !jid ||
    jid === "status@broadcast" ||
    jid.endsWith("@broadcast") ||
    jid.endsWith("@newsletter")
  );
}

function normalizeMessageContent(message = {}) {
  let content = message;

  while (true) {
    if (content?.ephemeralMessage?.message) {
      content = content.ephemeralMessage.message;
      continue;
    }
    if (content?.viewOnceMessage?.message) {
      content = content.viewOnceMessage.message;
      continue;
    }
    if (content?.viewOnceMessageV2?.message) {
      content = content.viewOnceMessageV2.message;
      continue;
    }
    if (content?.viewOnceMessageV2Extension?.message) {
      content = content.viewOnceMessageV2Extension.message;
      continue;
    }
    break;
  }

  return content || {};
}

function obtenerTexto(message) {
  const msg = normalizeMessageContent(message);

  return (
    msg?.conversation ||
    msg?.extendedTextMessage?.text ||
    msg?.imageMessage?.caption ||
    msg?.videoMessage?.caption ||
    msg?.documentMessage?.caption ||
    msg?.buttonsResponseMessage?.selectedDisplayText ||
    msg?.buttonsResponseMessage?.selectedButtonId ||
    msg?.templateButtonReplyMessage?.selectedId ||
    msg?.listResponseMessage?.title ||
    msg?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ""
  );
}

function getContextInfo(message = {}) {
  const msg = normalizeMessageContent(message);
  const type = Object.keys(msg || {})[0];
  if (!type) return {};
  return msg?.[type]?.contextInfo || {};
}

function serializeMessage(raw) {
  const message = normalizeMessageContent(raw?.message || {});
  const text = String(obtenerTexto(message) || "").trim();
  const contextInfo = getContextInfo(raw?.message || {});
  const from = raw?.key?.remoteJid || "";
  const sender =
    raw?.key?.participant ||
    contextInfo?.participant ||
    raw?.key?.remoteJid ||
    "";

  let quoted = null;

  if (contextInfo?.quotedMessage) {
    const quotedText = obtenerTexto(contextInfo.quotedMessage);
    quoted = {
      key: {
        remoteJid: from,
        fromMe: false,
        id: contextInfo?.stanzaId || "",
        participant: contextInfo?.participant || sender,
      },
      message: contextInfo.quotedMessage,
      text: quotedText,
      body: quotedText,
    };
  }

  return {
    ...raw,
    message,
    text,
    body: text,
    from,
    sender,
    chat: from,
    isGroup: from.endsWith("@g.us"),
    quoted,
  };
}

function sanitizePhoneNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

async function getVersionSafe() {
  try {
    const data = await fetchLatestBaileysVersion();
    return data?.version;
  } catch {
    return undefined;
  }
}

async function cachedGroupMetadata(jid) {
  return groupCache.get(jid) || undefined;
}

function scheduleReconnect(ms = 2500) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    iniciarBot();
  }, ms);
}

// ================= BANNER =================

function banner() {
  console.clear();

  console.log(
    chalk.magentaBright(`
╔══════════════════════════════╗
║        DVYER BOT v2          ║
╚══════════════════════════════╝
`)
  );

  console.log(
    chalk.green("Owner :"),
    settings.ownerName,
    chalk.blue("\nPrefijo :"),
    settings.prefix,
    chalk.yellow("\nComandos cargados :"),
    comandos.size
  );

  console.log(chalk.gray("──────────────────────────────"));
}

// ================= CARGAR COMANDOS =================

async function cargarComandos() {
  const base = path.join(__dirname, "commands");

  async function leer(dir) {
    const archivos = fs.readdirSync(dir, { withFileTypes: true });

    for (const a of archivos) {
      const ruta = path.join(dir, a.name);

      if (a.isDirectory()) {
        await leer(ruta);
        continue;
      }

      if (!a.name.endsWith(".js")) continue;

      try {
        const mod = await import(pathToFileURL(ruta).href);
        const cmd = mod.default;

        if (!cmd || typeof cmd.run !== "function") continue;

        const nombres = [];

        if (cmd.name) nombres.push(cmd.name);

        if (cmd.command) {
          if (Array.isArray(cmd.command)) nombres.push(...cmd.command);
          else nombres.push(cmd.command);
        }

        for (const n of nombres) {
          comandos.set(String(n).toLowerCase(), cmd);
        }

        console.log("✓ Comando cargado:", nombres.join(", "));
      } catch (e) {
        console.error("Error cargando comando:", ruta, e);
      }
    }
  }

  await leer(base);
}

// ================= PAIRING =================

async function requestPairingCodeSafe(sock) {
  if (pairingRequested || sock.authState?.creds?.registered) return;

  pairingRequested = true;

  try {
    const configuredNumber =
      sanitizePhoneNumber(settings?.pairingNumber) ||
      sanitizePhoneNumber(settings?.ownerNumber) ||
      "";

    let numero = configuredNumber;

    if (!numero) {
      console.log("📲 Bot no vinculado");
      numero = sanitizePhoneNumber(
        await preguntar("Numero con codigo de pais, sin + ni espacios: ")
      );
    }

    if (!numero) {
      pairingRequested = false;
      console.log("Numero invalido");
      return;
    }

    console.log("Esperando 5 segundos para pedir el pairing code...");
    await delay(5000);

    const code = await sock.requestPairingCode(numero);

    console.log("\nCODIGO DE VINCULACION:\n");
    console.log(chalk.greenBright(code));
    console.log(
      chalk.yellow(
        "WhatsApp > Dispositivos vinculados > Vincular con numero de telefono"
      )
    );
    console.log(
      chalk.gray(
        "Si WhatsApp lo marca invalido, espera 30-40 minutos y vuelve a intentar solo una vez."
      )
    );
  } catch (e) {
    pairingRequested = false;
    console.error("Error solicitando pairing code:", e);
  }
}

// ================= BOT =================

async function iniciarBot() {
  if (conectando) return;
  conectando = true;

  try {
    banner();

    const { state, saveCreds } = await useMultiFileAuthState(CARPETA_AUTH);
    const version = await getVersionSafe();

    const sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      browser: FIXED_BROWSER,
      defaultQueryTimeoutMs: undefined,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      getMessage: async (key) => {
        try {
          if (!store?.loadMessage) return undefined;
          const msg = await store.loadMessage(key.remoteJid, key.id);
          return msg?.message || undefined;
        } catch {
          return undefined;
        }
      },
      cachedGroupMetadata,
    });

    sockGlobal = sock;

    if (store?.bind) {
      store.bind(sock.ev);
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("groups.update", async (updates) => {
      for (const update of updates || []) {
        try {
          if (!update?.id) continue;
          const meta = await sock.groupMetadata(update.id);
          groupCache.set(update.id, meta);
        } catch {}
      }
    });

    sock.ev.on("group-participants.update", async (update) => {
      try {
        if (!update?.id) return;
        const meta = await sock.groupMetadata(update.id);
        groupCache.set(update.id, meta);
      } catch {}
    });

    sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      try {
        if (qr && !sock.authState?.creds?.registered && !pairingRequested) {
          await requestPairingCodeSafe(sock);
        }

        if (connection === "connecting") {
          console.log("Conectando...");
        }

        if (connection === "open") {
          pairingRequested = false;
          console.log(chalk.green("✅ DVYER BOT CONECTADO"));
        }

        if (connection === "close") {
          const code =
            lastDisconnect?.error?.output?.statusCode ||
            lastDisconnect?.error?.data?.statusCode ||
            0;

          console.log("Conexion cerrada:", code);

          const loggedOut =
            code === 401 || code === DisconnectReason.loggedOut;

          if (loggedOut) {
            try {
              fs.rmSync(CARPETA_AUTH, { recursive: true, force: true });
            } catch {}
          }

          pairingRequested = false;
          scheduleReconnect(loggedOut ? 4000 : 2500);
        }
      } catch (e) {
        pairingRequested = false;
        console.error("Error en connection.update:", e);
      }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      for (const raw of messages || []) {
        try {
          if (!raw?.message) continue;
          if (raw?.key?.fromMe) continue;

          const from = raw?.key?.remoteJid || "";
          if (shouldIgnoreJid(from)) continue;

          const m = serializeMessage(raw);
          const texto = String(m?.text || "").trim();
          if (!texto) continue;

          totalMensajes++;

          const tipo = tipoChat(from);
          mensajesPorTipo[tipo] = (mensajesPorTipo[tipo] || 0) + 1;

          const prefijo = settings.prefix || ".";
          if (!texto.startsWith(prefijo)) continue;

          const body = texto.slice(prefijo.length).trim();
          if (!body) continue;

          const args = body.split(/\s+/);
          const comando = String(args.shift() || "").toLowerCase();

          const cmd = comandos.get(comando);
          if (!cmd) continue;

          totalComandos++;

          await cmd.run({
            sock,
            m,
            msg: m,
            from,
            chat: from,
            sender: m.sender,
            isGroup: m.isGroup,
            text: m.text,
            body: m.body,
            quoted: m.quoted,
            args,
            settings,
            comandos,
          });
        } catch (e) {
          console.error("Error comando:", e);
        }
      }
    });
  } catch (e) {
    console.error(e);
  } finally {
    conectando = false;
  }
}

async function start() {
  await cargarComandos();
  await iniciarBot();
}

start();

process.on("SIGINT", () => {
  try {
    rl.close();
  } catch {}

  try {
    if (sockGlobal?.end) {
      sockGlobal.end(undefined);
    }
  } catch {}

  console.log("Bot apagado");
  process.exit(0);
});
