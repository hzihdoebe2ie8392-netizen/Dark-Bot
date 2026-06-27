'use strict';

const db = require('../database/db');
const { getMsgType, containsLink, SIG, normalizeJid } = require('../utils/helpers');
const { TTLCache, register } = require('../utils/cache');
const logger = require('../utils/logger');

const bannedWordsCache = register(new TTLCache(30000));
function getCachedBannedWords(groupJid) {
  let words = bannedWordsCache.get(groupJid);
  if (!words) {
    words = db.getBannedWords(groupJid);
    bannedWordsCache.set(groupJid, words);
  }
  return words;
}
function invalidateBannedWordsCache(groupJid) {
  bannedWordsCache.invalidate(groupJid);
}

async function handleProtection(sock, msg, group, senderJid, isAdmin, isBotAdmin) {
  if (isAdmin) return false;

  const msgType = getMsgType(msg);
  const text = (msg?.message?.conversation ||
    msg?.message?.extendedTextMessage?.text ||
    msg?.message?.imageMessage?.caption ||
    msg?.message?.videoMessage?.caption ||
    msg?.message?.documentMessage?.caption || '').trim();

  const isForwarded = !!(
    msg?.message?.extendedTextMessage?.contextInfo?.isForwarded ||
    msg?.message?.imageMessage?.contextInfo?.isForwarded ||
    msg?.message?.videoMessage?.contextInfo?.isForwarded ||
    msg?.message?.documentMessage?.contextInfo?.isForwarded ||
    msg?.message?.audioMessage?.contextInfo?.isForwarded ||
    msg?.message?.stickerMessage?.contextInfo?.isForwarded ||
    msg?.message?.contactMessage?.contextInfo?.isForwarded ||
    msg?.message?.locationMessage?.contextInfo?.isForwarded
  );

  let violationType = null;
  let violationReason = "";

  if (group.anti_forward && isForwarded) {
    violationType = 'forward';
    violationReason = "التوجيه (Forward) ممنوع!";
  } else if (group.anti_link && containsLink(text)) {
    violationType = 'link';
    violationReason = "الروابط ممنوعة!";
  } else if (group.anti_sticker && msgType === 'sticker') {
    violationType = 'sticker';
    violationReason = "الملصقات ممنوعة!";
  } else if (group.anti_image && msgType === 'image') {
    violationType = 'image';
    violationReason = "الصور ممنوعة!";
  } else if (group.anti_video && msgType === 'video') {
    violationType = 'video';
    violationReason = "الفيديوهات ممنوعة!";
  } else if (group.anti_audio && msgType === 'audio') {
    violationType = 'audio';
    violationReason = "الرسائل الصوتية ممنوعة!";
  } else if (group.anti_file && msgType === 'document') {
    violationType = 'file';
    violationReason = "الملفات ممنوعة!";
  } else if (group.anti_contact && msgType === 'contact') {
    violationType = 'contact';
    violationReason = "جهات الاتصال ممنوعة!";
  } else if (group.anti_location && msgType === 'location') {
    violationType = 'location';
    violationReason = "المواقع ممنوعة!";
  } else if (group.anti_word && text) {
    const bannedWords = getCachedBannedWords(group.jid);
    const lc = text.toLowerCase();
    for (const bw of bannedWords) {
      if (lc.includes(bw.word.toLowerCase())) {
        violationType = 'word';
        violationReason = `تم رصد كلمة ممنوعة: (${bw.word})`;
        break;
      }
    }
  }

  if (!violationType) return false;
  if (!isBotAdmin) return false;

  try {
    await sock.sendMessage(group.jid, { 
        delete: {
            remoteJid: group.jid,
            fromMe: false,
            id: msg.key.id,
            participant: senderJid
        }
    });

    await sock.sendMessage(group.jid, { 
        text: `⚠️ عذراً @${senderJid.split('@')[0]}، ${violationReason}\nتم مسح رسالتك تلقائياً.`,
        mentions: [senderJid]
    });

    if (group.punishment === 'kick') {
        await sock.groupParticipantsUpdate(group.jid, [senderJid], "remove");
    }
  } catch (e) {
    console.error(e);
  }

  return true;
}

module.exports = { handleProtection, invalidateBannedWordsCache };
