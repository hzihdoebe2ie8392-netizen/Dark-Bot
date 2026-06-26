'use strict';

const db = require('../database/db');
const { SIG, normalizeJid, isOwnerJid, getMentions, getQuotedSender } = require('../utils/helpers');
const { getCommandArg } = require('../utils/commandParser');
const logger = require('../utils/logger');

async function send(sock, jid, text) {
  try {
    await sock.sendMessage(jid, { text: text + SIG });
  } catch (e) {}
}

function resolveTarget(msg, text, cmd) {
  const mentions = getMentions(msg);
  if (mentions.length > 0) return normalizeJid(mentions[0]);
  const quoted = getQuotedSender(msg);
  if (quoted) return normalizeJid(quoted);
  const arg = getCommandArg(text, cmd);
  const match = arg.match(/\d{7,15}/);
  if (match) return `${match[0]}@s.whatsapp.net`;
  return null;
}

async function handleOwnerCommand(sock, msg, senderJid, text, cmd) {
  // التحقق من هوية المالك - حماية مزدوجة
  if (!isOwnerJid(senderJid)) return false;

  switch (cmd) {
    // --- OWNER PANEL ---
    case 'OWNER_PANEL': {
      const stats = db.getStats();
      const maintenance = db.getMaintenanceState();
      const maintStatus = maintenance?.enabled ? '🟡 مفعلة' : '🟢 معطلة';
      const panel = `👑 لوحة تحكم Dark Bot

📊 الإحصائيات:

• عدد الجروبات: ${stats.groups}
• عدد الأعضاء: ${stats.users}
• عدد التحذيرات: ${stats.warnings}
• عدد المكتومين: ${stats.muted}
• عدد الردود: ${stats.replies}
• المحظورون عالمياً: ${stats.globalBanned}

⚙️ حالة الصيانة:
${maintStatus}`;
      await send(sock, senderJid, panel);
      return true;
    }

    // --- BROADCAST ---
    case 'BROADCAST': {
      const message = getCommandArg(text, 'BROADCAST').trim();
      if (!message) {
        db.setPending(senderJid, senderJid, 'BROADCAST');
        await send(sock, senderJid, `📢 أرسل رسالة الإذاعة الآن`);
        return true;
      }
      await broadcastMessage(sock, senderJid, message);
      return true;
    }

    // --- SHOW GROUPS ---
    case 'SHOW_GROUPS': {
      const groups = db.getAllGroups();
      if (!groups.length) { await send(sock, senderJid, '📋 لا توجد مجموعات'); return true; }
      let txt = `📋 المجموعات (${groups.length}):\n`;
      groups.forEach((g, i) => {
        txt += `\n${i + 1}- ${g.name || 'بدون اسم'}`;
        txt += `\n   🔒 ${g.is_locked ? 'مقفل' : 'مفتوح'} | الرسائل: ${g.msg_count}`;
      });
      await send(sock, senderJid, txt);
      return true;
    }

    // --- MAINTENANCE ON/OFF ---
    case 'MAINTENANCE_ON': {
      db.setMaintenance(true);
      await send(sock, senderJid, `🟡 تم تفعيل وضع الصيانة`);
      return true;
    }
    case 'MAINTENANCE_OFF': {
      db.setMaintenance(false);
      await send(sock, senderJid, `🟢 تم تعطيل وضع الصيانة`);
      return true;
    }

    // --- BACKUP ---
    case 'BACKUP': {
      try {
        const { backupPath } = db.createBackup(); // WAL checkpoint داخل createBackup
        logger.info(`Backup created: ${backupPath}`);
        await send(sock, senderJid, `✅ تم إنشاء نسخة احتياطية بنجاح`);
      } catch (e) {
        logger.error('Backup failed', { message: e.message, stack: e.stack });
        await send(sock, senderJid, `❌ فشل إنشاء النسخة الاحتياطية`);
      }
      return true;
    }

    // --- RESTORE ---
    case 'RESTORE': {
      try {
        const backups = db.listBackups();
        if (!backups.length) {
          await send(sock, senderJid, `❌ لا توجد نسخ احتياطية`);
          return true;
        }
        const arg = getCommandArg(text, 'RESTORE').trim();
        let targetPath = backups[0]; // الأحدث افتراضياً

        if (arg) {
          const idx = parseInt(arg);
          if (!isNaN(idx) && idx >= 1 && idx <= backups.length) {
            targetPath = backups[idx - 1];
          } else {
            await send(sock, senderJid, `❌ رقم النسخة غير صحيح. المتاح: 1 - ${backups.length}`);
            return true;
          }
        }

        await send(sock, senderJid, `♻️ جاري استعادة النسخة الاحتياطية وإعادة التشغيل...`);
        logger.info(`Restoring backup: ${targetPath}`);
        db.restoreBackup(targetPath);
      } catch (e) {
        logger.error('Restore failed', { message: e.message, stack: e.stack });
        await send(sock, senderJid, `❌ فشل استعادة النسخة الاحتياطية: ${e.message}`);
      }
      return true;
    }

    // --- RESTART ---
    case 'RESTART': {
      await send(sock, senderJid, `🔄 جاري إعادة التشغيل...`);
      setTimeout(() => process.exit(0), 1000);
      return true;
    }

    // --- GLOBAL BAN ---
    case 'GLOBAL_BAN': {
      const target = resolveTarget(msg, text, 'GLOBAL_BAN');
      if (!target) { await send(sock, senderJid, '❌ أرسل رقم المستخدم أو استخدم الرد/المنشن'); return true; }
      const phone = target.split('@')[0];
      db.globalBan(normalizeJid(target), 'owner ban');
      await send(sock, senderJid, `🚫 تم الحظر العالمي للمستخدم: ${phone}`);
      return true;
    }

    // --- GLOBAL UNBAN ---
    case 'GLOBAL_UNBAN': {
      const target = resolveTarget(msg, text, 'GLOBAL_UNBAN');
      if (!target) { await send(sock, senderJid, '❌ أرسل رقم المستخدم أو استخدم الرد/المنشن'); return true; }
      const phone = target.split('@')[0];
      db.globalUnban(normalizeJid(target));
      await send(sock, senderJid, `✅ تم فك الحظر عن: ${phone}`);
      return true;
    }

    // --- SEND TO GROUP ---
    case 'SEND_TO_GROUP': {
      const arg = getCommandArg(text, 'SEND_TO_GROUP').trim();
      const parts = arg.split(' ');
      if (parts.length < 2) {
        await send(sock, senderJid, '❌ الصيغة: ارسل لجروب <رقم الجروب> <الرسالة>');
        return true;
      }
      const groups = db.getAllGroups();
      const idx = parseInt(parts[0]);
      let targetGroup = null;
      if (!isNaN(idx) && idx > 0 && idx <= groups.length) {
        targetGroup = groups[idx - 1];
      } else {
        targetGroup = groups.find(g => g.jid === parts[0] || g.name === parts[0]);
      }
      if (!targetGroup) { await send(sock, senderJid, '❌ الجروب غير موجود'); return true; }
      const message = parts.slice(1).join(' ');
      await sock.sendMessage(targetGroup.jid, { text: message + SIG });
      await send(sock, senderJid, `✅ تم الإرسال إلى: ${targetGroup.name || targetGroup.jid}`);
      return true;
    }

    default:
      return false;
  }
}

async function broadcastMessage(sock, senderJid, message) {
  const groups = db.getAllGroups();
  let success = 0, failed = 0;
  for (const g of groups) {
    try {
      await sock.sendMessage(g.jid, { text: `📢 إذاعة\n\n${message}${SIG}` });
      success++;
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      failed++;
    }
  }
  await send(sock, senderJid, `✅ تمت الإذاعة\n✔️ نجح: ${success}\n❌ فشل: ${failed}`);
}

module.exports = { handleOwnerCommand, broadcastMessage };
