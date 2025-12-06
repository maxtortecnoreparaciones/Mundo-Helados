const { handleFinalizeOrder } = require('./bot-wasap/services/checkoutHandler');
const CONFIG = require('./bot-wasap/config.json');

// Mock sock with required methods used by bot_core.say
const mockSock = {
  sendPresenceUpdate: async (status, jid) => {
    console.log(`mockSock: sendPresenceUpdate(${status}, ${jid})`);
  },
  sendMessage: async (jid, message) => {
    console.log(`mockSock: sendMessage to ${jid}:`, message.text || message.caption || message);
  }
};

// Mock ctx
const ctx = { sessions: {} };

// Prepare a fake user session with an order
const jid = '573138777115@s.whatsapp.net';
const userSession = {
  phase: 'finalize_order',
  order: {
    items: [
      {
        codigo: 'CI-TOR-CHOC',
        nombre: 'Copa Tormenta de Chocolate',
        cantidad: 1,
        precio: 14000,
        sabores: [{ NombreProducto: 'Chocolate' }, { NombreProducto: 'brownie' }, { NombreProducto: 'arequipe' }],
        toppings: [{ NombreProducto: 'chocolatina wafer jet' }, { NombreProducto: 'galletas oreo' }]
      }
    ],
    name: 'Dalis',
    telefono: '3004864177',
    address: 'CR 2 # 28A 49 TO 1 APTO 201\nBarrio buenos Aires',
    paymentMethod: 'Transferencia',
    deliveryCost: 0,
    status: 'Por despachar'
  }
};

ctx.sessions[jid] = userSession;

(async () => {
  try {
    console.log('Starting test: handleFinalizeOrder with confirmation');
    await handleFinalizeOrder(mockSock, jid, 'confirmar', userSession, ctx);
    console.log('Test finished');
  } catch (err) {
    console.error('Error during test:', err);
  }
})();
