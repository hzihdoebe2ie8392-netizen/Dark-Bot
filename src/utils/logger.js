'use strict';

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../../logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = levels[LOG_LEVEL] ?? 2;

function timestamp() {
  return new Date().toISOString();
}

function write(level, msg, data) {
  if ((levels[level] ?? 99) > currentLevel) return;
  const line = `[${timestamp()}] [${level.toUpperCase()}] ${msg}${data ? ' ' + JSON.stringify(data) : ''}`;
  console.log(line);
  const file = path.join(LOG_DIR, `${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFileSync(file, line + '\n');
}

const logger = {
  error: (msg, data) => write('error', msg, data),
  warn: (msg, data) => write('warn', msg, data),
  info: (msg, data) => write('info', msg, data),
  debug: (msg, data) => write('debug', msg, data)
};

module.exports = logger;
