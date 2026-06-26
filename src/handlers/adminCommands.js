'use strict';

const db = require('../database/db');
const {
  SIG, normalizeJid, phoneToJid,
  getMentions, getQuotedSender, parseMuteDuration, formatDuration
} = require('../utils/helpers');
const { getCommandArg } = require('../utils/commandParser');
const { invalidateBannedWordsCache } = require('./protection');

// Resolve target from reply/mention/number in text
function resolveTarget(msg, text, cmd) {
  const mentions = getMentions(msg);
  if (mentions.length > 0) return normalizeJid(mentions[0]);

  const quoted = getQuotedSender(msg);
  if (quoted) return normalizeJid(quoted);

  const arg = getCommandArg(text, cmd);
  const match = arg.match(/\d{7,15}/);
  if (match) return phoneToJid(match[0]);

  return null;
}

async function send(sock, jid, text) {
  try {
    await sock.sendMessage(jid, { text: text + SIG });
  } catch (e) {}
}

async function handleAdminCommand(sock, msg, groupJid, senderJid, text, cmd, groupMeta) {
  const admins = (groupMeta?.participants || [])
    .filter(p => p.admin)
    .map(p => normalizeJid(p.id));

  if (!admins.includes(normalizeJid(senderJid))) {
    await send(sock, groupJid, '❌ هذا الأمر للمشرفين فقط');
    return true;
  }

  const group = db.getGroup(groupJid) || db.upsertGroup(groupJid, groupMeta?.subject);

  switch (cmd) {
    // --- KICK ---
    case 'KICK': {
      const target = resolveTarget(msg, text, 'KICK');
      if (!target) { await send(sock, groupJid, '❌ حدد العضو بالرد أو المنشن أو الرقم'); return true; }
      try {
        await sock.groupParticipantsUpdate(groupJid, [target], 'remove');
        db.addLog(groupJid, senderJid, 'KICK', target, '');
        await send(sock, groupJid, `✅ تم طرد العضو`);
      } catch (e) {
        await send(sock, groupJid, '❌ تعذر الطرد، تأكد من الصلاحيات');
      }
      return true;
    }

    // --- PROMOTE ---
    case 'PROMOTE': {
      const target = resolveTarget(msg, text, 'PROMOTE');
      if (!target) { await send(sock, groupJid, '❌ حدد العضو بالرد أو المنشن أو الرقم'); return true; }
      try {
        await sock.groupParticipantsUpdate(groupJid, [target], 'promote');
        db.addLog(groupJid, senderJid, 'PROMOTE', target, '');
        await send(sock, groupJid, `✅ تم رفع العضو إلى مشرف`);
      } catch (e) {
        await send(sock, groupJid, '❌ تعذر الرفع، تأكد من الصلاحيات');
      }
      return true;
    }

    // --- DEMOTE ---
    case 'DEMOTE': {
      const target = resolveTarget(msg, text, 'DEMOTE');
      if (!target) { await send(sock, groupJid, '❌ حدد العضو بالرد أو المنشن أو الرقم'); return true; }
      try {
        await sock.groupParticipantsUpdate(groupJid, [target], 'demote');
        db.addLog(groupJid, senderJid, 'DEMOTE', target, '');
        await send(sock, groupJid, `✅ تم تنزيل المشرف إلى عضو`);
      } catch (e) {
        await send(sock, groupJid, '❌ تعذر التنزيل، تأكد من الصلاحيات');
      }
      return true;
    }

    // --- MUTE ---
    case 'MUTE': {
      const target = resolveTarget(msg, text, 'MUTE');
      if (!target) { await send(sock, groupJid, '❌ حدد العضو بالرد أو المنشن أو الرقم'); return true; }
      const duration = parseMuteDuration(text);
      const muteUntil = duration > 0 ? Math.floor(Date.now() / 1000) + duration : 0;
      db.upsertUser(target, groupJid, '');
      db.setMuted(target, groupJid, senderJid, muteUntil);
      db.addLog(groupJid, senderJid, 'MUTE', target, formatDuration(duration));
      const durationText = duration > 0 ? ` لمدة ${formatDuration(duration)}` : ' بشكل دائم';
      await send(sock, groupJid, `🔇 تم كتم العضو${durationText}`);
      return true;
    }

    // --- UNMUTE ---
    case 'UNMUTE': {
      const target = resolveTarget(msg, text, 'UNMUTE');
      if (!target) { await send(sock, groupJid, '❌ حدد العضو بالرد أو المنشن أو الرقم'); return true; }
      db.unsetMuted(target, groupJid);
      db.addLog(groupJid, senderJid, 'UNMUTE', target, '');
      await send(sock, groupJid, `✅ تم فك الكتم`);
      return true;
    }

    // --- WARN ---
    case 'WARN': {
      const target = resolveTarget(msg, text, 'WARN');
      if (!target) { await send(sock, groupJid, '❌ حدد العضو بالرد أو المنشن أو الرقم'); return true; }
      db.upsertUser(target, groupJid, '');
      const rawArg = getCommandArg(text, 'WARN').trim();
      // Remove mention patterns (@number) and JID patterns from the reason text
      const reason = rawArg.replace(/@\d+/g, '').replace(/\d{7,15}@s\.whatsapp\.net/g, '').trim();
      const count = db.addWarning(target, groupJid, senderJid, reason);
      db.addLog(groupJid, senderJid, 'WARN', target, `count:${count}`);
      const WARN_LIMIT = parseInt(process.env.WARN_LIMIT || '3');
      if (count >= WARN_LIMIT) {
        db.setMuted(target, groupJid, 'system', 0);
        await send(sock, groupJid, `⚠️ تحذير ${count}/${WARN_LIMIT}\n🔇 تم كتم العضو تلقائياً بسبب تجاوز حد التحذيرات`);
      } else {
        await send(sock, groupJid, `⚠️ تحذير ${count}/${WARN_LIMIT}`);
      }
      return true;
    }

    // --- SHOW WARNS ---
    case 'SHOW_WARNS': {
      const target = resolveTarget(msg, text, 'SHOW_WARNS');
      if (!target) { await send(sock, groupJid, '❌ حدد العضو بالرد أو المنشن أو الرقم'); return true; }
      const warns = db.getWarnings(target, groupJid);
      if (!warns.length) {
        await send(sock, groupJid, `📋 لا توجد تحذيرات`);
      } else {
        const WARN_LIMIT = parseInt(process.env.WARN_LIMIT || '3');
        let txt = `📋 التحذيرات: ${warns.length}/${WARN_LIMIT}\n`;
        warns.forEach((w, i) => {
          txt += `\n${i + 1}- ${w.reason || 'بدون سبب'} [#${w.id}]`;
        });
        await send(sock, groupJid, txt);
      }
      return true;
    }

    // --- DELETE WARN ---
    case 'DELETE_WARN': {
      const arg = getCommandArg(text, 'DELETE_WARN').trim();
      const id = parseInt(arg);
      if (!id) { await send(sock, groupJid, '❌ أرسل رقم التحذير'); return true; }
      db.deleteWarning(id);
      await send(sock, groupJid, `✅ تم حذف التحذير #${id}`);
      return true;
    }

    // --- RESET WARNS ---
    case 'RESET_WARNS': {
      const target = resolveTarget(msg, text, 'RESET_WARNS');
      if (!target) { await send(sock, groupJid, '❌ حدد العضو بالرد أو المنشن أو الرقم'); return true; }
      db.resetWarnings(target, groupJid);
      db.addLog(groupJid, senderJid, 'RESET_WARNS', target, '');
      await send(sock, groupJid, `✅ تم تصفير تحذيرات العضو`);
      return true;
    }

    // --- ADD RULE ---
    case 'ADD_RULE': {
      db.setPending(senderJid, groupJid, 'ADD_RULE');
      await send(sock, groupJid, `📝 أرسل القانون الآن`);
      return true;
    }

    // --- DELETE RULE ---
    case 'DELETE_RULE': {
      const arg = getCommandArg(text, 'DELETE_RULE').trim();
      const id = parseInt(arg);
      if (!id) {
        db.setPending(senderJid, groupJid, 'DELETE_RULE');
        await send(sock, groupJid, `📜 أرسل رقم القانون`);
      } else {
        const changed = db.deleteRule(groupJid, id);
        await send(sock, groupJid, changed ? `✅ تم حذف القانون` : `❌ القانون غير موجود`);
      }
      return true;
    }

    // --- EDIT RULE ---
    case 'EDIT_RULE': {
      db.setPending(senderJid, groupJid, 'EDIT_RULE');
      await send(sock, groupJid, `📝 أرسل رقم القانون ثم النص الجديد\nمثال: 1 لا للإزعاج`);
      return true;
    }

    // --- SHOW RULES ---
    case 'SHOW_RULES': {
      const rules = db.getRules(groupJid);
      if (!rules.length) {
        await send(sock, groupJid, `📜 لا توجد قوانين بعد`);
      } else {
        let txt = `📜 قوانين المجموعة:\n`;
        rules.forEach((r, i) => { txt += `\n${i + 1}- ${r.rule_text}`; });
        await send(sock, groupJid, txt);
      }
      return true;
    }

    // --- ADD WELCOME ---
    case 'ADD_WELCOME': {
      db.setPending(senderJid, groupJid, 'ADD_WELCOME');
      await send(sock, groupJid, `📝 أرسل رسالة الترحيب الآن\n\nيمكنك استخدام:\n{الاسم} = اسم العضو\n{الجروب} = اسم الجروب`);
      return true;
    }

    // --- DELETE WELCOME ---
    case 'DELETE_WELCOME': {
      db.updateGroup(groupJid, { welcome_msg: '', welcome_enabled: 0 });
      await send(sock, groupJid, `✅ تم حذف رسالة الترحيب`);
      return true;
    }

    // --- LOCK CHAT ---
    case 'LOCK_CHAT': {
      try {
        await sock.groupSettingUpdate(groupJid, 'announcement');
        db.updateGroup(groupJid, { is_locked: 1 });
        db.addLog(groupJid, senderJid, 'LOCK_CHAT', '', '');
        await send(sock, groupJid, `🔒 تم قفل الشات`);
      } catch (e) {
        await send(sock, groupJid, '❌ تعذر قفل الشات، تأكد من الصلاحيات');
      }
      return true;
    }

    // --- UNLOCK CHAT ---
    case 'UNLOCK_CHAT': {
      try {
        await sock.groupSettingUpdate(groupJid, 'not_announcement');
        db.updateGroup(groupJid, { is_locked: 0 });
        db.addLog(groupJid, senderJid, 'UNLOCK_CHAT', '', '');
        await send(sock, groupJid, `🔓 تم فتح الشات`);
      } catch (e) {
        await send(sock, groupJid, '❌ تعذر فتح الشات، تأكد من الصلاحيات');
      }
      return true;
    }

    // --- PIN ---
    // NOT SUPPORTED BY BAILEYS
    // sock.chatModify({ pin: true }, groupJid) pins the CHAT in the contact list,
    // NOT a message inside a group. Baileys has no API for pinning group messages.
    case 'PIN': {
      await send(sock, groupJid, '⚠️ تثبيت الرسائل غير مدعوم حالياً في Baileys');
      return true;
    }

    // --- UNPIN ---
    // NOT SUPPORTED BY BAILEYS
    case 'UNPIN': {
      await send(sock, groupJid, '⚠️ إلغاء تثبيت الرسائل غير مدعوم حالياً في Baileys');
      return true;
    }

    // --- PROTECTION TOGGLES ---
    case 'ANTI_LINK_ON':     { db.updateGroup(groupJid, { anti_link: 1 });     await send(sock, groupJid, '✅ تم قفل الروابط');                return true; }
    case 'ANTI_LINK_OFF':    { db.updateGroup(groupJid, { anti_link: 0 });     await send(sock, groupJid, '✅ تم فتح الروابط');                return true; }
    case 'ANTI_IMAGE_ON':    { db.updateGroup(groupJid, { anti_image: 1 });    await send(sock, groupJid, '✅ تم قفل الصور');                  return true; }
    case 'ANTI_IMAGE_OFF':   { db.updateGroup(groupJid, { anti_image: 0 });    await send(sock, groupJid, '✅ تم فتح الصور');                  return true; }
    case 'ANTI_VIDEO_ON':    { db.updateGroup(groupJid, { anti_video: 1 });    await send(sock, groupJid, '✅ تم قفل الفيديوهات');             return true; }
    case 'ANTI_VIDEO_OFF':   { db.updateGroup(groupJid, { anti_video: 0 });    await send(sock, groupJid, '✅ تم فتح الفيديوهات');             return true; }
    case 'ANTI_FILE_ON':     { db.updateGroup(groupJid, { anti_file: 1 });     await send(sock, groupJid, '✅ تم قفل الملفات');                return true; }
    case 'ANTI_FILE_OFF':    { db.updateGroup(groupJid, { anti_file: 0 });     await send(sock, groupJid, '✅ تم فتح الملفات');                return true; }
    case 'ANTI_STICKER_ON':  { db.updateGroup(groupJid, { anti_sticker: 1 });  await send(sock, groupJid, '✅ تم قفل الملصقات');               return true; }
    case 'ANTI_STICKER_OFF': { db.updateGroup(groupJid, { anti_sticker: 0 });  await send(sock, groupJid, '✅ تم فتح الملصقات');               return true; }
    case 'ANTI_AUDIO_ON':    { db.updateGroup(groupJid, { anti_audio: 1 });    await send(sock, groupJid, '✅ تم قفل الصوتيات');               return true; }
    case 'ANTI_AUDIO_OFF':   { db.updateGroup(groupJid, { anti_audio: 0 });    await send(sock, groupJid, '✅ تم فتح الصوتيات');               return true; }
    case 'ANTI_GIF_ON':      { db.updateGroup(groupJid, { anti_gif: 1 });      await send(sock, groupJid, '✅ تم قفل الجيفات');                return true; }
    case 'ANTI_GIF_OFF':     { db.updateGroup(groupJid, { anti_gif: 0 });      await send(sock, groupJid, '✅ تم فتح الجيفات');                return true; }
    case 'ANTI_CONTACT_ON':  { db.updateGroup(groupJid, { anti_contact: 1 });  await send(sock, groupJid, '✅ تم قفل جهات الاتصال');           return true; }
    case 'ANTI_CONTACT_OFF': { db.updateGroup(groupJid, { anti_contact: 0 });  await send(sock, groupJid, '✅ تم فتح جهات الاتصال');           return true; }
    case 'ANTI_LOCATION_ON': { db.updateGroup(groupJid, { anti_location: 1 }); await send(sock, groupJid, '✅ تم قفل المواقع');                return true; }
    case 'ANTI_LOCATION_OFF':{ db.updateGroup(groupJid, { anti_location: 0 }); await send(sock, groupJid, '✅ تم فتح المواقع');                return true; }
    case 'ANTI_WORD_ON':     { db.updateGroup(groupJid, { anti_word: 1 });     await send(sock, groupJid, '✅ تم تفعيل فلتر الكلمات الممنوعة');  return true; }
    case 'ANTI_WORD_OFF':    { db.updateGroup(groupJid, { anti_word: 0 });     await send(sock, groupJid, '✅ تم تعطيل فلتر الكلمات الممنوعة'); return true; }
    case 'ANTI_FORWARD_ON':  { db.updateGroup(groupJid, { anti_forward: 1 });  await send(sock, groupJid, '✅ تم قفل التوجيه');                return true; }
    case 'ANTI_FORWARD_OFF': { db.updateGroup(groupJid, { anti_forward: 0 });  await send(sock, groupJid, '✅ تم فتح التوجيه');                return true; }

    // --- BANNED WORDS ---
    case 'ADD_BANNED_WORD': {
      const word = getCommandArg(text, 'ADD_BANNED_WORD').trim();
      if (!word) { await send(sock, groupJid, '❌ أرسل الكلمة الممنوعة'); return true; }
      db.addBannedWord(groupJid, word);
      invalidateBannedWordsCache(groupJid);
      await send(sock, groupJid, `✅ تمت إضافة الكلمة الممنوعة: ${word}`);
      return true;
    }
    case 'DELETE_BANNED_WORD': {
      const word = getCommandArg(text, 'DELETE_BANNED_WORD').trim();
      if (!word) { await send(sock, groupJid, '❌ أرسل الكلمة'); return true; }
      const changed = db.deleteBannedWord(groupJid, word);
      if (changed) invalidateBannedWordsCache(groupJid);
      await send(sock, groupJid, changed ? `✅ تم حذف الكلمة: ${word}` : `❌ الكلمة غير موجودة`);
      return true;
    }
    case 'SHOW_BANNED_WORDS': {
      const words = db.getBannedWords(groupJid);
      if (!words.length) { await send(sock, groupJid, `📋 لا توجد كلمات ممنوعة`); return true; }
      let txt = `🚫 الكلمات الممنوعة:\n`;
      words.forEach((w, i) => { txt += `\n${i + 1}- ${w.word}`; });
      await send(sock, groupJid, txt);
      return true;
    }

    // --- REPLIES ---
    case 'ADD_REPLY': {
      db.setPending(senderJid, groupJid, 'ADD_REPLY_TRIGGER');
      await send(sock, groupJid, `📝 أرسل كلمة التشغيل`);
      return true;
    }
    case 'DELETE_REPLY': {
      const trigger = getCommandArg(text, 'DELETE_REPLY').trim();
      if (!trigger) { await send(sock, groupJid, '❌ أرسل كلمة التشغيل'); return true; }
      const changed = db.deleteReply(groupJid, trigger);
      await send(sock, groupJid, changed ? `✅ تم حذف الرد` : `❌ الرد غير موجود`);
      return true;
    }
    case 'SHOW_REPLIES': {
      const replies = db.getReplies(groupJid);
      if (!replies.length) { await send(sock, groupJid, `📋 لا توجد ردود تلقائية`); return true; }
      let txt = `📋 الردود التلقائية:\n`;
      replies.forEach((r, i) => { txt += `\n${i + 1}- ${r.trigger} ← ${r.response.substring(0, 30)}`; });
      await send(sock, groupJid, txt);
      return true;
    }

    default:
      return false;
  }
}

module.exports = { handleAdminCommand };
