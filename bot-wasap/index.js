'use strict';

const path = require('path');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    Browsers,
    DisconnectReason,
    toBuffer
} = require('@whiskeysockets/baileys');
const { say, getSaboresYToppings } = require('./services/bot_core');
const { setupSocketHandlers } = require('./handlers/handler');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode');

const CONFIG = require('./config.json');

// Manejadores globales para errores no controlados.
// Esto evita que el proceso se apague de forma inesperada.
process.on('uncaughtException', (err) => {
    console.error('⚠️ Se ha producido una excepción no capturada:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promesa rechazada sin ser manejada en:', promise, 'Razón:', reason);
});

const logger = pino({
    level: 'silent'
});

const startBot = async () => {
    console.log('Inicializando servicios...');

    const ctx = {
        sessions: {},
        carts: {},
        lastSent: {},
        botEnabled: true,
        order: {},
        gemini: new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY)
    };

    try {
        await getSaboresYToppings(ctx);
        console.log('Servicio de Google Generative AI (Gemini) cargado.');
    } catch (e) {
        console.error('Error al iniciar el servicio de Gemini:', e);
        process.exit(1);
    }

    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info_baileys'));

    const sock = makeWASocket({
        auth: state,
        logger,
        browser: Browsers.macOS('Desktop')
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('Escanea este código QR para conectar el bot:');
            qrcode.toString(qr, { type: 'terminal' , small: true }, (err, url) => {
                if (err) return console.log(err);
                console.log(url);
            });
        }

        if (connection === 'close') {
            const shouldReconnect = new Boom(lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Conexión cerrada. Razón:', lastDisconnect.error);
            if (shouldReconnect) {
                console.log('Reconectando...');
                startBot();
            } else {
                console.log('✅ Desconectado. Borra la carpeta auth_info_baileys si quieres reconectar.');
            }
        } else if (connection === 'open') {
            console.log('✅ Conectado como', sock.user.id);
            await say(sock, sock.user.id, `Hola, ¡el bot se ha iniciado con éxito! ✅...`, ctx);
        }
    });

    setupSocketHandlers(sock, ctx);
};

startBot();