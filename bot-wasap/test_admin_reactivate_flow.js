const { processIncomingMessage, stopBackgroundTasks } = require('./handlers/handler');
const CONFIG = require('./config.json');

// Mock socket that logs actions
const mockSock = {
  sendPresenceUpdate: async (status, jid) => {
    console.log(`mockSock: sendPresenceUpdate(${status}, ${jid})`);
  },
  sendMessage: async (jid, message) => {
    const text = message.text || message.caption || JSON.stringify(message);
    console.log(`mockSock: sendMessage to ${jid}: ${text}`);
  }
};

// Build ctx matching initializeBotContext shape
const ctx = {
  sessions: {},
  botEnabled: true,
  startTime: Date.now(),
  mutedChats: new Set()
};

(async () => {
  const customerJid = '573111111111@s.whatsapp.net';
  const adminJid = (CONFIG.ADMIN_JIDS && CONFIG.ADMIN_JIDS[0]) || '573138777115@s.whatsapp.net';

  // Initialize session and set errorCount to >=2 to trigger notification on next message
  ctx.sessions[customerJid] = {
    phase: 'seleccion_opcion',
    lastPromptAt: Date.now(),
    errorCount: 2,
    order: { items: [] },
    adminNotified: false,
    miaActivo: true
  };

  console.log('--- Step 1: Send a message from customer to trigger admin notification ---');
  const customerMsg = { from: customerJid, text: 'no entiendo', key: { id: 'cust-1', fromMe: false } };
  await processIncomingMessage(mockSock, customerMsg, ctx);

  console.log('Muted chats after notification:', Array.from(ctx.mutedChats));

  console.log('\n--- Step 2: Admin sends "mia continua" to reactivate the bot for that chat ---');
  // Prepare admin session so handler recognizes admin commands
  ctx.sessions[adminJid] = ctx.sessions[adminJid] || { phase: 'seleccion_opcion', lastPromptAt: Date.now() };
  ctx.sessions[adminJid].lastCustomerJid = customerJid;

  const adminMsg = { from: adminJid, text: 'mia continua', key: { id: 'admin-1', fromMe: false } };
  await processIncomingMessage(mockSock, adminMsg, ctx);

  console.log('Muted chats after admin reactivate:', Array.from(ctx.mutedChats));

  console.log('\n--- Verificar que bot envió mensaje al cliente ---');
  const session = ctx.sessions[customerJid];
  console.log('Customer session after reactivation:', session);

  // Limpiar cualquier interval/worker que haya dejado el handler para que el proceso termine
  try {
    stopBackgroundTasks();
    console.log('Background tasks stopped. Test will exit.');
  } catch (e) {
    console.error('Error stopping background tasks:', e.message);
  }

})();
