'use strict';

const db = require('../database/db');
const { getMsgType, containsLink, SIG, normalizeJid } = require('../utils/helpers');
const { TTLCache, register } = require('../utils/cache');

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

async function handleProtection(sock, msg, group, senderJid, isAdmin) {
  // Admins bypass all protections
  if (isAdmin) return false;

  const msgType = getMsgType(msg);
  const text = msg?.message?.conversation ||
    msg?.message?.extendedTextMessage?.text ||
    msg?.message?.imageMessage?.caption ||
    msg?.message?.videoMessage?.caption ||
    msg?.message?.documentMessage?.caption || '';

  // Check forwarded messages
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

  // Logic to determine violation
  if (group.anti_forward && isForwarded) {
    violationType = 'forward';
  } else if (group.anti_link && containsLink(text)) {
    violationType = 'link';
  } else if (group.anti_sticker && msgType === 'sticker') {
    violationType = 'sticker';
  } else if (group.anti_gif && msgType === 'gif') {
    violationType = 'gif';
  } else if (group.anti_image && msgType === 'image') {
    violationType = 'image';
  } else if (group.anti_video && msgType === 'video') {
    violationType = 'video';
  } else if (group.anti_audio && msgType === 'audio') {
    violationType = 'audio';
  } else if (group.anti_file && msgType === 'document') {
    violationType = 'file';
  } else if (group.anti_contact && msgType === 'contact') {
    violationType = 'contact';
  } else if (group.anti_location && msgType === 'location') {
    violationType = 'location';
  } else if (group.anti_word && text) {
    const bannedWords = getCachedBannedWords(group.jid);
    const lc = text.toLowerCase();
    for (const bw of bannedWords) {
      if (lc.includes(bw.word)) {
        violationType = 'word';
        break;
      }
    }
  }

  if (!violationType) return false;

  // 1. DELETE THE MESSAGE IMMEDIATELY
  try {
    await sock.sendMessage(group.jid, { 
        delete: {
            remoteJid: group.jid,
            fromMe: false,
            id: msg.key.id,
            participant: senderJid
        }
    });
  } catch (e) {
    console.error('Failed to delete violation message:', e.message);
  }

  // 2. SEND WARNING MESSAGE
  const msgs = {
    link:     '⚠️ الروابط ممنوعة في هذه المجموعة!',
    image:    '⚠️ الصور ممنوعة حالياً!',
    video:    '⚠️ الفيديوهات ممنوعة حالياً!',
    file:     '⚠️ الملفات ممنوعة حالياً!',
    sticker:  '⚠️ الملصقات ممنوعة حالياً!',
    audio:    '⚠️ الرسائل الصوتية ممنوعة حالياً!',
    gif:      '⚠️ الصور المتحركة (GIF) ممنوعة حالياً!',
    contact:  '⚠️ جهات الاتصال ممنوعة حالياً!',
    location: '⚠️ المواقع ممنوعة حالياً!',
    word:     '⚠️ تم رصد كلمة ممنوعة في رسالتك!',
    forward:  '⚠️ التوجيه ممنوع في هذه المجموعة!'
  };

  try {
    await sock.sendMessage(group.jid, { 
        text: `@${senderJid.split('@')[0]} ${msgs[violationType] || '⚠️ هذا النوع من الرسائل ممنوع!'}`,
        mentions: [senderJid]
    }, { quoted: msg });
  } catch (e) {}

  return true;
}

module.exports = { handleProtection, invalidateBannedWordsCache };
