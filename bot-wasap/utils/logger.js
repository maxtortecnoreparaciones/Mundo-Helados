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
}

module.exports = {
    logger,
    logConversation,
    logUserError
};