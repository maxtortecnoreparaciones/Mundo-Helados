<<<<<<< HEAD
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const logDirectory = path.join(__dirname, '../logs');
if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory);
}

const conversationLogPath = path.join(logDirectory, 'conversations.log');
const userErrorsLogPath = path.join(logDirectory, 'user_errors.log');

const transport = pino.transport({
  targets: [
    {
      level: 'info',
      target: 'pino/file', 
    },
    {
      level: 'info',
      target: 'pino/file',
      options: { destination: conversationLogPath, mkdir: true },
    },
    {
        level: 'error',
        target: 'pino/file',
        options: { destination: userErrorsLogPath, mkdir: true },
    }
  ]
});

const logger = pino(transport);


function logConversation(jid, text, fromBot = false) {
    const prefix = fromBot ? `[BOT -> ${jid}]` : `[${jid} -> BOT]`;
    logger.info(`${prefix}: ${text}`);
}

function logUserError(jid, context, text, errorStack) {
    const errorMessage = `[ERROR en ${context} para ${jid}] | Mensaje: "${text}" | Stack: ${errorStack}`;
    logger.error(errorMessage);
=======
'use strict';

const fs = require('fs');
const path = require('path');
const pino = require('pino');

const CONFIG = require('../config.json');

const logger = pino({
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true
        }
    },
    level: CONFIG.LOG_LEVEL || 'info',
});

const conversationLogger = pino(
    {
        transport: {
            target: 'pino/file',
            options: {
                destination: path.join(__dirname, '..', CONFIG.CONVERSATION_LOG_PATH || 'conversations.log'),
                mkdir: true,
                append: true
            }
        }
    },
    pino.destination({
        sync: false,
        minLength: 4096,
        dest: path.join(__dirname, '..', CONFIG.CONVERSATION_LOG_PATH || 'conversations.log')
    })
);

function logConversation(jid, text, isBot = false) {
    const prefix = isBot ? '🤖 Bot' : '👤 Usuario';
    conversationLogger.info({ jid, isBot, text }, `${prefix} (${jid}): ${text}`);
}

function logUserError(jid, phase, message, errorMsg) {
    conversationLogger.error({ jid, phase, message, errorMsg }, `❌ ERROR (${jid}) - Fase: ${phase} - Mensaje recibido: "${message}" - Error: ${errorMsg}`);
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
}

module.exports = {
    logger,
<<<<<<< HEAD
=======
    conversationLogger,
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
    logConversation,
    logUserError
};