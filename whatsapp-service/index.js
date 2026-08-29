import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import { Boom } from "@hapi/boom";
import pino from "pino";
import QRCode from "qrcode";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";

const PORT = Number(process.env.PORT || process.env.WHATSAPP_SERVICE_PORT || 3001);
const DATA_DIR = process.env.DATA_DIR || ".";
const SESSION_PATH = path.join(DATA_DIR, "whatsapp-session");
const SERVICE_TOKEN = process.env.WHATSAPP_SERVICE_TOKEN || "";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_MESSAGE_CHARS = 4096;
const logger = pino({ level: process.env.LOG_LEVEL || "info" });

if (SERVICE_TOKEN.length < 32) {
  console.error(
    "WHATSAPP_SERVICE_TOKEN é obrigatório e deve ter pelo menos 32 caracteres.",
  );
  process.exit(1);
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "8mb" }));

let socket = null;
let connectionState = "starting";
let latestQrDataUrl = null;
let latestQrAt = null;
let pairingCode = null;
let pairingCodeAt = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let startingConnection = false;

const rateBuckets = new Map();
const idempotency = new Map();

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authenticate(req, res, next) {
  const bearer = String(req.headers.authorization || "");
  const token = bearer.startsWith("Bearer ")
    ? bearer.slice(7)
    : String(req.headers["x-service-token"] || "");
  if (!safeEqual(token, SERVICE_TOKEN)) {
    return res.status(401).json({ ok: false, error: "Não autorizado." });
  }
  return next();
}

function rateLimit(req, res, next) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { start: now, count: 0 };
  if (now - bucket.start >= 60_000) {
    bucket.start = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (bucket.count > 60) {
    return res.status(429).json({ ok: false, error: "Muitas tentativas. Aguarde um minuto." });
  }
  return next();
}

function cleanPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectAttempt += 1;
  const delay = Math.min(30_000, 1_000 * 2 ** Math.min(reconnectAttempt, 5));
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startConnection().catch((error) => {
      logger.error({ error }, "Falha ao reconectar");
      scheduleReconnect();
    });
  }, delay);
}

async function startConnection() {
  if (startingConnection || connectionState === "connected") return;
  startingConnection = true;
  connectionState = "connecting";
  try {
    await fs.mkdir(SESSION_PATH, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
    const { version } = await fetchLatestBaileysVersion();
    const currentSocket = makeWASocket({
      version,
      auth: state,
      logger,
      browser: Browsers.ubuntu("Chrome"),
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    socket = currentSocket;
    currentSocket.ev.on("creds.update", saveCreds);
    currentSocket.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          latestQrDataUrl = await QRCode.toDataURL(qr, {
            width: 420,
            margin: 2,
            errorCorrectionLevel: "M",
          });
          latestQrAt = new Date().toISOString();
          connectionState = "waiting_for_scan";
        } catch (error) {
          logger.error({ error }, "Falha ao gerar imagem do QR Code");
        }
      }

      if (connection === "open") {
        reconnectAttempt = 0;
        connectionState = "connected";
        latestQrDataUrl = null;
        latestQrAt = null;
        pairingCode = null;
        pairingCodeAt = null;
        logger.info("WhatsApp conectado");
      }

      if (connection === "close") {
        const code =
          lastDisconnect?.error instanceof Boom
            ? lastDisconnect.error.output.statusCode
            : null;
        const loggedOut = code === DisconnectReason.loggedOut;
        socket = null;
        latestQrDataUrl = null;
        latestQrAt = null;
        connectionState = loggedOut ? "logged_out" : "disconnected";
        logger.warn({ code, loggedOut }, "Conexão WhatsApp encerrada");
        if (!loggedOut) scheduleReconnect();
      }
    });
  } finally {
    startingConnection = false;
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, state: connectionState });
});

app.use(authenticate);

app.get("/status", (_req, res) => {
  res.json({
    ok: true,
    state: connectionState,
    connected: connectionState === "connected",
    qrAvailable: Boolean(latestQrDataUrl),
    qrUpdatedAt: latestQrAt,
    pairingCodeAvailable: Boolean(pairingCode),
  });
});

app.get("/qr", (_req, res) => {
  if (connectionState === "connected") {
    return res.status(409).json({ ok: false, error: "O WhatsApp já está conectado." });
  }
  if (!latestQrDataUrl) {
    return res.status(425).json({
      ok: false,
      error: "O QR Code ainda está sendo preparado. Atualize em alguns segundos.",
    });
  }
  return res.json({ ok: true, dataUrl: latestQrDataUrl, updatedAt: latestQrAt });
});

