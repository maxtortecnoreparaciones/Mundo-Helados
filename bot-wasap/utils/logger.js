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
}

module.exports = {
    logger,
    conversationLogger,
    logConversation,
    logUserError
};