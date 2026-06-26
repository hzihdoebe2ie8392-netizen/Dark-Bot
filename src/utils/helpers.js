'use strict';

const OWNER = process.env.OWNER_NUMBER || '201107897471';

// Normalize JID
function normalizeJid(jid) {
  if (!jid) return '';
  return jid.replace(/:\d+@/, '@').trim();
}

// Get phone number from JID - strips LID suffix if present
function jidToPhone(jid) {
  if (!jid) return '';
  // LID format: 256032228016168@lid -> extract via normalizeJid then split
  const normalized = jid.replace(/:\d+@/, '@');
  const part = normalized.split('@')[0];
  // LID numbers are very long (15+ digits starting with country-unrelated prefix)
  // Real phone numbers are 7-15 digits. Return as-is; caller handles display.
  return part;
}

// Build JID from phone number
function phoneToJid(phone) {
  const cleaned = phone.replace(/[^0-9]/g, '');
  return `${cleaned}@s.whatsapp.net`;
}

// Check if JID is owner
function isOwnerJid(jid) {
  const phone = jidToPhone(normalizeJid(jid));
  return phone === OWNER || phone === OWNER.replace(/^0+/, '');
}

// Get mentioned JIDs from message - checks all message types
function getMentions(msg) {
  const m = msg?.message;
  if (!m) return [];
  const ctx =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    m.audioMessage?.contextInfo ||
    m.stickerMessage?.contextInfo;
  return (ctx?.mentionedJid || []).map(normalizeJid);
}

// Get quoted message sender - checks all message types
function getQuotedSender(msg) {
  const m = msg?.message;
  if (!m) return null;
  const ctx =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    m.audioMessage?.contextInfo ||
    m.stickerMessage?.contextInfo;
  if (!ctx) return null;
  const raw = ctx.participant || ctx.remoteJid;
  if (!raw) return null;
  return normalizeJid(raw);
}

// Get message text
function getMsgText(msg) {
  const m = msg?.message;
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  ).trim();
}

// Get message type - GIF must be checked before video
function getMsgType(msg) {
  const m = msg?.message;
  if (!m) return 'unknown';
  if (m.conversation || m.extendedTextMessage) return 'text';
  if (m.stickerMessage) return 'sticker';
  if (m.audioMessage) return 'audio';
  if (m.documentMessage) return 'document';
  if (m.contactMessage || m.contactsArrayMessage) return 'contact';
  if (m.locationMessage || m.liveLocationMessage) return 'location';
  // GIF: videoMessage with gifPlayback flag
  if (m.videoMessage && m.videoMessage.gifPlayback) return 'gif';
  if (m.imageMessage) return 'image';
  if (m.videoMessage) return 'video';
  if (m.protocolMessage) return 'protocol';
  if (m.ephemeralMessage) return 'ephemeral';
  return 'unknown';
}

// Parse mute duration from text
function parseMuteDuration(text) {
  const lc = text.toLowerCase();
  if (/ساعه|ساعة|hour/.test(lc)) {
    const match = lc.match(/(\d+)/);
    return (match ? parseInt(match[1]) : 1) * 3600;
  }
  if (/يوم|day/.test(lc)) {
    const match = lc.match(/(\d+)/);
    return (match ? parseInt(match[1]) : 1) * 86400;
  }
  if (/أسبوع|اسبوع|week/.test(lc)) {
    const match = lc.match(/(\d+)/);
    return (match ? parseInt(match[1]) : 1) * 604800;
  }
  if (/شهر|month/.test(lc)) {
    const match = lc.match(/(\d+)/);
    return (match ? parseInt(match[1]) : 1) * 2592000;
  }
  if (/دقيقه|دقيقة|minute|min/.test(lc)) {
    const match = lc.match(/(\d+)/);
    return (match ? parseInt(match[1]) : 30) * 60;
  }
  return 0; // permanent
}

// Format duration in arabic
function formatDuration(seconds) {
  if (seconds <= 0) return 'دائم';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} دقيقة`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ساعة`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} يوم`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)} أسبوع`;
  return `${Math.floor(seconds / 2592000)} شهر`;
}

// Format timestamp
function formatTimestamp(ts) {
  if (!ts) return 'غير معروف';
  return new Date(ts * 1000).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });
}

// Check contains link
function containsLink(text) {
  return /https?:\/\/|www\.|t\.me|wa\.me|bit\.ly|youtu\.be|\.com|\.net|\.org|\.io/i.test(text);
}

// Signature - always ends every message
const SIG = '\n\n「Dark Bot 🤖」';

module.exports = {
  normalizeJid, jidToPhone, phoneToJid, isOwnerJid,
  getMentions, getQuotedSender, getMsgText, getMsgType,
  parseMuteDuration, formatDuration, formatTimestamp,
  containsLink, SIG, OWNER
};
