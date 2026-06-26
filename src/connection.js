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
const qrcode = require('qrcode-terminal');
const db = require('./database/db');
const { handleMessage } = require('./handlers/messageHandler');
const { handleGroupUpdate, handleGroupJoin, handleAdminPromotion } = require('./handlers/groupEvents');
const { normalizeJid } = require('./utils/helpers');
const { kickGlobalBannedMember } = require('./utils/globalBan');
const logger = require('./utils/logger');

const SESSION_DIR = path.join(process.cwd(), 'sessions', process.env.SESSION_NAME || 'dark-bot-session');

let sock = null;
let retryCount = 0;
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
    printQRInTerminal: false, // نعرضه يدوياً عبر qrcode-terminal
    browser: ['Dark Bot', 'Chrome', '120.0.0'],
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    getMessage: async () => undefined
  });

  // Save credentials on update
  sock.ev.on('creds.update', saveCreds);

  // Connection updates
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // 1. QR Display
    if (qr) {
      logger.info('QR Code ready - scan with WhatsApp:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const err = lastDisconnect?.error;
      const statusCode = err?.output?.statusCode;
      const reason = err?.output?.payload?.error || err?.message || 'unknown';
      const stack = err?.stack || '';

      logger.warn(`Connection closed. statusCode=${statusCode} reason=${reason}`);
      if (stack) logger.error('Connection error stack', { stack });

      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect && retryCount < MAX_RETRIES) {
        retryCount++;
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
        logger.info(`Reconnecting in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`);
        setTimeout(connectToWhatsApp, delay);
      } else if (statusCode === DisconnectReason.loggedOut) {
        logger.error(`Logged out from WhatsApp. statusCode=${statusCode}. Deleting session.`);
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        process.exit(1);
      } else {
        logger.error(`Max retries reached. statusCode=${statusCode}. Exiting.`);
        process.exit(1);
      }
    } else if (connection === 'open') {
      retryCount = 0;
      logger.info('✅ Dark Bot Connected to WhatsApp!');

      // Register all groups and kick globally banned members
      try {
        const groups = await sock.groupFetchAllParticipating();
        for (const [jid, meta] of Object.entries(groups)) {
          db.upsertGroup(jid, meta.subject);
          for (const p of meta.participants || []) {
            const pJid = normalizeJid(p.id);
            if (pJid && db.isGlobalBanned(pJid)) {
              await kickGlobalBannedMember(sock, jid, pJid, 'on-connect scan');
            }
          }
        }
        logger.info(`Registered ${Object.keys(groups).length} groups`);
      } catch (e) {
        logger.error('Failed to fetch groups', { message: e.message, stack: e.stack });
      }
    }
  });

  // Messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      await handleMessage(sock, msg);
    }
  });

  // Group participant updates
  sock.ev.on('group-participants.update', async (update) => {
    try {
      const { id: groupJid, participants, action } = update;

      const botJid = normalizeJid(sock.user?.id || '');
      const botInUpdate = participants.map(normalizeJid).includes(botJid);

      if (action === 'add' && botInUpdate) {
        try {
          const meta = await sock.groupMetadata(groupJid);
          db.upsertGroup(groupJid, meta?.subject || '');
          await handleGroupJoin(sock, groupJid, meta);
        } catch (e) {}
        return;
      }

      if (action === 'promote' && botInUpdate) {
        await handleAdminPromotion(sock, groupJid);
      }

      await handleGroupUpdate(sock, update);
    } catch (e) {
      logger.error('Group participant update error', { message: e.message, stack: e.stack });
    }
  });

  // Group setting updates
  sock.ev.on('groups.update', async (updates) => {
    for (const update of updates) {
      if (update.id) {
        const group = db.getGroup(update.id);
        if (group && update.subject) {
          db.updateGroup(update.id, { name: update.subject });
        }
      }
    }
  });

  return sock;
}

function getSock() {
  return sock;
}

module.exports = { connectToWhatsApp, getSock };
