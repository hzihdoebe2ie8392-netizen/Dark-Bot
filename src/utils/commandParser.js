'use strict';

const COMMANDS = {
  // --- Info commands ---
  BOT_INFO: [
    'بوت', 'البوت', 'دارك', 'دارك بوت', 'معلومات البوت', 'من انت',
    'من أنت', 'info', 'about', 'bot'
  ],
  COMMANDS_LIST: [
    'الأوامر', 'الاوامر', 'اوامر', 'أوامر', 'مساعدة', 'مساعده', 'منيو',
    'menu', 'help', 'اوامر البوت', 'أوامر البوت'
  ],
  USER_INFO: [
    'بيانات', 'معرف', 'ايدي', 'معلومات', 'id', 'userinfo', 'user info', 'من هو', 'منو'
  ],
  // --- Admin commands ---
  KICK: [
    'طرد', 'اطرد', 'اطردو', 'شوت', 'برا', 'اخرج', 'ابعده', 'شيلو', 'شيله',
    'ارمي', 'ارميه', 'kick', 'remove', 'طرده', 'أطرد', 'أطرده'
  ],
  PROMOTE: [
    'رفع', 'ارفع', 'ارفعه', 'admin', 'promote', 'ادمن', 'مشرف', 'ترقية'
  ],
  DEMOTE: [
    'تنزيل', 'نزل', 'نزله', 'انزله', 'demote', 'سحب الصلاحيات', 'شيل ادمنه'
  ],
  MUTE: [
    'كتم', 'اكتم', 'اكتمه', 'اكتمو', 'صمت', 'اصمته', 'mute', 'اسكته',
    'اسكت', 'اسكاته', 'اخرس'
  ],
  UNMUTE: [
    'فك كتم', 'فك الكتم', 'الغاء كتم', 'إلغاء كتم', 'رفع الكتم',
    'رفع كتم', 'unmute', 'فك صمت', 'فك عنه الكتم', 'نشط', 'الغاء الكتم'
  ],
  WARN: [
    'تحذير', 'حذر', 'انذار', 'إنذار', 'انذر', 'warn', 'حذره', 'اعطه تحذير'
  ],
  SHOW_WARNS: [
    'عرض التحذيرات', 'تحذيرات', 'التحذيرات', 'warns', 'show warns', 'warnings', 'تحذيراته'
  ],
  DELETE_WARN: [
    'حذف تحذير', 'احذف تحذير', 'مسح تحذير', 'delete warn', 'شيل التحذير', 'delwarn'
  ],
  RESET_WARNS: [
    'تصفير التحذيرات', 'مسح التحذيرات', 'حذف التحذيرات',
    'reset warns', 'تصفير', 'صفر تحذيراته', 'resetwarn'
  ],
  // --- Rules ---
  ADD_RULE: [
    'اضف قانون', 'أضف قانون', 'حط قانون', 'قانون جديد', 'ضيف قانون',
    'add rule', 'زيد قانون'
  ],
  DELETE_RULE: [
    'حذف قانون', 'احذف قانون', 'مسح قانون', 'delete rule',
    'شيل قانون', 'حذف القانون'
  ],
  EDIT_RULE: [
    'تعديل قانون', 'عدل قانون', 'غير قانون', 'edit rule', 'تعديل القانون'
  ],
  SHOW_RULES: [
    'القوانين', 'قوانين', 'الأنظمة', 'rules', 'show rules', 'عرض القوانين'
  ],
  // --- Welcome ---
  ADD_WELCOME: [
    'اضف ترحيب', 'أضف ترحيب', 'ضيف ترحيب', 'add welcome',
    'فعل الترحيب', 'تفعيل ترحيب', 'اضف رسالة ترحيب', 'حط ترحيب'
  ],
  DELETE_WELCOME: [
    'احذف ترحيب', 'حذف ترحيب', 'delete welcome', 'مسح ترحيب',
    'عطل الترحيب', 'تعطيل ترحيب', 'ايقاف الترحيب'
  ],
  // --- Protection toggles ---
  ANTI_LINK_ON: [
    'قفل الروابط', 'اقفل الروابط', 'منع الروابط', 'امنع الروابط',
    'anti link on', 'antilink on', 'ايقاف الروابط'
  ],
  ANTI_LINK_OFF: [
    'فتح الروابط', 'افتح الروابط', 'السماح بالروابط', 'الغاء قفل الروابط',
    'anti link off', 'antilink off', 'فك الروابط'
  ],
  ANTI_IMAGE_ON: [
    'قفل الصور', 'اقفل الصور', 'منع الصور', 'anti image on', 'ايقاف الصور'
  ],
  ANTI_IMAGE_OFF: [
    'فتح الصور', 'افتح الصور', 'السماح بالصور', 'anti image off', 'فك قفل الصور'
  ],
  ANTI_VIDEO_ON: [
    'قفل الفيديو', 'اقفل الفيديو', 'منع الفيديو', 'anti video on',
    'ايقاف الفيديو', 'قفل الفيديوهات'
  ],
  ANTI_VIDEO_OFF: [
    'فتح الفيديو', 'افتح الفيديو', 'السماح بالفيديو', 'anti video off', 'فك قفل الفيديو'
  ],
  ANTI_FILE_ON: [
    'قفل الملفات', 'اقفل الملفات', 'منع الملفات', 'anti file on', 'ايقاف الملفات'
  ],
  ANTI_FILE_OFF: [
    'فتح الملفات', 'افتح الملفات', 'السماح بالملفات', 'anti file off', 'فك قفل الملفات'
  ],
  ANTI_STICKER_ON: [
    'قفل الملصقات', 'اقفل الملصقات', 'منع الملصقات', 'anti sticker on',
    'ايقاف الملصقات', 'قفل الستيكر'
  ],
  ANTI_STICKER_OFF: [
    'فتح الملصقات', 'افتح الملصقات', 'السماح بالملصقات', 'anti sticker off'
  ],
  ANTI_AUDIO_ON: [
    'قفل الصوتيات', 'اقفل الصوتيات', 'منع الصوتيات', 'anti audio on',
    'ايقاف الصوتيات', 'قفل الاصوات'
  ],
  ANTI_AUDIO_OFF: [
    'فتح الصوتيات', 'افتح الصوتيات', 'السماح بالصوتيات', 'anti audio off'
  ],
  ANTI_GIF_ON: [
    'قفل الجيفات', 'اقفل الجيفات', 'منع الجيفات', 'anti gif on', 'ايقاف الجيفات'
  ],
  ANTI_GIF_OFF: [
    'فتح الجيفات', 'افتح الجيفات', 'السماح بالجيفات', 'anti gif off'
  ],
  ANTI_CONTACT_ON: [
    'قفل جهات الاتصال', 'اقفل جهات الاتصال', 'منع جهات الاتصال',
    'anti contact on', 'ايقاف جهات الاتصال'
  ],
  ANTI_CONTACT_OFF: [
    'فتح جهات الاتصال', 'افتح جهات الاتصال', 'السماح بجهات الاتصال', 'anti contact off'
  ],
  ANTI_LOCATION_ON: [
    'قفل المواقع', 'اقفل المواقع', 'منع المواقع', 'anti location on', 'ايقاف المواقع'
  ],
  ANTI_LOCATION_OFF: [
    'فتح المواقع', 'افتح المواقع', 'السماح بالمواقع', 'anti location off'
  ],
  ANTI_WORD_ON: [
    'تفعيل الكلمات الممنوعة', 'تفعيل فلتر الكلمات', 'anti word on', 'فلتر الكلمات'
  ],
  ANTI_WORD_OFF: [
    'تعطيل الكلمات الممنوعة', 'تعطيل فلتر الكلمات', 'anti word off', 'تعطيل الفلتر'
  ],
  ANTI_FORWARD_ON: [
    'قفل التوجيه', 'اقفل التوجيه', 'منع التوجيه', 'anti forward on',
    'ايقاف التوجيه', 'قفل الفوروارد'
  ],
  ANTI_FORWARD_OFF: [
    'فتح التوجيه', 'افتح التوجيه', 'السماح بالتوجيه', 'anti forward off', 'فك التوجيه'
  ],
  ADD_BANNED_WORD: [
    'اضف كلمة ممنوعة', 'أضف كلمة ممنوعة', 'حط كلمة ممنوعة',
    'add banned word', 'احجب كلمة', 'امنع كلمة'
  ],
  DELETE_BANNED_WORD: [
    'احذف كلمة ممنوعة', 'حذف كلمة ممنوعة', 'delete banned word', 'شيل كلمة ممنوعة'
  ],
  SHOW_BANNED_WORDS: [
    'الكلمات الممنوعة', 'كلمات ممنوعة', 'banned words', 'عرض الكلمات الممنوعة'
  ],
  // --- Chat lock ---
  LOCK_CHAT: [
    'قفل الشات', 'اقفل الشات', 'اغلق الشات', 'اغلاق الشات', 'منع الكتابة',
    'lock chat', 'اقفل المجموعة', 'مشرفين فقط'
  ],
  UNLOCK_CHAT: [
    'فتح الشات', 'افتح الشات', 'الغاء قفل الشات', 'إلغاء قفل الشات',
    'unlock chat', 'افتح المجموعة', 'فك قفل الشات'
  ],
  // --- Pin ---
  PIN: [
    'تثبيت', 'ثبت', 'تثبيت الرسالة', 'pin', 'ثبتها', 'اثبت'
  ],
  UNPIN: [
    'الغاء تثبيت', 'إلغاء تثبيت', 'فك تثبيت', 'الغاء التثبيت', 'إلغاء التثبيت',
    'unpin', 'فك التثبيت'
  ],
  // --- Replies ---
  ADD_REPLY: [
    'اضف رد', 'أضف رد', 'حط رد', 'رد جديد', 'add reply', 'ضيف رد'
  ],
  DELETE_REPLY: [
    'احذف رد', 'حذف رد', 'مسح رد', 'delete reply', 'شيل رد'
  ],
  SHOW_REPLIES: [
    'الردود', 'ردود', 'الردود التلقائية', 'replies', 'show replies', 'عرض الردود'
  ],
  // --- Owner commands (DM only) ---
  OWNER_PANEL: [
    'المالك', 'لوحة المالك', 'owner', 'لوحة التحكم', 'owner panel', 'panel'
  ],
  BROADCAST: [
    'إذاعة', 'اذاعة', 'نشر', 'broadcast', 'ارسل للكل', 'بث'
  ],
  SHOW_GROUPS: [
    'الجروبات', 'المجموعات', 'groups', 'show groups', 'قائمة الجروبات'
  ],
  MAINTENANCE_ON: [
    'صيانة', 'تشغيل الصيانة', 'maintenance on', 'تفعيل الصيانة'
  ],
  MAINTENANCE_OFF: [
    'ايقاف الصيانة', 'إيقاف الصيانة', 'maintenance off', 'تعطيل الصيانة'
  ],
  BACKUP: [
    'نسخة احتياطية', 'backup', 'نسخ احتياطي', 'بكاب', 'نسخة'
  ],
  RESTORE: [
    'استعادة نسخة', 'استرجاع نسخة', 'restore', 'ريستور', 'استعادة', 'استرجاع'
  ],
  RESTART: [
    'إعادة تشغيل', 'اعادة تشغيل', 'restart', 'ريستارت', 'اعد التشغيل'
  ],
  GLOBAL_BAN: [
    'حظر', 'ban', 'حجب', 'منع عالمي', 'حظر عالمي', 'global ban'
  ],
  GLOBAL_UNBAN: [
    'فك حظر', 'unban', 'الغاء حظر', 'إلغاء حظر', 'رفع الحظر', 'global unban'
  ],
  SEND_TO_GROUP: [
    'ارسل لجروب', 'أرسل لجروب', 'send to group'
  ]
};

