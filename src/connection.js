'use strict';

const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const db = require('./database/db');
const { handleMessage } = require('./handlers/messageHandler');
const { handleGroupUpdate, handleGroupJoin, handleAdminPromotion, handleAdminDemotion } = require('./handlers/groupEvents');
const { normalizeJid } = require('./utils/helpers');
const logger = require('./utils/logger');
const { useMongoDBAuthState } = require('./utils/mongoSession');

const SESSION_DIR = path.join(process.cwd(), 'data', 'sessions');
const MONGO_URI = process.env.MONGO_URI;

let sock = null;
let retryCount = 0;
let lastQR = null;
const MAX_RETRIES = 15;

async function connectToWhatsApp() {
  let authState = null;

  if (MONGO_URI) {
    logger.info('Attempting to use MongoDB for session storage...');
    try {
        authState = await useMongoDBAuthState(MONGO_URI);
    } catch (err) {
        logger.error(`MongoDB error: ${err.message}. Falling back to local files.`);
    }
  }

  // Fallback to local files if MongoDB fails or is not provided
  if (!authState) {
    logger.info('Using local files for session storage...');
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
    authState = await useMultiFileAuthState(SESSION_DIR);
  }

  const { state, saveCreds } = authState;
  const { version } = await fetchLatestBaileysVersion();

  logger.info(`Using WA version: ${version.join('.')}`);

  const silentLogger = pino({ level: 'silent' });

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, silentLogger)
    },
    logger: silentLogger,
    printQRInTerminal: false,
    browser: ['Dark Bot', 'Chrome', '120.0.0'],
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    getMessage: async () => undefined
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      lastQR = qr;
      logger.info('QR Code ready - scan with WhatsApp:');
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === 'close') {
      lastQR = null;
      const err = lastDisconnect?.error;
      const statusCode = err?.output?.statusCode;
      const reason = err?.output?.payload?.error || err?.message || 'unknown';
      
      logger.warn(`Connection closed. statusCode=${statusCode} reason=${reason}`);

      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect && retryCount < MAX_RETRIES) {
        retryCount++;
        const delay = Math.min(1000 * Math.pow(2, retryCount), 60000);
        logger.info(`Retrying connection in ${delay/1000}s (Attempt ${retryCount}/${MAX_RETRIES})...`);
        setTimeout(connectToWhatsApp, delay);
      } else if (statusCode === DisconnectReason.loggedOut) {
        logger.error('Logged out from WhatsApp. Please scan QR code again.');
        process.exit(1);
      } else {
        logger.error('Max retries reached. Exiting...');
        process.exit(1);
      }
    } else if (connection === 'open') {
      lastQR = null;
      retryCount = 0;
      logger.info('✅ Dark Bot Connected to WhatsApp!');
      
      try {
        const groups = await sock.groupFetchAllParticipating();
        for (const [jid, meta] of Object.entries(groups)) {
          db.upsertGroup(jid, meta.subject);
        }
      } catch (e) {}
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      await handleMessage(sock, msg);
    }
  });

  sock.ev.on('group-participants.update', async (update) => {
    try {
      const botJid = normalizeJid(sock.user?.id || '');
      const isBotAffected = update.participants.some(p => normalizeJid(p) === botJid);
      
      if (isBotAffected) {
        if (update.action === 'promote') {
          await handleAdminPromotion(sock, update.id);
        } else if (update.action === 'demote') {
          await handleAdminDemotion(sock, update.id);
        }
      }
      
      await handleGroupUpdate(sock, update);
    } catch (e) {}
  });

  return sock;
}

async function getQRImage() {
  if (!lastQR) return null;
  try {
    return await QRCode.toDataURL(lastQR);
  } catch (err) {
    return null;
  }
}

function getSock() {
  return sock;
}

module.exports = { connectToWhatsApp, getSock, getQRImage };
