'use strict';

const db = require('../database/db');
const {
  SIG, normalizeJid, isOwnerJid,
  getMsgText, getMsgType, getMentions, getQuotedSender
} = require('../utils/helpers');
const { parseCommand } = require('../utils/commandParser');
const { checkSpam, isDuplicateCmd } = require('../systems/spam');
const { handleProtection } = require('./protection');
const { handleAdminCommand } = require('./adminCommands');
const { handleOwnerCommand, broadcastMessage } = require('./ownerCommands');
const { handleBotInfo, handleCommandsList, handleUserInfo } = require('./infoCommands');
const logger = require('../utils/logger');
const { TTLCache, register } = require('../utils/cache');

// Group settings cache — TTLCache مسجّل في نظام sweep (30 ثانية)
const groupCache = register(new TTLCache(30000));

function getCachedGroup(groupJid) {
  return groupCache.get(groupJid) ?? null;
}

function setCachedGroup(groupJid, data) {
  groupCache.set(groupJid, data);
}

function invalidateGroupCache(groupJid) {
  groupCache.invalidate(groupJid);
}

// Auto-replies cache (30 ثانية) — مسجّل في نظام sweep
const repliesCache = register(new TTLCache(30000));

function getCachedReplies(groupJid) {
  let replies = repliesCache.get(groupJid);
  if (!replies) {
    replies = db.getReplies(groupJid);
    repliesCache.set(groupJid, replies);
  }
  return replies;
}

function invalidateRepliesCache(groupJid) {
  repliesCache.invalidate(groupJid);
}

async function send(sock, jid, text) {
  try {
    await sock.sendMessage(jid, { text: text + SIG });
  } catch (e) {}
}

