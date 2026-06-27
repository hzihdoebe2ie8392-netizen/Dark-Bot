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