// Build reverse lookup map - longer triggers first to avoid prefix conflicts
const commandMap = new Map();
const sortedEntries = Object.entries(COMMANDS).flatMap(([cmd, triggers]) =>
  triggers.map(trigger => ({ cmd, trigger: trigger.toLowerCase().trim() }))
).sort((a, b) => b.trigger.length - a.trigger.length);

for (const { cmd, trigger } of sortedEntries) {
  if (!commandMap.has(trigger)) commandMap.set(trigger, cmd);
}

function parseCommand(text) {
  if (!text) return null;
  const normalized = text.toLowerCase().trim()
    .replace(/\u200f|\u200e|\u200b/g, '')
    .replace(/\s+/g, ' ');

  // Exact match first
  if (commandMap.has(normalized)) return commandMap.get(normalized);

  // Prefix match (command with arguments)
  for (const [trigger, cmd] of commandMap.entries()) {
    if (normalized.startsWith(trigger + ' ')) return cmd;
  }

  return null;
}

function getCommandArg(text, cmd) {
  const normalized = text.toLowerCase().trim()
    .replace(/\u200f|\u200e|\u200b/g, '')
    .replace(/\s+/g, ' ');
  const triggers = [...(COMMANDS[cmd] || [])].sort((a, b) => b.length - a.length);
  for (const trigger of triggers) {
    const t = trigger.toLowerCase().trim();
    if (normalized.startsWith(t + ' ')) {
      return text.trim().slice(trigger.length).trim();
    }
    if (normalized === t) return '';
  }
  return '';
}

module.exports = { parseCommand, getCommandArg, COMMANDS };
