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
const QRCode = require('qrcode'); // إضافة مكتبة توليد الصور
const db = require('./database/db');
const { handleMessage } = require('./handlers/messageHandler');
const { handleGroupUpdate, handleGroupJoin, handleAdminPromotion, handleAdminDemotion } = require('./handlers/groupEvents');
const { normalizeJid } = require('./utils/helpers');
const { kickGlobalBannedMember } = require('./utils/globalBan');
const logger = require('./utils/logger');

const SESSION_DIR = path.join(process.cwd(), 'sessions', process.env.SESSION_NAME || 'dark-bot-session');

let sock = null;
let retryCount = 0;
let lastQR = null; // تخزين آخر QR
const MAX_RETRIES = 10;

async function connectToWhatsApp() {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
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
      lastQR = qr; // تحديث الـ QR
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
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
        setTimeout(connectToWhatsApp, delay);
      } else if (statusCode === DisconnectReason.loggedOut) {
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        process.exit(1);
      } else {
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

// دالة لجلب الـ QR كصورة
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
