'use strict';

const db = require('../database/db');
const { SIG, normalizeJid } = require('../utils/helpers');
const { kickGlobalBannedMember } = require('../utils/globalBan');
const logger = require('../utils/logger');

async function handleGroupUpdate(sock, update) {
  try {
    const { id: groupJid, participants, action } = update;
    if (!groupJid || !participants) return;

    const group = db.getGroup(groupJid);

    if (action === 'add') {
      for (const participant of participants) {
        const jid = normalizeJid(participant);
        db.upsertUser(jid, groupJid, '');

        // ① الحظر العالمي عند دخول عضو جديد
        if (db.isGlobalBanned(jid)) {
          await kickGlobalBannedMember(sock, groupJid, jid, 'on-join');
          continue;
        }

        // ② رسالة الترحيب - تدعم {الاسم} و{الجروب}
        if (group && group.welcome_enabled) {
          const rules = db.getRules(groupJid);
          let welcomeMsg = '';

          const memberPhone = jid.split('@')[0];
          const groupName = group.name || '';

          if (group.welcome_msg) {
            welcomeMsg = group.welcome_msg
              .replace(/\{الاسم\}/g, `@${memberPhone}`)
              .replace(/\{الجروب\}/g, groupName);
          } else {
            welcomeMsg = `👋 مرحباً بك يا @${memberPhone}`;
          }

          // ③ إظهار القوانين عند الدخول
          if (rules.length) {
            welcomeMsg += `\n\n📜 قوانين المجموعة:\n`;
            rules.forEach((r, i) => { welcomeMsg += `\n${i + 1}- ${r.rule_text}`; });
          }

          try {
            await sock.sendMessage(groupJid, {
              text: welcomeMsg + SIG,
              mentions: [jid]
            });
          } catch (e) {}
        }
      }
    }
  } catch (e) {
    logger.error('Group update error', { message: e.message, stack: e.stack });
  }
}

async function handleGroupJoin(sock, groupJid, groupMeta) {
  try {
    db.upsertGroup(groupJid, groupMeta?.subject || '');
    const botJid = sock.user?.id;
    if (!botJid) return;

    const participants = groupMeta?.participants || [];

    // ④ فحص الحظر العالمي عند إضافة البوت لجروب جديد
    for (const p of participants) {
      const pJid = normalizeJid(p.id);
      if (pJid && normalizeJid(botJid) !== pJid && db.isGlobalBanned(pJid)) {
        await kickGlobalBannedMember(sock, groupJid, pJid, 'on-join scan');
      }
    }

    const botInGroup = participants.find(p => normalizeJid(p.id) === normalizeJid(botJid));
    const isAdmin = botInGroup?.admin;

    if (!isAdmin) {
      await sock.sendMessage(groupJid, {
        text: `⚠️ يرجى رفع البوت مشرفاً لتفعيل جميع الأنظمة${SIG}`
      });
    } else {
      await sock.sendMessage(groupJid, {
        text: `✅ تم تفعيل بوت Dark بنجاح! 🛡️\n\nأنا الآن أعمل لحماية وإدارة مجموعتكم 24/7.${SIG}`
      });
    }
  } catch (e) {
    logger.error('Group join error', { message: e.message, stack: e.stack });
  }
}

async function handleAdminPromotion(sock, groupJid) {
  try {
    await sock.sendMessage(groupJid, {
      text: `✅ تم تفعيل بوت Dark بنجاح! 🛡️\n\nأنا الآن أعمل لحماية وإدارة مجموعتكم 24/7.${SIG}`
    });
  } catch (e) {}
}

module.exports = { handleGroupUpdate, handleGroupJoin, handleAdminPromotion };
