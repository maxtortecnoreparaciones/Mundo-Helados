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
  const customerJid = '212948991647868@lid';

  // Step 1: User searches for "Caja"
  console.log('--- Step 1: User searches for Caja ---');
  const msg1 = { from: customerJid, text: 'Caja', key: { id: 'm-1', fromMe: false } };
  await processIncomingMessage(mockSock, msg1, ctx);

  // Wait a bit to simulate user reading the menu
  await new Promise(r => setTimeout(r, 1200));

  // Step 2: User selects product (should trigger handleSeleccionProducto or handleSelectDetails)
  console.log('\n--- Step 2: User selects option 1 (first product) ---');
  const msg2 = { from: customerJid, text: '1', key: { id: 'm-2', fromMe: false } };
  await processIncomingMessage(mockSock, msg2, ctx);

  // Wait for bot to ask details
  await new Promise(r => setTimeout(r, 800));

  // Step 3: User selects flavor '1'
  console.log('\n--- Step 3: User replies with flavor 1 ---');
  const msg3 = { from: customerJid, text: '1', key: { id: 'm-3', fromMe: false } };
  await processIncomingMessage(mockSock, msg3, ctx);

  // Immediately send quantity three times quickly
  await new Promise(r => setTimeout(r, 300));
  console.log('\n--- Step 4: User sends quantity 1 three times quickly ---');
  const q1 = { from: customerJid, text: '1', key: { id: 'q-1', fromMe: false } };
  const q2 = { from: customerJid, text: '1', key: { id: 'q-2', fromMe: false } };
  const q3 = { from: customerJid, text: '1', key: { id: 'q-3', fromMe: false } };

  await processIncomingMessage(mockSock, q1, ctx);
  // very short delay
  await new Promise(r => setTimeout(r, 200));
  await processIncomingMessage(mockSock, q2, ctx);
  await new Promise(r => setTimeout(r, 200));
  await processIncomingMessage(mockSock, q3, ctx);

  // Show session state
  await new Promise(r => setTimeout(r, 500));
  console.log('\n--- Final session state ---');
  console.log(JSON.stringify(ctx.sessions[customerJid], null, 2));

  // Stop background tasks
  try {
    stopBackgroundTasks();
    console.log('Background tasks stopped.');
  } catch (e) {
    console.error('Error stopping background tasks:', e.message);
  }
})();