app.post("/pairing-code", rateLimit, async (req, res) => {
  if (connectionState === "connected") {
    return res.status(409).json({ ok: false, error: "O WhatsApp já está conectado." });
  }
  const phone = cleanPhone(req.body?.phone);
  if (phone.length < 12 || phone.length > 15) {
    return res.status(400).json({
      ok: false,
      error: "Informe o telefone com DDI e DDD, por exemplo 5541999998888.",
    });
  }
  if (!socket) {
    await startConnection();
  }
  if (!socket) {
    return res.status(503).json({ ok: false, error: "Conexão ainda iniciando." });
  }
  try {
    const rawCode = await socket.requestPairingCode(phone);
    pairingCode = rawCode.match(/.{1,4}/g)?.join("-") || rawCode;
    pairingCodeAt = new Date().toISOString();
    return res.json({ ok: true, code: pairingCode, createdAt: pairingCodeAt });
  } catch (error) {
    logger.error({ error }, "Falha ao gerar código de pareamento");
    return res.status(500).json({ ok: false, error: "Não foi possível gerar o código." });
  }
});

app.post("/send", rateLimit, async (req, res) => {
  if (connectionState !== "connected" || !socket) {
    return res.status(503).json({
      ok: false,
      error: "WhatsApp desconectado. Abra a plataforma e faça a conexão.",
    });
  }

  const phone = cleanPhone(req.body?.telefone);
  const message = String(req.body?.mensagem || "").trim();
  const photoBase64 = req.body?.foto_base64;
  const photoMime = String(req.body?.foto_mime || "image/jpeg");
  const idempotencyKey = String(req.body?.idempotency_key || "").slice(0, 120);
  if (idempotencyKey && idempotency.has(idempotencyKey)) {
    return res.json(idempotency.get(idempotencyKey));
  }
  if (phone.length < 12 || phone.length > 15 || !message) {
    return res.status(400).json({ ok: false, error: "Telefone ou mensagem inválidos." });
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return res.status(400).json({ ok: false, error: "A mensagem é muito longa." });
  }

  try {
    const results = await socket.onWhatsApp(phone);
    const destination = results?.find((item) => item.exists);
    if (!destination) {
      return res.status(422).json({ ok: false, error: "Número não encontrado no WhatsApp." });
    }

    let sent;
    if (photoBase64) {
      const photo = Buffer.from(String(photoBase64), "base64");
      if (photo.length <= 0 || photo.length > MAX_PHOTO_BYTES) {
        return res.status(400).json({ ok: false, error: "Foto inválida ou maior que 5 MB." });
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(photoMime)) {
        return res.status(400).json({ ok: false, error: "Formato de foto inválido." });
      }
      sent = await socket.sendMessage(destination.jid, {
        image: photo,
        mimetype: photoMime,
        caption: message,
      });
    } else {
      sent = await socket.sendMessage(destination.jid, { text: message });
    }

    const response = { ok: true, messageId: sent?.key?.id || "" };
    if (idempotencyKey) {
      idempotency.set(idempotencyKey, response);
      if (idempotency.size > 500) idempotency.delete(idempotency.keys().next().value);
    }
    return res.json(response);
  } catch (error) {
    logger.error({ error }, "Falha no envio WhatsApp");
    return res.status(500).json({ ok: false, error: "Falha ao enviar a mensagem." });
  }
});

app.post("/reset-session", rateLimit, async (req, res) => {
  if (req.body?.confirmation !== "DESCONECTAR") {
    return res.status(400).json({
      ok: false,
      error: "Confirmação inválida. Digite DESCONECTAR.",
    });
  }
  try {
    if (socket) await socket.logout().catch(() => undefined);
    socket = null;
    connectionState = "resetting";
    latestQrDataUrl = null;
    pairingCode = null;
    await fs.rm(SESSION_PATH, { recursive: true, force: true });
    await startConnection();
    return res.json({ ok: true, state: connectionState });
  } catch (error) {
    logger.error({ error }, "Falha ao redefinir sessão");
    return res.status(500).json({ ok: false, error: "Não foi possível redefinir a sessão." });
  }
});

app.use((error, _req, res, _next) => {
  if (error?.type === "entity.too.large") {
    return res.status(413).json({ ok: false, error: "Conteúdo maior que o limite permitido." });
  }
  logger.error({ error }, "Erro não tratado");
  return res.status(500).json({ ok: false, error: "Erro interno." });
});

app.listen(PORT, "0.0.0.0", () => {
  logger.info({ port: PORT }, "Serviço WhatsApp iniciado");
  startConnection().catch((error) => {
    logger.error({ error }, "Falha na conexão inicial");
    connectionState = "error";
    scheduleReconnect();
  });
});
