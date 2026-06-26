'use strict';

require('dotenv').config();

const path = require('path');
const db = require('./database/db');
const { connectToWhatsApp } = require('./connection');
const logger = require('./utils/logger');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Dark Bot is running!');
});

app.listen(PORT, () => {
  logger.info(`Server is listening on port ${PORT}`);
});

// Initialize database
const dbPath = process.env.DB_PATH || './data/dark_bot.db';
db.initDatabase(path.resolve(dbPath));
logger.info('Database initialized');

// Weekly cleanup
setInterval(() => {
  try {
    db.weeklyCleanup();
    logger.info('Weekly cleanup done');
  } catch (e) {
    logger.error('Weekly cleanup error', e);
  }
}, 7 * 24 * 60 * 60 * 1000);

// Expired mute cleanup every 5 minutes
setInterval(() => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const expired = db.getDb().prepare(
      'SELECT user_jid, group_jid FROM muted WHERE mute_until > 0 AND mute_until <= ?'
    ).all(now);
    for (const row of expired) {
      db.unsetMuted(row.user_jid, row.group_jid);
    }
    if (expired.length) logger.info(`Unmuted ${expired.length} expired users`);
  } catch (e) {}
}, 5 * 60 * 1000);

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down Dark Bot...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down Dark Bot...');
  process.exit(0);
});

// Handle uncaught errors without crashing
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason: String(reason) });
});

// Start the bot
(async () => {
  logger.info('🚀 Starting Dark Bot...');
  await connectToWhatsApp();
})();
