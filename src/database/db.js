'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db;

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

function initDatabase(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('cache_size = -8000'); // 8MB cache

  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      jid TEXT PRIMARY KEY,
      name TEXT,
      is_locked INTEGER DEFAULT 0,
      welcome_enabled INTEGER DEFAULT 1,
      welcome_msg TEXT,
      anti_link INTEGER DEFAULT 0,
      anti_image INTEGER DEFAULT 0,
      anti_video INTEGER DEFAULT 0,
      anti_file INTEGER DEFAULT 0,
      anti_sticker INTEGER DEFAULT 0,
      anti_audio INTEGER DEFAULT 0,
      anti_gif INTEGER DEFAULT 0,
      anti_contact INTEGER DEFAULT 0,
      anti_location INTEGER DEFAULT 0,
      anti_word INTEGER DEFAULT 0,
      anti_forward INTEGER DEFAULT 0,
      maintenance INTEGER DEFAULT 0,
      msg_count INTEGER DEFAULT 0,
      joined_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      jid TEXT NOT NULL,
      group_jid TEXT NOT NULL,
      name TEXT,
      is_muted INTEGER DEFAULT 0,
      mute_until INTEGER DEFAULT 0,
      warn_count INTEGER DEFAULT 0,
      msg_count INTEGER DEFAULT 0,
      PRIMARY KEY (jid, group_jid)
    );

    CREATE TABLE IF NOT EXISTS warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_jid TEXT NOT NULL,
      group_jid TEXT NOT NULL,
      reason TEXT,
      admin_jid TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS muted (
      user_jid TEXT NOT NULL,
      group_jid TEXT NOT NULL,
      muted_by TEXT,
      mute_until INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY (user_jid, group_jid)
    );

    CREATE TABLE IF NOT EXISTS rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_jid TEXT NOT NULL,
      rule_text TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_jid TEXT NOT NULL,
      trigger TEXT NOT NULL,
      response TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS custom_commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_jid TEXT NOT NULL,
      command TEXT NOT NULL,
      response TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS banned_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_jid TEXT NOT NULL,
      word TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_jid TEXT NOT NULL,
      admin_jid TEXT NOT NULL,
      action TEXT NOT NULL,
      target_jid TEXT,
      details TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS global_banned (
      user_jid TEXT PRIMARY KEY,
      reason TEXT,
      banned_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS maintenance (
      id INTEGER PRIMARY KEY DEFAULT 1,
      enabled INTEGER DEFAULT 0,
      msg TEXT DEFAULT 'البوت في وضع الصيانة حالياً'
    );

    CREATE TABLE IF NOT EXISTS pending_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_jid TEXT NOT NULL,
      group_jid TEXT NOT NULL,
      action TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    INSERT OR IGNORE INTO maintenance (id, enabled) VALUES (1, 0);

    CREATE INDEX IF NOT EXISTS idx_warnings_user_group ON warnings(user_jid, group_jid);
    CREATE INDEX IF NOT EXISTS idx_muted_group ON muted(group_jid);
    CREATE INDEX IF NOT EXISTS idx_rules_group ON rules(group_jid);
    CREATE INDEX IF NOT EXISTS idx_replies_group ON replies(group_jid);
    CREATE INDEX IF NOT EXISTS idx_banned_words_group ON banned_words(group_jid);
    CREATE INDEX IF NOT EXISTS idx_admin_logs_group ON admin_logs(group_jid);
  `);

  return db;
}

// Groups
function getGroup(jid) {
  return getDb().prepare('SELECT * FROM groups WHERE jid = ?').get(jid);
}

function upsertGroup(jid, name) {
  getDb().prepare('INSERT OR IGNORE INTO groups (jid, name) VALUES (?, ?)').run(jid, name || '');
  if (name) getDb().prepare('UPDATE groups SET name = ? WHERE jid = ?').run(name, jid);
  return getGroup(jid);
}

function updateGroup(jid, updates) {
  const keys = Object.keys(updates);
  if (!keys.length) return;
  const set = keys.map(k => `${k} = ?`).join(', ');
  getDb().prepare(`UPDATE groups SET ${set} WHERE jid = ?`).run(...keys.map(k => updates[k]), jid);
}

function getAllGroups() {
  return getDb().prepare('SELECT * FROM groups').all();
}

// Users
function getUser(userJid, groupJid) {
  return getDb().prepare('SELECT * FROM users WHERE jid = ? AND group_jid = ?').get(userJid, groupJid);
}

function upsertUser(userJid, groupJid, name) {
  getDb().prepare('INSERT OR IGNORE INTO users (jid, group_jid, name) VALUES (?, ?, ?)').run(userJid, groupJid, name || '');
  if (name) getDb().prepare('UPDATE users SET name = ? WHERE jid = ? AND group_jid = ?').run(name, userJid, groupJid);
}

function setMuted(userJid, groupJid, mutedBy, muteUntil) {
  getDb().prepare('INSERT OR REPLACE INTO muted (user_jid, group_jid, muted_by, mute_until) VALUES (?, ?, ?, ?)').run(userJid, groupJid, mutedBy, muteUntil);
  getDb().prepare('UPDATE users SET is_muted = 1, mute_until = ? WHERE jid = ? AND group_jid = ?').run(muteUntil, userJid, groupJid);
}

function unsetMuted(userJid, groupJid) {
  getDb().prepare('DELETE FROM muted WHERE user_jid = ? AND group_jid = ?').run(userJid, groupJid);
  getDb().prepare('UPDATE users SET is_muted = 0, mute_until = 0 WHERE jid = ? AND group_jid = ?').run(userJid, groupJid);
}

function isMuted(userJid, groupJid) {
  const now = Math.floor(Date.now() / 1000);
  const row = getDb().prepare('SELECT * FROM muted WHERE user_jid = ? AND group_jid = ?').get(userJid, groupJid);
  if (!row) return false;
  if (row.mute_until > 0 && row.mute_until <= now) {
    unsetMuted(userJid, groupJid);
    return false;
  }
  return true;
}

function getMutedList(groupJid) {
  return getDb().prepare('SELECT * FROM muted WHERE group_jid = ?').all(groupJid);
}

// Warnings
function addWarning(userJid, groupJid, adminJid, reason) {
  getDb().prepare('INSERT INTO warnings (user_jid, group_jid, admin_jid, reason) VALUES (?, ?, ?, ?)').run(userJid, groupJid, adminJid, reason || '');
  getDb().prepare('INSERT OR IGNORE INTO users (jid, group_jid) VALUES (?, ?)').run(userJid, groupJid);
  getDb().prepare('UPDATE users SET warn_count = warn_count + 1 WHERE jid = ? AND group_jid = ?').run(userJid, groupJid);
  const u = getUser(userJid, groupJid);
  return u ? u.warn_count : 1;
}

function getWarnings(userJid, groupJid) {
  return getDb().prepare('SELECT * FROM warnings WHERE user_jid = ? AND group_jid = ? ORDER BY created_at DESC').all(userJid, groupJid);
}

function deleteWarning(id) {
  getDb().prepare('DELETE FROM warnings WHERE id = ?').run(id);
}

function resetWarnings(userJid, groupJid) {
  getDb().prepare('DELETE FROM warnings WHERE user_jid = ? AND group_jid = ?').run(userJid, groupJid);
  getDb().prepare('UPDATE users SET warn_count = 0 WHERE jid = ? AND group_jid = ?').run(userJid, groupJid);
}

// Rules
function addRule(groupJid, text) {
  return getDb().prepare('INSERT INTO rules (group_jid, rule_text) VALUES (?, ?)').run(groupJid, text).lastInsertRowid;
}

function getRules(groupJid) {
  return getDb().prepare('SELECT * FROM rules WHERE group_jid = ? ORDER BY id ASC').all(groupJid);
}

function deleteRule(groupJid, id) {
  return getDb().prepare('DELETE FROM rules WHERE group_jid = ? AND id = ?').run(groupJid, id).changes;
}

function updateRule(groupJid, id, text) {
  return getDb().prepare('UPDATE rules SET rule_text = ? WHERE group_jid = ? AND id = ?').run(text, groupJid, id).changes;
}

// Replies
function addReply(groupJid, trigger, response) {
  return getDb().prepare('INSERT OR REPLACE INTO replies (group_jid, trigger, response) VALUES (?, ?, ?)').run(groupJid, trigger.toLowerCase(), response).lastInsertRowid;
}

function getReplies(groupJid) {
  return getDb().prepare('SELECT * FROM replies WHERE group_jid = ?').all(groupJid);
}

function deleteReply(groupJid, trigger) {
  return getDb().prepare('DELETE FROM replies WHERE group_jid = ? AND trigger = ?').run(groupJid, trigger.toLowerCase()).changes;
}

// Banned Words
function addBannedWord(groupJid, word) {
  return getDb().prepare('INSERT OR IGNORE INTO banned_words (group_jid, word) VALUES (?, ?)').run(groupJid, word.toLowerCase()).lastInsertRowid;
}

function getBannedWords(groupJid) {
  return getDb().prepare('SELECT * FROM banned_words WHERE group_jid = ?').all(groupJid);
}

function deleteBannedWord(groupJid, word) {
  return getDb().prepare('DELETE FROM banned_words WHERE group_jid = ? AND word = ?').run(groupJid, word.toLowerCase()).changes;
}

// Global Banned
function globalBan(userJid, reason) {
  getDb().prepare('INSERT OR REPLACE INTO global_banned (user_jid, reason) VALUES (?, ?)').run(userJid, reason || '');
}

function globalUnban(userJid) {
  getDb().prepare('DELETE FROM global_banned WHERE user_jid = ?').run(userJid);
}

function isGlobalBanned(userJid) {
  return !!getDb().prepare('SELECT 1 FROM global_banned WHERE user_jid = ?').get(userJid);
}

// Admin Logs
function addLog(groupJid, adminJid, action, targetJid, details) {
  getDb().prepare('INSERT INTO admin_logs (group_jid, admin_jid, action, target_jid, details) VALUES (?, ?, ?, ?, ?)').run(groupJid, adminJid, action, targetJid || '', details || '');
}

// Maintenance
function getMaintenanceState() {
  return getDb().prepare('SELECT enabled FROM maintenance WHERE id = 1').get();
}

function setMaintenance(enabled) {
  getDb().prepare('UPDATE maintenance SET enabled = ? WHERE id = 1').run(enabled ? 1 : 0);
}

// Pending Actions
function setPending(userJid, groupJid, action) {
  getDb().prepare('INSERT OR REPLACE INTO pending_actions (user_jid, group_jid, action) VALUES (?, ?, ?)').run(userJid, groupJid, action);
}

function getPending(userJid, groupJid) {
  return getDb().prepare('SELECT * FROM pending_actions WHERE user_jid = ? AND group_jid = ?').get(userJid, groupJid);
}

function clearPending(userJid, groupJid) {
  getDb().prepare('DELETE FROM pending_actions WHERE user_jid = ? AND group_jid = ?').run(userJid, groupJid);
}

// Stats
function getStats() {
  const d = getDb();
  return {
    groups: d.prepare('SELECT COUNT(*) as c FROM groups').get().c,
    users: d.prepare('SELECT COUNT(*) as c FROM users').get().c,
    warnings: d.prepare('SELECT COUNT(*) as c FROM warnings').get().c,
    muted: d.prepare('SELECT COUNT(*) as c FROM muted').get().c,
    replies: d.prepare('SELECT COUNT(*) as c FROM replies').get().c,
    commands: d.prepare('SELECT COUNT(*) as c FROM custom_commands').get().c,
    globalBanned: d.prepare('SELECT COUNT(*) as c FROM global_banned').get().c
  };
}

// Weekly cleanup - delete old logs, expired mutes, expired warnings, old backups
function weeklyCleanup() {
  const now = Math.floor(Date.now() / 1000);
  const d = getDb();

  // Delete logs older than 30 days
  const cutoff30 = now - 30 * 86400;
  d.prepare('DELETE FROM admin_logs WHERE created_at < ?').run(cutoff30);

  // Delete expired mutes
  d.prepare('DELETE FROM muted WHERE mute_until > 0 AND mute_until <= ?').run(now);
  d.prepare(`UPDATE users SET is_muted = 0, mute_until = 0 WHERE jid IN (
    SELECT jid FROM users WHERE is_muted = 1 AND mute_until > 0 AND mute_until <= ?
  )`).run(now);

  // Delete stale pending actions older than 1 day
  const cutoff1 = now - 86400;
  d.prepare('DELETE FROM pending_actions WHERE created_at < ?').run(cutoff1);

  // Enforce backup retention (keep last 3) on disk
  cleanupOldBackups();
}

// Remove old backup files, keeping only the most recent N (default 3)
function cleanupOldBackups(keep = 3) {
  try {
    const dbPath = path.resolve(process.env.DB_PATH || './data/dark_bot.db');
    const backupDir = path.join(path.dirname(dbPath), 'backups');
    if (!fs.existsSync(backupDir)) return;
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.db'))
      .sort()
      .reverse();
    for (const old of backups.slice(keep)) {
      try { fs.unlinkSync(path.join(backupDir, old)); } catch (e) {}
    }
  } catch (e) {}
}

/**
 * إنشاء نسخة احتياطية مع WAL checkpoint قبلها.
 * @returns {{ backupPath: string, ts: string }}
 */
function createBackup() {
  const dbPath = path.resolve(process.env.DB_PATH || './data/dark_bot.db');
  const backupDir = path.join(path.dirname(dbPath), 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  // WAL checkpoint قبل النسخ لضمان اكتمال البيانات
  getDb().pragma('wal_checkpoint(TRUNCATE)');

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `backup_${ts}.db`);
  fs.copyFileSync(dbPath, backupPath);
  cleanupOldBackups();
  return { backupPath, ts };
}

/**
 * استعادة نسخة احتياطية.
 * يُغلق قاعدة البيانات، يستبدل الملف، ثم يعيد التشغيل.
 * @param {string} backupPath - مسار ملف النسخة الاحتياطية
 */
function restoreBackup(backupPath) {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }
  const dbPath = path.resolve(process.env.DB_PATH || './data/dark_bot.db');

  // إغلاق قاعدة البيانات
  if (db) {
    try { db.close(); } catch (e) {}
    db = null;
  }

  // استبدال الملف
  fs.copyFileSync(backupPath, dbPath);

  // إعادة التشغيل
  setTimeout(() => process.exit(0), 500);
}

/**
 * إرجاع قائمة بملفات النسخ الاحتياطية مرتبة (الأحدث أولاً).
 */
function listBackups() {
  const dbPath = path.resolve(process.env.DB_PATH || './data/dark_bot.db');
  const backupDir = path.join(path.dirname(dbPath), 'backups');
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.db'))
    .sort()
    .reverse()
    .map(f => path.join(backupDir, f));
}

module.exports = {
  initDatabase, getDb,
  getGroup, upsertGroup, updateGroup, getAllGroups,
  getUser, upsertUser,
  setMuted, unsetMuted, isMuted, getMutedList,
  addWarning, getWarnings, deleteWarning, resetWarnings,
  addRule, getRules, deleteRule, updateRule,
  addReply, getReplies, deleteReply,
  addBannedWord, getBannedWords, deleteBannedWord,
  globalBan, globalUnban, isGlobalBanned,
  addLog,
  getMaintenanceState, setMaintenance,
  setPending, getPending, clearPending,
  getStats, weeklyCleanup, cleanupOldBackups,
  createBackup, restoreBackup, listBackups
};
