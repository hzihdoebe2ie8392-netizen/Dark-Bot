'use strict';

const db = require('../database/db');
const { SIG, normalizeJid } = require('./helpers');
const logger = require('./logger');

/**
 * Helper موحد لطرد الأعضاء المحظورين عالمياً.
 * يقوم بـ: الطرد + الرسالة + تسجيل Log
 *
 * @param {object} sock   - Baileys socket
 * @param {string} groupJid
 * @param {string} userJid  - JID مُعياري
 * @param {string} reason   - سبب للسجل (on-connect scan / on-join / etc.)
 * @returns {Promise<boolean>} true إذا نجح الطرد
 */
async function kickGlobalBannedMember(sock, groupJid, userJid, reason = 'global ban') {
  const jid = normalizeJid(userJid);
  try {
    await sock.groupParticipantsUpdate(groupJid, [jid], 'remove');
    await sock.sendMessage(groupJid, { text: `🚫 عضو محظور عالمياً${SIG}` });
    db.addLog(groupJid, 'system', 'AUTO_KICK_GLOBAL_BAN', jid, reason);
    logger.info(`[GlobalBan] Kicked ${jid} from ${groupJid} | reason: ${reason}`);
    return true;
  } catch (e) {
    logger.error(`[GlobalBan] Failed to kick ${jid} from ${groupJid}`, {
      message: e.message,
      stack: e.stack
    });
    return false;
  }
}

module.exports = { kickGlobalBannedMember };
