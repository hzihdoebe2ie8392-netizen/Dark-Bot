'use strict';

require('dotenv').config();

const path = require('path');
const db = require('./database/db');
const { connectToWhatsApp, getQRImage } = require('./connection');
const logger = require('./utils/logger');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', async (req, res) => {
  const qrImage = await getQRImage();
  if (qrImage) {
    res.send(`
      <html>
        <head>
          <title>Dark Bot QR Code</title>
          <meta http-equiv="refresh" content="20">
          <style>
            body { background: #1a1a1a; color: white; font-family: sans-serif; display: flex; flex-direction: column; align-items:center; justify-content:center; height: 100vh; margin:0; }
            .container { background: white; padding: 20px; border-radius: 15px; box-shadow: 0 0 20px rgba(0,0,0,0.5); }
            h1 { color: #bb86fc; margin-bottom: 20px; }
            p { color: #ccc; margin-top: 10px; }
          </style>
        </head>
        <body>
          <h1>Dark Bot QR Code</h1>
          <div class="container">
            <img src="${qrImage}" width="300" height="300" />
          </div>
          <p>Scan this QR with WhatsApp. Page refreshes every 20s.</p>
        </body>
      </html>
    `);
  } else {
    res.send(`
      <html>
        <head>
          <title>Dark Bot Status</title>
          <meta http-equiv="refresh" content="5">
          <style>
            body { background: #1a1a1a; color: white; font-family: sans-serif; display: flex; flex-direction: column; align-items:center; justify-content:center; height: 100vh; margin:0; }
            h1 { color: #03dac6; }
          </style>
        </head>
        <body>
          <h1>Dark Bot is Connected!</h1>
          <p>Everything is running smoothly.</p>
        </body>
      </html>
    `);
  }
});

app.listen(PORT, () => {
  logger.info(`Server is listening on port ${PORT}`);
});

// Initialize database
const dbPath = process.env.DB_PATH || './data/dark_bot.db';
db.initDatabase(path.resolve(dbPath));

// Start the bot
(async () => {
  logger.info('🚀 Starting Dark Bot...');
  await connectToWhatsApp();
})();
