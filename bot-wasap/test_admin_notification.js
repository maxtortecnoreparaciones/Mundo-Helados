const { processIncomingMessage } = require('./handlers/handler');
const fs = require('fs');

// Mock objects
const sock = {
  sendPresenceUpdate: async () => {},
  sendMessage: async () => {}
};
const ctx = {
  sessions: {},
  mutedChats: new Set(),
  botEnabled: true,
  startTime: Date.now()
};

// Simula dos mensajes erróneos consecutivos para un usuario
(async () => {
  const msg1 = { from: '573111111111@s.whatsapp.net', text: 'mensaje que provoca error', key: { id: '1', fromMe: false } };
  const msg2 = { from: '573111111111@s.whatsapp.net', text: 'otro mensaje erroneo', key: { id: '2', fromMe: false } };

  // Ejecutar dos veces
  try {
    await processIncomingMessage(sock, msg1, ctx);
    await processIncomingMessage(sock, msg2, ctx);
    console.log('Simulación finalizada');
  } catch (e) {
    console.error('Error en simulación:', e.message);
  }
})();