async function handleMessage(sock, msg) {
  try {
    if (!msg?.key || msg.key.fromMe) return;

    const remoteJid = msg.key.remoteJid;
    if (!remoteJid) return;

    const isGroup = remoteJid.endsWith('@g.us');
    const senderJid = normalizeJid(
      isGroup ? (msg.key.participant || msg.participant || '') : remoteJid
    );

    if (!senderJid) return;

    const text = getMsgText(msg);
    const msgType = getMsgType(msg);

    // Ignore protocol/ephemeral messages
    if (msgType === 'protocol' || msgType === 'ephemeral') return;

    // Check global ban - silently delete in groups
    if (db.isGlobalBanned(senderJid)) {
      if (isGroup) {
        try { await sock.sendMessage(remoteJid, { delete: msg.key }); } catch (e) {}
      }
      return;
    }

    // Check maintenance (only for non-owner)
    if (!isOwnerJid(senderJid)) {
      const maint = db.getMaintenanceState();
      if (maint?.enabled) {
        if (!isGroup) {
          await send(sock, remoteJid, `🔧 البوت في وضع الصيانة حالياً`);
        }
        return;
      }
    }

    // ===== DM / Owner commands =====
    if (!isGroup) {
      if (isOwnerJid(senderJid)) {
        const pending = db.getPending(senderJid, senderJid);
        if (pending && pending.action === 'BROADCAST' && text) {
          db.clearPending(senderJid, senderJid);
          await broadcastMessage(sock, senderJid, text);
          return;
        }

        const cmd = parseCommand(text);
        if (cmd) {
          const handled = await handleOwnerCommand(sock, msg, senderJid, text, cmd);
          if (handled) return;

          if (cmd === 'BOT_INFO') {
            await handleBotInfo(sock, senderJid);
            return;
          }
        }
      }
      return;
    }

    // ===== GROUP MESSAGES =====
    const groupJid = remoteJid;

    // Ensure group exists in DB (use cache)
    let group = getCachedGroup(groupJid);
    if (!group) {
      group = db.getGroup(groupJid);
      if (!group) group = db.upsertGroup(groupJid, '');
      if (group) setCachedGroup(groupJid, group);
    }

    // Get group metadata for admin check
    let groupMeta = null;
    let isAdmin = false;
    let isBotAdmin = false;
    try {
      groupMeta = await sock.groupMetadata(groupJid);
      if (groupMeta?.subject && group.name !== groupMeta.subject) {
        db.updateGroup(groupJid, { name: groupMeta.subject });
        group = db.getGroup(groupJid);
        setCachedGroup(groupJid, group);
      }
      const participants = groupMeta?.participants || [];
      const senderParticipant = participants.find(p => normalizeJid(p.id) === normalizeJid(senderJid));
      isAdmin = !!(senderParticipant?.admin);
      const botJid = normalizeJid(sock.user?.id || '');
      const botParticipant = participants.find(p => normalizeJid(p.id) === botJid);
      isBotAdmin = !!(botParticipant?.admin);
    } catch (e) {}

    // Upsert user
    db.upsertUser(senderJid, groupJid, '');
    try {
      db.getDb().prepare('UPDATE groups SET msg_count = msg_count + 1 WHERE jid = ?').run(groupJid);
    } catch (e) {}

    // Check if muted - delete messages silently
    if (db.isMuted(senderJid, groupJid) && !isAdmin) {
      try { await sock.sendMessage(groupJid, { delete: msg.key }); } catch (e) {}
      return;
    }

    // Check spam (non-admins only, text messages)
    if (!isAdmin && text && msgType === 'text') {
      const isSpam = checkSpam(senderJid, groupJid, text);
      if (isSpam) {
        const spamDuration = parseInt(process.env.SPAM_MUTE_DURATION || '3600');
        db.setMuted(senderJid, groupJid, 'system', Math.floor(Date.now() / 1000) + spamDuration);
        try { await sock.sendMessage(groupJid, { delete: msg.key }); } catch (e) {}
        await send(sock, groupJid, `⚠️ سبام\n\n🔇 تم كتم العضو لمدة ساعة`);
        return;
      }
    }

    // Handle pending admin actions
    if (isAdmin && text) {
      const pending = db.getPending(senderJid, groupJid);
      if (pending) {
        db.clearPending(senderJid, groupJid);
        switch (pending.action) {
          case 'ADD_RULE': {
            db.addRule(groupJid, text);
            await send(sock, groupJid, `✅ تمت إضافة القانون`);
            return;
          }
          case 'DELETE_RULE': {
            const id = parseInt(text.trim());
            if (id) {
              const changed = db.deleteRule(groupJid, id);
              await send(sock, groupJid, changed ? `✅ تم حذف القانون` : `❌ القانون غير موجود`);
            } else {
              await send(sock, groupJid, `❌ رقم غير صحيح`);
            }
            return;
          }
          case 'EDIT_RULE': {
            const parts = text.trim().split(' ');
            const id = parseInt(parts[0]);
            const newText = parts.slice(1).join(' ');
            if (id && newText) {
              const changed = db.updateRule(groupJid, id, newText);
              await send(sock, groupJid, changed ? `✅ تم تعديل القانون` : `❌ القانون غير موجود`);
            } else {
              await send(sock, groupJid, `❌ الصيغة: <رقم القانون> <النص الجديد>`);
            }
            return;
          }
          case 'ADD_WELCOME': {
            db.updateGroup(groupJid, { welcome_msg: text, welcome_enabled: 1 });
            invalidateGroupCache(groupJid);
            await send(sock, groupJid, `✅ تمت إضافة رسالة الترحيب`);
            return;
          }
          case 'ADD_REPLY_TRIGGER': {
            db.setPending(senderJid, groupJid, `ADD_REPLY_RESPONSE:${text.toLowerCase().trim()}`);
            await send(sock, groupJid, `📝 الآن أرسل الرد`);
            return;
          }
          default: {
            if (pending.action.startsWith('ADD_REPLY_RESPONSE:')) {
              const trigger = pending.action.split(':').slice(1).join(':');
              db.addReply(groupJid, trigger, text);
              invalidateRepliesCache(groupJid);
              await send(sock, groupJid, `✅ تمت إضافة الرد التلقائي`);
              return;
            }
          }
        }
      }
    }

    // Parse command
    const cmd = parseCommand(text);

    // ===== BOT INFO =====
    if (cmd === 'BOT_INFO') {
      await handleBotInfo(sock, groupJid);
      return;
    }

    // ===== COMMANDS LIST =====
    if (cmd === 'COMMANDS_LIST') {
      await handleCommandsList(sock, groupJid, isAdmin, group);
      return;
    }

    // ===== SHOW RULES (anyone can view) =====
    if (cmd === 'SHOW_RULES') {
      const rules = db.getRules(groupJid);
      if (!rules.length) {
        await send(sock, groupJid, `📜 لا توجد قوانين بعد`);
      } else {
        let txt = `📜 قوانين المجموعة:\n`;
        rules.forEach((r, i) => { txt += `\n${i + 1}- ${r.rule_text}`; });
        await send(sock, groupJid, txt);
      }
      return;
    }

    // ===== USER INFO (anyone can view) =====
    if (cmd === 'USER_INFO') {
      const mentions = getMentions(msg);
      const quoted = getQuotedSender(msg);
      let targetJid = null;
      if (mentions.length > 0) targetJid = normalizeJid(mentions[0]);
      else if (quoted) targetJid = normalizeJid(quoted);
      await handleUserInfo(sock, msg, groupJid, senderJid, targetJid, groupMeta);
      return;
    }

    // ===== Owner-only commands inside groups: fully silent, no reply =====
    const ownerOnlyCmds = [
      'OWNER_PANEL', 'BROADCAST', 'SHOW_GROUPS', 'MAINTENANCE_ON', 'MAINTENANCE_OFF',
      'BACKUP', 'RESTORE', 'RESTART', 'GLOBAL_BAN', 'GLOBAL_UNBAN', 'SEND_TO_GROUP'
    ];
    if (cmd && ownerOnlyCmds.includes(cmd)) {
      return;
    }

    // ===== ADMIN COMMANDS =====
    if (cmd && isAdmin) {
      if (isDuplicateCmd(senderJid, groupJid, cmd)) return;
      const adminHandled = await handleAdminCommand(sock, msg, groupJid, senderJid, text, cmd, groupMeta);
      if (adminHandled) {
        const groupModCmds = [
          'LOCK_CHAT','UNLOCK_CHAT',
          'ANTI_LINK_ON','ANTI_LINK_OFF','ANTI_IMAGE_ON','ANTI_IMAGE_OFF',
          'ANTI_VIDEO_ON','ANTI_VIDEO_OFF','ANTI_FILE_ON','ANTI_FILE_OFF',
          'ANTI_STICKER_ON','ANTI_STICKER_OFF','ANTI_AUDIO_ON','ANTI_AUDIO_OFF',
          'ANTI_GIF_ON','ANTI_GIF_OFF','ANTI_CONTACT_ON','ANTI_CONTACT_OFF',
          'ANTI_LOCATION_ON','ANTI_LOCATION_OFF','ANTI_WORD_ON','ANTI_WORD_OFF',
          'ANTI_FORWARD_ON','ANTI_FORWARD_OFF'
        ];
        if (groupModCmds.includes(cmd)) invalidateGroupCache(groupJid);
        if (cmd === 'DELETE_REPLY') invalidateRepliesCache(groupJid);
        return;
      }
    } else if (cmd && !isAdmin) {
      const adminCmds = [
        'KICK','PROMOTE','DEMOTE','MUTE','UNMUTE','WARN','SHOW_WARNS','DELETE_WARN',
        'RESET_WARNS','ADD_RULE','DELETE_RULE','EDIT_RULE','ADD_WELCOME','DELETE_WELCOME',
        'LOCK_CHAT','UNLOCK_CHAT','PIN','UNPIN',
        'ANTI_LINK_ON','ANTI_LINK_OFF','ANTI_IMAGE_ON','ANTI_IMAGE_OFF',
        'ANTI_VIDEO_ON','ANTI_VIDEO_OFF','ANTI_FILE_ON','ANTI_FILE_OFF',
        'ANTI_STICKER_ON','ANTI_STICKER_OFF','ANTI_AUDIO_ON','ANTI_AUDIO_OFF',
        'ANTI_GIF_ON','ANTI_GIF_OFF','ANTI_CONTACT_ON','ANTI_CONTACT_OFF',
        'ANTI_LOCATION_ON','ANTI_LOCATION_OFF','ANTI_WORD_ON','ANTI_WORD_OFF',
        'ANTI_FORWARD_ON','ANTI_FORWARD_OFF','ADD_BANNED_WORD','DELETE_BANNED_WORD',
        'SHOW_BANNED_WORDS','ADD_REPLY','DELETE_REPLY'
      ];
      if (adminCmds.includes(cmd)) {
        await send(sock, groupJid, `❌ هذا الأمر للمشرفين فقط`);
        return;
      }
    }

    // ===== AUTO REPLIES =====
    if (text && msgType === 'text') {
      const replies = getCachedReplies(groupJid);
      const lc = text.toLowerCase().trim();
      for (const r of replies) {
        if (lc === r.trigger || lc.includes(r.trigger)) {
          await send(sock, groupJid, r.response);
          return;
        }
      }
    }

    // ===== PROTECTION =====
    if (isBotAdmin) {
      const freshGroup = db.getGroup(groupJid) || group;
      await handleProtection(sock, msg, freshGroup, senderJid, isAdmin);
    }

  } catch (e) {
    logger.error('Message handler error', { error: e.message, stack: e.stack });
  }
}

module.exports = { handleMessage };
