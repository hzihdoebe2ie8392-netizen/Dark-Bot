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
  if (isAdmin) return false; // Admins bypass all protections

  const msgType = getMsgType(msg);
  const text = msg?.message?.conversation ||
    msg?.message?.extendedTextMessage?.text ||
    msg?.message?.imageMessage?.caption ||
    msg?.message?.videoMessage?.caption ||
    msg?.message?.documentMessage?.caption || '';

  // Check forwarded messages - check all message types
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

  if (group.anti_forward && isForwarded) {
    violationType = 'forward';
  } else if (group.anti_link && containsLink(text)) {
    // text already includes captions from imageMessage, videoMessage, documentMessage
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

  // Delete the message only
  try {
    await sock.sendMessage(group.jid, { delete: msg.key });
  } catch (e) {}

  // Send warning - no mute, no kick
  const msgs = {
    link:     '⚠️ الروابط مقفولة',
    image:    '⚠️ الصور مقفولة',
    video:    '⚠️ الفيديوهات مقفولة',
    file:     '⚠️ الملفات مقفولة',
    sticker:  '⚠️ الملصقات مقفولة',
    audio:    '⚠️ الصوتيات مقفولة',
    gif:      '⚠️ الجيفات مقفولة',
    contact:  '⚠️ جهات الاتصال مقفولة',
    location: '⚠️ المواقع مقفولة',
    word:     '⚠️ الكلمات الممنوعة مقفولة',
    forward:  '⚠️ التوجيه مقفول'
  };

  try {
    await sock.sendMessage(group.jid, { text: (msgs[violationType] || '⚠️ ممنوع') + SIG });
  } catch (e) {}

  return true;
}

module.exports = { handleProtection, invalidateBannedWordsCache };
