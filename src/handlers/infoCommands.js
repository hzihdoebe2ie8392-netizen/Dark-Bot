'use strict';

const db = require('../database/db');
const { SIG, normalizeJid, isOwnerJid } = require('../utils/helpers');

async function send(sock, jid, text) {
  try {
    await sock.sendMessage(jid, { text: text + SIG });
  } catch (e) {}
}

async function handleBotInfo(sock, jid) {
  const info = `👋 أهلاً بكم في Dark Bot 🛡️

أنا بوت إدارة وحماية المجموعات.

⚡ أهم المميزات:

🔒 حماية كاملة.
🔇 نظام كتم.
👮 أوامر إدارية.
📝 ردود تلقائية.
📢 إذاعة.
🚀 سرعة واستقرار.

📋 لمعرفة جميع الأوامر ارسل:
الأوامر

✨ نتمنى لكم تجربة آمنة وممتعة مع Dark Bot.`;
  await send(sock, jid, info);
}

async function handleCommandsList(sock, jid, isAdmin, group) {
  let txt = '';

  // Protection status block
  if (group) {
    const statuses = [
      [group.anti_link,     'الروابط'],
      [group.anti_image,    'الصور'],
      [group.anti_video,    'الفيديو'],
      [group.anti_file,     'الملفات'],
      [group.anti_sticker,  'الملصقات'],
      [group.anti_audio,    'الصوتيات'],
      [group.anti_gif,      'الجيفات'],
      [group.anti_contact,  'الجهات'],
      [group.anti_location, 'المواقع'],
      [group.anti_forward,  'التوجيه'],
      [group.anti_word,     'الكلمات'],
    ];
    txt += `━━━━━━━━━━━━━━━━━━\n\n🔒 حالة الحمايات\n\n`;
    for (const [status, name] of statuses) {
      txt += `${name}: ${status ? '✅ مفعل' : '❌ معطل'}\n`;
    }
    txt += `\n━━━━━━━━━━━━━━━━━━\n`;
  }

  if (isAdmin) {
    txt += `\n👮 أوامر الإدارة:\n`;
    txt += `طرد | رفع | تنزيل\n`;
    txt += `كتم | فك كتم\n`;
    txt += `تحذير | عرض التحذيرات | تصفير التحذيرات\n`;
    txt += `قفل الشات | فتح الشات\n`;
    txt += `تثبيت | إلغاء تثبيت\n`;

    txt += `\n🛡️ الحماية:\n`;
    txt += `قفل الروابط | فتح الروابط\n`;
    txt += `قفل الصور | فتح الصور\n`;
    txt += `قفل الفيديو | فتح الفيديو\n`;
    txt += `قفل الملفات | فتح الملفات\n`;
    txt += `قفل الملصقات | فتح الملصقات\n`;
    txt += `قفل الصوتيات | فتح الصوتيات\n`;
    txt += `قفل الجيفات | فتح الجيفات\n`;
    txt += `قفل التوجيه | فتح التوجيه\n`;
    txt += `قفل جهات الاتصال | قفل المواقع\n`;

    txt += `\n📜 القوانين:\n`;
    txt += `اضف قانون | حذف قانون | تعديل قانون | القوانين\n`;

    txt += `\n👋 الترحيب:\n`;
    txt += `اضف ترحيب | حذف ترحيب\n`;

    txt += `\n🚫 الكلمات الممنوعة:\n`;
    txt += `اضف كلمة ممنوعة | احذف كلمة ممنوعة | الكلمات الممنوعة\n`;

    txt += `\n📝 الردود التلقائية:\n`;
    txt += `اضف رد | احذف رد | الردود\n`;

    txt += `\n💡 الأوامر تعمل بالرد أو المنشن أو الرقم\n`;
  }

  txt += `\nℹ️ أوامر الجميع:\n`;
  txt += `القوانين | بوت | بيانات | معرف\n`;

  await send(sock, jid, txt);
}

async function handleUserInfo(sock, msg, groupJid, senderJid, targetJid, groupMeta) {
  try {
    const target = targetJid || senderJid;

    db.upsertUser(target, groupJid, '');
    const userDb = db.getUser(target, groupJid);

    const participants = groupMeta?.participants || [];
    const targetParticipant = participants.find(p => normalizeJid(p.id) === normalizeJid(target));
    const ownerParticipant = participants.find(p => p.admin === 'superadmin');

    // --- Real phone number: prefer @s.whatsapp.net JID, reject LID ---
    // LID JIDs use @lid domain; real phone JIDs use @s.whatsapp.net
    // When target is LID, try to find corresponding @s.whatsapp.net participant
    let realPhone = '';
    const targetDomain = target.split('@')[1] || '';
    if (targetDomain === 'lid') {
      // Try to find a participant with matching index (same position) that has @s.whatsapp.net
      // Or fall back to userDb if it has a real phone stored
      if (userDb?.phone) {
        realPhone = userDb.phone;
      } else {
        // Cannot resolve - show message
        realPhone = '❌ غير متاح (LID)';
      }
    } else {
      // Normal @s.whatsapp.net JID - extract phone directly
      realPhone = target.split('@')[0].split(':')[0];
    }

    // --- Real name: use pushName/notify from msg context or verifiedName ---
    // targetParticipant in Baileys has: id, admin, but NOT name/pushName directly
    // pushName comes from the message itself (msg.pushName) when sender == target
    // For other users, we check notify field or verifiedName if available
    let realName = '';
    if (targetParticipant) {
      // Baileys participant object: may have verifiedName, notify on some versions
      realName = targetParticipant.verifiedName ||
                 targetParticipant.notify ||
                 targetParticipant.name ||
                 '';
    }
    // If this is the sender themselves, use pushName from the message
    if (!realName && normalizeJid(target) === normalizeJid(senderJid)) {
      realName = msg?.pushName || '';
    }
    // Fallback to phone if no name found
    if (!realName) realName = realPhone || target.split('@')[0];

    let rank = '👤 عضو';
    if (isOwnerJid(target)) {
      rank = '👑 مؤسس الجروب';
    } else if (ownerParticipant && normalizeJid(ownerParticipant.id) === normalizeJid(target)) {
      rank = '👑 مؤسس الجروب';
    } else if (targetParticipant?.admin === 'superadmin') {
      rank = '👑 مؤسس الجروب';
    } else if (targetParticipant?.admin) {
      rank = '🛡️ مشرف';
    }

    const muteStatus = db.isMuted(target, groupJid) ? '🔇 مكتوم' : '🔊 غير مكتوم';
    const warnCount = userDb?.warn_count || 0;
    const WARN_LIMIT = parseInt(process.env.WARN_LIMIT || '3');

    const info = `👤 الاسم: ${realName}\n📱 الرقم: ${realPhone}\n🎖️ الرتبة: ${rank}\n⚠️ التحذيرات: ${warnCount}/${WARN_LIMIT}\n${muteStatus}`;

    await send(sock, groupJid, info);
  } catch (e) {
    await send(sock, groupJid, `❌ تعذر جلب البيانات`);
  }
}

module.exports = { handleBotInfo, handleCommandsList, handleUserInfo };
