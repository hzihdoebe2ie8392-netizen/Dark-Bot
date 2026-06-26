'use strict';

// In-memory spam tracker
const spamMap = new Map();
const SPAM_LIMIT = parseInt(process.env.SPAM_LIMIT || '3');
const SPAM_WINDOW = 10000; // 10 seconds

// Command dedup cache: key -> timestamp
const cmdCache = new Map();
const CMD_TTL = 3000; // 3 seconds

function checkSpam(userJid, groupJid, text) {
  const key = `${userJid}:${groupJid}`;
  const now = Date.now();
  const entry = spamMap.get(key);

  if (!entry || entry.lastText !== text) {
    spamMap.set(key, { texts: [now], count: 1, lastText: text });
    return false;
  }

  // Same text - filter old timestamps
  entry.texts = entry.texts.filter(t => now - t < SPAM_WINDOW);
  entry.texts.push(now);
  entry.count = entry.texts.length;
  spamMap.set(key, entry);

  if (entry.count >= SPAM_LIMIT) {
    spamMap.delete(key);
    return true;
  }
  return false;
}

function clearSpam(userJid, groupJid) {
  spamMap.delete(`${userJid}:${groupJid}`);
}

// Prevent command duplicate execution
function isDuplicateCmd(userJid, groupJid, cmd) {
  const key = `cmd:${userJid}:${groupJid}:${cmd}`;
  const now = Date.now();
  const last = cmdCache.get(key);
  if (last && now - last < CMD_TTL) return true;
  cmdCache.set(key, now);
  return false;
}

// Clean old cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of cmdCache.entries()) {
    if (now - ts > CMD_TTL * 2) cmdCache.delete(key);
  }
  for (const [key, entry] of spamMap.entries()) {
    if (!entry.texts.length || now - Math.max(...entry.texts) > SPAM_WINDOW * 2) {
      spamMap.delete(key);
    }
  }
}, 60000);

module.exports = { checkSpam, clearSpam, isDuplicateCmd };
