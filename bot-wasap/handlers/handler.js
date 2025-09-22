'use strict';

const { isGreeting, wantsMenu, money, normalizeText } = require('../utils/util');
const { say, resetChat, addToCart, handleProductSelection, askGemini } = require('../services/bot_core');
const { handleCartSummary, handleEnterAddress, handleEnterName, handleEnterTelefono, handleEnterPaymentMethod, handleConfirmOrder, validateInput } = require('../services/checkoutHandler');
const { sendMainMenu, handleSeleccionOpcion, handleBrowseImages } = require('./menuHandler');
const { logConversation, logUserError, logger } = require('../utils/logger');
const PHASE = require('../utils/phases');
const CONFIG = require('../config.json');

const processedMessages = new Map();
const MESSAGE_CACHE_DURATION = 5 * 60 * 1000;

setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of processedMessages.entries()) {
        if (now - timestamp > MESSAGE_CACHE_DURATION) {
            processedMessages.delete(key);
        }
    }
}, MESSAGE_CACHE_DURATION);


function initializeUserSession(jid, ctx) {
    if (!ctx.sessions[jid]) {
        ctx.sessions[jid] = {
            phase: PHASE.SELECCION_OPCION, lastPromptAt: Date.now(), errorCount: 0,
            order: { items: [] }, currentProduct: null, saboresSeleccionados: [],
            toppingsSeleccionados: [], lastMatches: [], createdAt: Date.now()
        };
    }
    if (!ctx.sessions[jid].order) {
        ctx.sessions[jid].order = { items: [] };
    }
    return ctx.sessions[jid];
}

async function processIncomingMessage(sock, msg, ctx) {
    try {
        const { from, text, key } = msg;
        const cleanedText = text.replace(/[^0-9]/g, '').trim();
        const t = text.toLowerCase().trim();

        if (!text || !from || from.includes('status@broadcast') || from.includes('@g.us') || key.fromMe) return;
        if (processedMessages.has(key.id)) return;
        processedMessages.set(key.id, Date.now());

        logConversation(from, text);
        const jid = from;
        const userSession = initializeUserSession(jid, ctx);
        userSession.lastPromptAt = Date.now();
        logger.info(`[${jid}] -> Fase actual: ${userSession.phase}. Mensaje recibido: "${text}"`);

        if (isGreeting(t)) {
            resetChat(jid, ctx);
            await sendMainMenu(sock, jid, ctx);
            return;
        }

        if (wantsMenu(t) || (userSession.phase === PHASE.BROWSE_IMAGES && t === '3')) {
            resetChat(jid, ctx);
            await sendMainMenu(sock, jid, ctx);
            return;
        }
        
        if (t === 'pagar' || t === 'carrito' || t === 'ver carrito' || (userSession.phase === PHASE.BROWSE_IMAGES && t === '1')) {
            await handleCartSummary(sock, jid, userSession, ctx);
            return;
        }
        
        if (userSession.phase === PHASE.BROWSE_IMAGES && t === '2') {
            await say(sock, jid, '¡Perfecto! Escribe el nombre del siguiente producto que deseas añadir.', ctx);
            return;
        }
        
        switch (userSession.phase) {
            case PHASE.SELECCION_OPCION:
                await handleSeleccionOpcion(sock, jid, t, userSession, ctx);
                break;
            case PHASE.BROWSE_IMAGES:
                await handleBrowseImages(sock, jid, t, userSession, ctx);
                break;
            case PHASE.SELECCION_PRODUCTO:
                await handleSeleccionProducto(sock, jid, t, userSession, ctx);
                break;
            case PHASE.SELECT_DETAILS:
                await handleSelectDetails(sock, jid, t, userSession, ctx);
                break;
            case PHASE.SELECT_QUANTITY:
                await handleSelectQuantity(sock, jid, cleanedText, userSession, ctx);
                break;
            case PHASE.CHECK_DIR:
                await handleEnterAddress(sock, jid, text, userSession, ctx);
                break;
            case PHASE.CHECK_NAME:
                await handleEnterName(sock, jid, text, userSession, ctx);
                break;
            case PHASE.CHECK_TELEFONO:
                await handleEnterTelefono(sock, jid, text, userSession, ctx);
                break;
            case PHASE.CHECK_PAGO:
                await handleEnterPaymentMethod(sock, jid, text, userSession, ctx);
                break;
            case PHASE.CONFIRM_ORDER:
                await handleConfirmOrder(sock, jid, t, userSession, ctx);
                break;
            case PHASE.ENCARGO:
                await handleEncargo(sock, jid, t, userSession, ctx);
                break;
            default:
            // Si el bot está en una fase que no existe o no sabe qué hacer,
            // llamamos a la IA como último recurso.
            await handleNaturalLanguageOrder(sock, jid, text, userSession, ctx);
            break;
        }
    } catch (error) {
        console.error('Error al procesar mensaje:', error);
        logUserError(msg.from, 'main_handler', msg.text, error.stack);
        await say(sock, msg.from, '⚠️ Ocurrió un error. Por favor, intenta de nuevo o escribe "menu" para volver al inicio.', ctx);
    }
}

// ==========================================================
// --- FUNCIONES RESTAURADAS QUE FALTABAN EN VERSIONES ANTERIORES ---
// ==========================================================

// AÑADE ESTA NUEVA FUNCIÓN A TU ARCHIVO
async function handleNaturalLanguageOrder(sock, jid, text, userSession, ctx) {
    logger.info(`[${jid}] -> No se reconoció el input, consultando a Gemini: "${text}"`);
    const jsonResponse = await askGemini(ctx, text);

    if (!jsonResponse) {
        await say(sock, jid, 'Lo siento, no pude procesar tu mensaje. Intenta de nuevo.', ctx);
        return;
    }

    try {
        const orderInfo = JSON.parse(jsonResponse);

        if (orderInfo && orderInfo.respuesta_texto) {
            await say(sock, jid, orderInfo.respuesta_texto, ctx);
        } else if (orderInfo && orderInfo.items && orderInfo.items.length > 0) {
            const firstItem = orderInfo.items[0];
            if (firstItem.modificaciones && firstItem.modificaciones.length > 0) {
                userSession.order.notes = (userSession.order.notes || []).concat(firstItem.modificaciones);
            }
            await handleBrowseImages(sock, jid, firstItem.producto, userSession, ctx);
        } else {
            await say(sock, jid, 'No estoy seguro de cómo ayudarte. Escribe *menú* para ver las opciones.', ctx);
        }
    } catch (e) {
        logger.error(`[${jid}] -> Error al procesar JSON de Gemini: ${e.message}`);
        await say(sock, jid, 'No pude procesar esa petición. Escribe "menú" para ver las opciones.', ctx);
    }
}

async function handleSeleccionProducto(sock, jid, input, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleSeleccionProducto. Selección: "${input}"`);
    const selection = parseInt(input);
    const matches = userSession.lastMatches;
    if (!validateInput(input, 'number', { max: matches.length })) {
        await say(sock, jid, `❌ Por favor, elige un número entre 1 y ${matches.length}.`, ctx);
        return;
    }
    const producto = matches[selection - 1];
    await handleProductSelection(sock, jid, producto, ctx);
}

async function handleSelectDetails(sock, jid, input, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleSelectDetails. Input: "${input}"`);
    // Aquí va tu lógica completa para seleccionar sabores y toppings
    // Por ahora, es un marcador de posición que avanza a la siguiente fase
    await say(sock, jid, '🔢 ¿Cuántas unidades de este producto quieres?', ctx);
    userSession.phase = PHASE.SELECT_QUANTITY;
}

async function handleSelectQuantity(sock, jid, cleanedText, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleSelectQuantity. Cantidad: "${cleanedText}"`);
    if (!userSession.currentProduct) {
        await say(sock, jid, '⚠️ Ocurrió un error, no se encontró el producto. Volviendo al menú.', ctx);
        resetChat(jid, ctx);
        return;
    }
    const quantity = parseInt(cleanedText);
    if (!validateInput(cleanedText, 'number', { max: 50 })) {
        await say(sock, jid, '❌ Por favor, escribe un número válido entre 1 y 50.', ctx);
        return;
    }

    const productToAdd = {
        codigo: userSession.currentProduct.codigo,
        nombre: userSession.currentProduct.nombre,
        precio: userSession.currentProduct.precio,
        sabores: userSession.saboresSeleccionados || [],
        toppings: userSession.toppingsSeleccionados || [],
    };

    addToCart(ctx, jid, productToAdd, quantity);

    const totalPrice = userSession.currentProduct.precio * quantity;
    await say(sock, jid, `✅ ¡Agregado! *${quantity}x* ${userSession.currentProduct.nombre} - *${money(totalPrice)}*`, ctx);

    userSession.phase = PHASE.BROWSE_IMAGES;
    const nextStepMessage = `¿Qué deseas hacer ahora?\n\n*1)* 🛒 Ver mi pedido y pagar (*escribe 1 o pagar*)\n*2)* 🍨 Añadir otro producto (*escribe el nombre*)\n*3)* 📋 Volver al menú principal (*escribe 3 o menú*)\n\n_Responde con un número o una palabra clave._`;
    await say(sock, jid, nextStepMessage, ctx);
}

async function handleEncargo(sock, jid, input, userSession, ctx) {
    await say(sock, jid, `📦 Procesando tu solicitud de encargo... Un agente te contactará pronto.`, ctx);
    if (CONFIG.ADMIN_JID) {
        await say(sock, CONFIG.ADMIN_JID, `📦 SOLICITUD DE ENCARGO:\nCliente: ${jid}\nMensaje: ${input}`, ctx);
    }
    resetChat(jid, ctx);
}

// ==========================================================
// --- FUNCIONES DE ARRANQUE QUE FALTABAN ---
// ==========================================================

function setupSocketHandlers(sock, ctx) {
    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            if (!msg.message) continue;
            const messageData = {
                from: msg.key.remoteJid,
                text: msg.message?.conversation || msg.message?.extendedTextMessage?.text || '',
                key: msg.key
            };
            if (!messageData.text || !messageData.text.trim()) continue;
            processIncomingMessage(sock, messageData, ctx);
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
            if (shouldReconnect) logger.info('🔄 Intentando reconectar...');
            else logger.error('🚫 Error de autenticación. Escanear QR nuevamente.');
        } else if (connection === 'open') {
            logger.info('✅ Conexión establecida.');
        }
    });
    sock.ev.on('creds.update', () => logger.info('🔑 Credenciales actualizadas'));
}

function startMaintenanceTasks(ctx) {
    setInterval(() => {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        let cleanedSessions = 0;
        for (const [jid, session] of Object.entries(ctx.sessions)) {
            if (now - session.lastPromptAt > oneHour) {
                delete ctx.sessions[jid];
                cleanedSessions++;
            }
        }
        if (cleanedSessions > 0) logger.info(`🧹 Limpieza automática: ${cleanedSessions} sesiones inactivas eliminadas`);
    }, oneHour);
}

function initializeBotContext() {
    const ctx = {
        sessions: {},
        botEnabled: true,
        startTime: Date.now(),
        version: '3.0.0' // Versión final
    };
    logger.info('✅ Contexto del bot inicializado.');
    return ctx;
}

module.exports = {
    setupSocketHandlers,
    startMaintenanceTasks,
    initializeBotContext
};