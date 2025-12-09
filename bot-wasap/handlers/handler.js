'use strict';

const fs = require('fs');
const axios = require('axios');
const path = require('path');
const { parsePrice, money, isGreeting, wantsMenu } = require('../utils/util');
const {
    say,
    sendImage,
    resetChat,
    addToCart,
    handleProductSelection,
    startEncargoBrowse,
    sleep,
    askGemini
} = require('../services/bot_core');
const {
    handleCartSummary,
    handleEnterAddress,
    handleEnterName,
    handleEnterTelefono,
    handleEnterPaymentMethod,
    handleConfirmOrder,
    handleFinalizeOrder,
    validateInput
    
} = require('../services/checkoutHandler');
const {
    logConversation,
    logUserError,
    logger
} = require('../utils/logger');
const PHASE = require('../utils/phases');
const CONFIG = require('../config.json');
const SECRETS = require('../config.secrets');
const ENDPOINTS = CONFIG.ENDPOINTS;

// Helper: unified admin JIDs resolver (fallback to individual ADMIN_JID / SOCIA_JID)
function getAdminJids() {
    if (Array.isArray(CONFIG.ADMIN_JIDS) && CONFIG.ADMIN_JIDS.length > 0) return CONFIG.ADMIN_JIDS;
    const list = [];
    if (CONFIG.ADMIN_JID) list.push(CONFIG.ADMIN_JID);
    if (CONFIG.SOCIA_JID) list.push(CONFIG.SOCIA_JID);
    return list;
}

// --- FUNCIONES AUXILIARES (Sin cambios) ---
function normalizeText(text) {
    if (!text) return '';
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

const processedMessages = new Map();
const MESSAGE_CACHE_DURATION = 5 * 60 * 1000;

// Track background intervals so tests can clear them and allow process to exit
let _backgroundIntervals = [];

const processedMessagesCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of processedMessages.entries()) {
        if (now - timestamp > MESSAGE_CACHE_DURATION) {
            processedMessages.delete(key);
        }
    }
}, MESSAGE_CACHE_DURATION);
_backgroundIntervals.push(processedMessagesCleanupInterval);

function shouldResetForInactivity(userSession, currentTime) {
    const timeSinceLastActivity = currentTime - userSession.lastPromptAt;
    const INACTIVITY_THRESHOLD = CONFIG.TIME?.BLOCK_DURATION_MS || (30 * 60 * 1000);
    const isInactive = timeSinceLastActivity > INACTIVITY_THRESHOLD;
    return isInactive && userSession.phase !== PHASE.SELECCION_OPCION;
}
// --- FIN FUNCIONES AUXILIARES ---


// =================================================================================
// CAMBIO 1 (CLAVE): ASEGURAR QUE LA SESIÓN SIEMPRE TENGA UN CARRITO VÁLIDO
// Esta función ahora garantiza que cada sesión nueva o existente tenga
// la estructura `order: { items: [] }`, eliminando la causa raíz del error.
// =================================================================================
function initializeUserSession(jid, ctx) {
    if (!ctx.sessions[jid]) {
        ctx.sessions[jid] = {
            phase: PHASE.SELECCION_OPCION,
            lastPromptAt: Date.now(),
            errorCount: 0,
            order: { items: [] }, // <-- ESTO EVITA EL ERROR 'Cannot read... of undefined'
            currentProduct: null,
            saboresSeleccionados: [],
            toppingsSeleccionados: [],
            lastMatches: [],
            createdAt: Date.now()
        };
    }
    // Asegurarse de que sesiones antiguas también tengan la estructura de `order`
    if (!ctx.sessions[jid].order) {
        ctx.sessions[jid].order = { items: [] };
    }
    // Campo que indica qué dato se está esperando del usuario (ej: 'quantity', 'address')
    if (typeof ctx.sessions[jid].awaitingField === 'undefined') {
        ctx.sessions[jid].awaitingField = null;
    }
    if (!ctx.sessions[jid].miaActivo) {
    ctx.sessions[jid].miaActivo = true;   // Por defecto activa
}
if (!ctx.sessions[jid].erroresMIA) {
    ctx.sessions[jid].erroresMIA = 0;     // Contador de errores consecutivos
}
    return ctx.sessions[jid];
}




// RUTA: bot-wasap/handlers/handler.js

// RUTA: handlers/handler.js

// Helper: notify admins and mute chat on repeated MIA failures
async function notifyAndMuteOnMIAFailure(sock, jid, userSession, ctx, reason) {
    try {
        userSession.adminNotified = true;
        userSession.miaActivo = false;
        if (!ctx.mutedChats) ctx.mutedChats = new Set();
        ctx.mutedChats.add(jid);

        const admins = getAdminJids();
        const chatLink = `https://wa.me/${jid.split('@')[0]}`;
        const adminMsg = `🔔 ¡ATENCIÓN! 🔔\n\nEl cliente ${jid.split('@')[0]} necesita ayuda.\nMotivo: ${reason || 'fallos en MIA'}\nAbrir chat: ${chatLink}`;
        for (const admin of admins) {
            if (!admin) continue;
            try { await say(sock, admin, adminMsg, ctx); } catch (e) { logger.error(`Error notificando admin ${admin}: ${e.message}`); }
        }

        try {
            await say(sock, jid, 'Lo siento, estamos teniendo problemas con el servicio de IA. Un agente humano ha sido notificado y te ayudará en breve. Si quieres que MIA vuelva, pide a un administrador que escriba "mia activa".', ctx);
        } catch (e) { logger.error(`Error notificando usuario ${jid} tras falla MIA: ${e.message}`); }
    } catch (e) {
        logger.error(`notifyAndMuteOnMIAFailure error: ${e.message}`);
    }
}

async function handleNaturalLanguageOrder(sock, jid, text, userSession, ctx) {
    logger.info(`[${jid}] -> Procesando con MIA: "${text}"`);
    let jsonResponse = null;

    try {
        // Protegemos la llamada a Gemini para que cualquier excepción sea capturada aquí
        jsonResponse = await askGemini(ctx, text);
    } catch (err) {
        // Logueo detallado y manejo de contador de errores de MIA
        logger.error(`Error al interactuar con la API de Gemini: ${err.message}`, err.stack || err);
        userSession.erroresMIA = (userSession.erroresMIA || 0) + 1;

        // Si la IA falla repetidamente, notificar admins y silenciar chat
        if (userSession.erroresMIA >= 2) {
            try {
                if (!ctx.mutedChats) ctx.mutedChats = new Set();
                ctx.mutedChats.add(jid);
            } catch (e) {
                logger.error(`Error al actualizar ctx.mutedChats: ${e.message}`);
            }

            // Desactivar MIA para este usuario hasta que un admin reactive
            userSession.miaActivo = false;
            userSession.adminNotified = true;

            const notification = `🔔 ¡ATENCIÓN! 🔔\n\nEl cliente ${jid.split('@')[0]} necesita ayuda: MIA produjo errores repetidos.\n\nÚltimo error: ${err.message}\n\nPor favor revisa la integración con Gemini y el estado de las claves/API.`;
            const ADMINS_TO_NOTIFY = getAdminJids();
            for (const adminJid of ADMINS_TO_NOTIFY) {
                if (adminJid) {
                    try { await say(sock, adminJid, notification, ctx); } catch (notifyErr) { logger.error(`Error notificando admin ${adminJid}: ${notifyErr.message}`); }
                }
            }

            await say(sock, jid, 'Lo siento, no logro entender. Un agente humano ha sido notificado y te ayudará en breve. Si quieres que MIA vuelva, pide a un administrador que escriba "mia activa".', ctx);
        } else {
            await say(sock, jid, 'No te entendí muy bien, ¿podrías decirlo de otra forma?', ctx);
        }
        return;
    }

    if (!jsonResponse) {
        // Manejo cuando askGemini regresa vacío/null (similar al anterior pero sin excepción)
        userSession.erroresMIA = (userSession.erroresMIA || 0) + 1;
        if (userSession.erroresMIA >= 2) {
            try { if (!ctx.mutedChats) ctx.mutedChats = new Set(); ctx.mutedChats.add(jid); } catch (e) { logger.error(`Error al actualizar ctx.mutedChats: ${e.message}`); }
            const notification = `🔔 ¡ATENCIÓN! 🔔\n\nEl cliente ${jid.split('@')[0]} necesita ayuda: MIA devolvió respuesta vacía.`;
            const ADMINS_TO_NOTIFY = getAdminJids();
            for (const adminJid of ADMINS_TO_NOTIFY) {
                if (adminJid) {
                    try { await say(sock, adminJid, notification, ctx); } catch (notifyErr) { logger.error(`Error notificando admin ${adminJid}: ${notifyErr.message}`); }
                }
            }
            await say(sock, jid, 'Lo siento, no logro entender. Un agente humano ha sido notificado y te ayudará en breve.', ctx);
        } else {
            await say(sock, jid, 'No te entendí muy bien, ¿podrías decirlo de otra forma?', ctx);
        }
        return;
    }

    try {
        const orderInfo = JSON.parse(jsonResponse);
        userSession.erroresMIA = 0; // Reinicia el contador si la IA entiende

        if (orderInfo.respuesta_texto) {
            await say(sock, jid, orderInfo.respuesta_texto, ctx);
            return;
        }

        if (orderInfo.items && orderInfo.items.length > 0) {
            for (const item of orderInfo.items) {
                await handleBrowseImages(sock, jid, item.producto, userSession, ctx, item.cantidad, item.modificaciones);
            }

            if (orderInfo.direccion) userSession.order.address = orderInfo.direccion;
            if (orderInfo.nombre) userSession.order.name = orderInfo.nombre;

            // Decidimos cuál es el siguiente paso lógico
            if (!userSession.order.address) {
                userSession.phase = PHASE.CHECK_DIR;
                await say(sock, jid, '¡Pedido(s) añadido(s)! Para continuar, por favor, dime tu dirección completa.', ctx);
            } else if (!userSession.order.name) {
                userSession.phase = PHASE.CHECK_NAME;
                await say(sock, jid, '¡Entendido! Ahora, ¿a nombre de quién va el pedido?', ctx);
            } else {
                userSession.phase = PHASE.CHECK_TELEFONO;
                await say(sock, jid, '¡Casi listos! ¿Cuál es tu número de teléfono para la entrega?', ctx);
            }
        } else {
             await say(sock, jid, 'No estoy seguro de cómo ayudarte. Escribe *menú* para ver las opciones.', ctx);
        }
    } catch (e) {
        logger.error(`[${jid}] -> Error al procesar JSON de Gemini: ${e.message}`);
        // Notificar admins sobre el parseo fallido (posible cambio en el formato de la IA)
        const admins = getAdminJids();
        const adminMsg = `🔴 Error procesando respuesta de MIA para ${jid.split('@')[0]}:\n- Error: ${e.message}\n- Respuesta cruda: ${String(jsonResponse).substring(0,1000)}`;
        for (const admin of admins) {
            try { if (admin) await say(sock, admin, adminMsg, ctx); } catch (notifyErr) { logger.error(`Error notificando admin ${admin}: ${notifyErr.message}`); }
        }
    }
}

async function processIncomingMessage(sock, msg, ctx) {
    try {
        const { from, text, key } = msg;

        const cleanedText = text.replace(/[^0-9]/g, '').trim();
        const t = text.toLowerCase().trim();

        if (!text || !from || from.includes('status@broadcast') || from.includes('@g.us') || from.includes('@newsletter')|| key.fromMe) return;
        
        const jid = from;

        logConversation(jid, text);

        const userSession = initializeUserSession(jid, ctx);
        userSession.lastPromptAt = Date.now();
        // Guard: ignorar mensajes idénticos enviados en un corto intervalo (6s)
        const now = Date.now();
        const importantInputRegex = /^\s*(s\d+|t\d+|\d+|sin)\b/i;
        const looksLikeImportant = importantInputRegex.test(text.trim());
        if (userSession.lastMessage && userSession.lastMessage.text === text && (now - userSession.lastMessage.at) < 6000) {
            // If this looks like a selection/quantity and the user is in a relevant phase, allow it through
            const allowIfExpectedPhase = [PHASE.SELECT_DETAILS, PHASE.SELECT_QUANTITY, PHASE.SELECCION_PRODUCTO];
            if (looksLikeImportant && allowIfExpectedPhase.includes(userSession.phase)) {
                logger.info(`[${jid}] -> Duplicate-like input looks important and user is in phase=${userSession.phase}. Allowing processing.`);
            } else {
                // Detailed debug to help diagnose duplicate sends
                logger.warn(`[${jid}] -> Ignorado mensaje duplicado en ${now - userSession.lastMessage.at}ms. awaitingField=${userSession.awaitingField} processingQuantity=${userSession.processingQuantity} lastAdded=${JSON.stringify(userSession.lastAdded)} lastQuantityReceived=${JSON.stringify(userSession.lastQuantityReceived)}`);
                logger.info(`[${jid}] -> Ignorando mensaje duplicado recibido: "${text}"`);
                return;
            }
        }
        userSession.lastMessage = { text, at: now };
        logger.info(`[${jid}] -> Fase actual: ${userSession.phase}. Mensaje recibido: "${text}"`);

        // Si el usuario ha tenido 2 o más errores consecutivos, notificar a los administradores
        if (userSession.errorCount >= 2 && !userSession.adminNotified) {
            userSession.adminNotified = true;
            const admins = getAdminJids();
            const chatLink = `https://wa.me/${jid.split('@')[0]}`;
            const adminMsg = `🔔 Atención: Cliente con dificultades.\n\nCliente: ${jid.split('@')[0]}\nÚltimo mensaje: "${text}"\nAbrir chat: ${chatLink}\n\nPor favor, toma el control de este chat.`;

            for (const admin of admins) {
                try {
                    await say(sock, admin, adminMsg, ctx);
                } catch (notifyError) {
                    logger.error(`Error notificando al admin ${admin}: ${notifyError.message}`);
                }
            }

            // Silenciar el bot para este chat para que el humano se haga cargo
            try {
                if (!ctx.mutedChats) ctx.mutedChats = new Set();
                ctx.mutedChats.add(jid);
                // Also disable MIA for this session until an admin reactivates
                userSession.miaActivo = false;
            } catch (e) {
                logger.error(`Error al añadir chat a mutedChats: ${e.message}`);
            }

            // Avisar al usuario que un agente humano ha sido notificado
            try {
                await say(sock, jid, 'Lo siento, parece que necesitas ayuda. Un agente humano ha sido notificado y te ayudará en breve.', ctx);
            } catch (e) {
                logger.error(`Error enviando notificación al usuario ${jid}: ${e.message}`);
            }
        }

        // Si el chat está silenciado, no procesar mensajes (pero registrar que el admin puede reactivar)
        if (ctx.mutedChats && ctx.mutedChats.has(jid)) {
            const adminSession = initializeUserSession(CONFIG.ADMIN_JID || (getAdminJids()[0] || ''), ctx);
            adminSession.lastCustomerJid = jid;
            return;
        }

        if (jid === CONFIG.ADMIN_JID || jid === CONFIG.SOCIA_JID) {
            if (t === 'yo continuo') {
                const customerJid = userSession.lastCustomerJid;
                if (customerJid) {
                    ctx.mutedChats.add(customerJid);
                    await say(sock, jid, `✅ Bot silenciado para el chat con ${customerJid.split('@')[0]}. Ya puedes hablar.`, ctx);
                }
                return;
            }
            if (t === 'mia activa' || t === 'mia continua') {
                const customerJid = userSession.lastCustomerJid;
                if (customerJid && ctx.mutedChats.has(customerJid)) {
                    ctx.mutedChats.delete(customerJid);
                    await say(sock, jid, `✅ Bot reactivado para el chat con ${customerJid.split('@')[0]}.`, ctx);
                    await say(sock, customerJid, '¡Hola! Soy MIA y estoy de vuelta para ayudarte. Escribe *menú* si lo necesitas.', ctx);

                    // --- NEW: ensure customer's session is unblocked and reset critical flags ---
                    try {
                        const custSession = ctx.sessions[customerJid] || initializeUserSession(customerJid, ctx);
                        logger.info(`[DEBUG] before reset - ${customerJid} adminNotified=${custSession.adminNotified} errorCount=${custSession.errorCount} erroresMIA=${custSession.erroresMIA}`);
                        // Directly set fields to avoid relying on defaults
                        custSession.adminNotified = false;
                        custSession.errorCount = 0;
                        custSession.erroresMIA = 0;
                        custSession.miaActivo = true;
                        custSession.lastPromptAt = Date.now();
                        // Persist back just in case
                        ctx.sessions[customerJid] = custSession;
                        logger.info(`[DEBUG] after reset - ${customerJid} adminNotified=${custSession.adminNotified} errorCount=${custSession.errorCount} erroresMIA=${custSession.erroresMIA}`);

                        logger.info(`[${customerJid}] -> Admin reactivó el chat. adminNotified reset, errorCount cleared, MIA re-enabled.`);
                    } catch (e) {
                        logger.error(`Error al resetear la sesión del cliente ${customerJid}: ${e.message}`);
                    }
                }
                return;
            }
        }

        if (ctx.mutedChats.has(jid)) {
            const adminSession = initializeUserSession(CONFIG.ADMIN_JID, ctx);
            adminSession.lastCustomerJid = jid;
            return;
        }
        
        if (!ctx.botEnabled) return;
        
        if (processedMessages.has(key.id)) return;
        processedMessages.set(key.id, Date.now());

        if (isGreeting(t) || wantsMenu(t)) {
            resetChat(jid, ctx);
            await sendMainMenu(sock, jid, ctx);
            return;
        }

        // --- COMANDOS MIA ---
if (t === "yo continuo") {
    userSession.miaActivo = false;
    await say(sock, jid, "🚫 MIA desactivada. Chat en manos humanas.", ctx);
    return;
}

if (t === "mia activa") {
    userSession.miaActivo = true;
    await say(sock, jid, "✅ ¡MIA reactivada! Continuemos con tu pedido 🍦", ctx);
    return;
}

        switch (userSession.phase) {
            case PHASE.SELECCION_OPCION:
                const normalCommands = {
                    'menu': '1', 'ver menu': '1', 'productos': '1', 'carta': '1',
                    'direccion': '2', 'horario': '2', 'ubicacion': '2',
                    'encargo': '3', 'eventos': '3', 'litros': '3'
                };
                const command = normalCommands[t];
                const menuOptions = ['1', '2', '3'];

                if (command || menuOptions.includes(t)) {
                    const option = command || t;
                    await handleSeleccionOpcion(sock, jid, option, userSession, ctx);
                } else {
                     if (userSession.miaActivo) {
            // PROACTIVE GUARD: si ya hubo fallos de MIA previos, no volver a invocar la IA
            // y notificar/admin-silenciar si no se hizo correctamente antes.
            if ((userSession.erroresMIA || 0) >= 1 && !userSession.adminNotified) {
                try {
                    userSession.adminNotified = true;
                    userSession.miaActivo = false;
                    if (!ctx.mutedChats) ctx.mutedChats = new Set();
                    ctx.mutedChats.add(jid);

                    const admins = getAdminJids();
                    const chatLink = `https://wa.me/${jid.split('@')[0]}`;
                    const notifyText = `🔔 ¡ATENCIÓN! 🔔\n\nCliente: ${jid.split('@')[0]}\nMotivo: MIA ha fallado previamente (${userSession.erroresMIA} intentos).\nAbrir chat: ${chatLink}`;

                    for (const admin of admins) {
                        if (admin) {
                            try { await say(sock, admin, notifyText, ctx); } catch (err) { logger.error(`Error notificando admin ${admin}: ${err.message}`); }
                        }
                    }

                    await say(sock, jid, 'Lo siento, estamos teniendo problemas con el servicio de IA. Un agente humano ha sido notificado y te ayudará en breve. Si quieres que MIA vuelva, pide a un administrador que escriba "mia activa".', ctx);
                } catch (e) {
                    logger.error(`Error en guard proactivo de MIA: ${e.message}`);
                }
                return;
            }

            // If Gemini API key is not configured, avoid calling the IA repeatedly.
            const geminiKey = SECRETS.GEMINI_API_KEY || process.env.GEMINI_API_KEY || CONFIG.GEMINI_API_KEY;
            if (!geminiKey) {
                userSession.erroresMIA = (userSession.erroresMIA || 0) + 1;
                logger.warn(`[${jid}] -> Gemini API key missing. Incremented erroresMIA=${userSession.erroresMIA}`);
                if (userSession.erroresMIA >= 2 && !userSession.adminNotified) {
                    await notifyAndMuteOnMIAFailure(sock, jid, userSession, ctx, 'Gemini API key missing or disabled');
                } else {
                    await say(sock, jid, 'Lo siento, el servicio de IA no está disponible temporalmente. Un agente humano ha sido notificado si es necesario.', ctx);
                }
                return;
            }

            await handleNaturalLanguageOrder(sock, jid, text, userSession, ctx);

            // POST-CHECK: si la llamada a MIA dejó errores acumulados pero no se ejecutó el mute/notify,
            // forzamos la notificación/mute aquí para garantizar la protección.
            try {
                if ((userSession.erroresMIA || 0) >= 2 && !userSession.adminNotified) {
                    await notifyAndMuteOnMIAFailure(sock, jid, userSession, ctx, `MIA devolvió errores (${userSession.erroresMIA})`);
                    return;
                }
            } catch (e) {
                logger.error(`Error en post-check MIA: ${e.message}`);
            }
        } else {
            await say(sock, jid, "🤖 MIA está desactivada. Escribe *mia activa* si quieres que la IA continúe.", ctx);
        }
                }
                break;
            case PHASE.BROWSE_IMAGES:
    const postAddOptions = ['pagar', 'carrito', 'menu', '1', '2', '3'];

    if (postAddOptions.includes(t)) {
        if (t === 'pagar' || t === 'carrito' || t === '1') {
            await handleCartSummary(sock, jid, userSession, ctx);
        } else if (t === '2') {
            await say(sock, jid, '¡Perfecto! Escribe el nombre del siguiente producto que deseas añadir.', ctx);
        } else if (t === 'menu' || t === '3') {
            resetChat(jid, ctx);
            await sendMainMenu(sock, jid, ctx);
        }
    } else {
        await handleBrowseImages(sock, jid, t, userSession, ctx);
    }
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
            case PHASE.FINALIZE_ORDER:
                await handleFinalizeOrder(sock, jid, t, userSession, ctx);
                break;
            case PHASE.ENCARGO:
                await handleEncargo(sock, jid, t, userSession, ctx);
                break;
            default:
                // CORRECCIÓN: Si la fase es desconocida o undefined, es más seguro resetear.
                // Esto evita que se llame a la IA con entradas inesperadas (como un número de teléfono).
                logger.warn(`[${jid}] -> Fase desconocida o nula: '${userSession.phase}'. Reseteando al menú principal.`);
                await say(sock, jid, '🤔 Parece que nos perdimos un poco. Volvamos al inicio.', ctx);
                resetChat(jid, ctx);
                await sendMainMenu(sock, jid, ctx);
                break;
        }
    } catch (error) {
        console.error('Error al procesar mensaje:', error);
        logUserError(msg.from, 'main_handler', msg.text, error.stack);

        const errorMessageForAdmin = `🔴 *¡Error Crítico en el Bot!* 🔴\n\n- *Cliente:* ${msg.from}\n- *Mensaje:* "${msg.text}"\n- *Error:* ${error.message}\n\nPor favor, revisa la consola o los logs para más detalles.`;
        const admins = getAdminJids();
        if (admins && admins.length > 0) {
            for (const adminJid of admins) {
                try {
                    await say(sock, adminJid, errorMessageForAdmin, ctx);
                } catch (notifyError) {
                    console.error(`Error al notificar al admin ${adminJid}:`, notifyError);
                }
            }
        }
        await say(sock, msg.from, '⚠️ Ocurrió un error. Por favor, intenta de nuevo.', ctx);
    }
}




async function sendMainMenu(sock, jid, ctx) {
    const welcomeMessage = `Holiii ☺️
Como estas? Somos heladeria mundo helados en riohacha🍦

*1)* 🛍️ Ver nuestro menú y hacer un pedido
*2)* 📦 Pedidos por encargo (litros, eventos y grandes cantidades)
*3)* 📍 Dirección y horarios

_Escribe el número de la opción (1, 2 o 3)._`;
    await say(sock, jid, welcomeMessage, ctx);
  
}

async function handleSeleccionOpcion(sock, jid, input, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleSeleccionOpcion. Opción: "${input}"`);
    switch (input) {
        case '1':
            await say(sock, jid, '📋 ¡Aquí está nuestro delicioso menú del día!', ctx);
            const menuPath1 = path.join(__dirname, '../menu-1.jpeg');
            const menuPath2 = path.join(__dirname, '../menu-2.jpeg');
            if (fs.existsSync(menuPath1)) await sendImage(sock, jid, menuPath1, 'Menú - Parte 1', ctx);
            if (fs.existsSync(menuPath2)) await sendImage(sock, jid, menuPath2, 'Menú - Parte 2', ctx);

            await say(sock, jid, `🔍 *Paso 1:* Escribe el *NOMBRE* completo o una palabra de tu producto favorito. Ejemplos: Copa Brownie, Volcán, Búho, Helado`, ctx);
            userSession.phase = PHASE.BROWSE_IMAGES;
            userSession.errorCount = 0;
            break;

        case '3':
            await say(sock, jid, `📍 *Nuestra ubicación:* Cra 7h n 34 b 08\n🕐 *Horario de atención:* Todos los días de 2:00 PM a 10:00 PM`, ctx);
            await sleep(1500);
            await sendMainMenu(sock, jid, ctx);
            break;

        case '2':
            await startEncargoBrowse(sock, jid, ctx);
            userSession.phase = PHASE.ENCARGO;
            break;

        default:
            userSession.errorCount++;
            await say(sock, jid, '❌ No entendí esa opción. Por favor, elige 1, 2 o 3.', ctx);
            break;
    }
}

async function handleBrowseImages(sock, jid, text, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleBrowseImages. Búsqueda: "${text}"`);
    try {
        const normalizedQuery = normalizeText(text);
        const response = await axios.get(`${CONFIG.API_BASE}${ENDPOINTS.BUSCAR_PRODUCTO}`, { params: { q: normalizedQuery } });
        let productos = [];

        if (response.data.matches) {
            productos = response.data.matches;
        } else if (response.data.CodigoProducto) {
            productos = [response.data];
        }

        // Normalización de precios y números (sin cambios)
        productos.forEach(p => {
            if (p.Precio_Venta) {
                const precioString = String(p.Precio_Venta);
                p.Precio_Venta = parseFloat(precioString.replace('.', ''));
            }
            if (p.Numero_de_Sabores) {
                p.Numero_de_Sabores = parseInt(p.Numero_de_Sabores, 10);
            }
            if (p.Numero_de_Toppings) {
                p.Numero_de_Toppings = parseInt(p.Numero_de_Toppings, 10);
            }
        });

        if (productos.length === 1) {
            await handleProductSelection(sock, jid, productos[0], ctx);
            userSession.phase = PHASE.SELECT_DETAILS;
            userSession.currentProduct = productos[0];
            userSession.errorCount = 0;
            // Ensure awaitingField is correct based on product requirements
            const numSabores = parseInt(productos[0].Numero_de_Sabores || 0);
            const numToppings = parseInt(productos[0].Numero_de_Toppings || 0);
            if (numSabores > 0 || numToppings > 0) {
                userSession.awaitingField = 'details';
            } else {
                userSession.awaitingField = 'quantity';
            }
        } else if (productos.length > 1) {
            userSession.phase = PHASE.SELECCION_PRODUCTO;
            userSession.lastMatches = productos;
            const list = productos.slice(0, 10).map((p, i) => `*${i + 1}.* ${p.NombreProducto}`).join('\n');
            await say(sock, jid, `🤔 Encontré varios productos similares:\n${list}\n_Escribe el número del producto que deseas._`, ctx);
            userSession.errorCount = 0;
        } else {
            userSession.errorCount++;
            await say(sock, jid, `❌ No encontré el producto *"${text}"*. Intenta con una palabra clave.`, ctx);
        }
    } catch (error) {
        logger.error('[browse] error:', error.response?.data || error.message);
        userSession.errorCount++;
        await say(sock, jid, '⚠️ Error de conexión. Por favor, intenta de nuevo.', ctx);
    }
}

async function handleSeleccionProducto(sock, jid, input, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleSeleccionProducto. Selección: "${input}"`);
    const selection = parseInt(input);
    const matches = userSession.lastMatches;
    if (!validateInput(input, 'number', { max: matches.length })) {
        userSession.errorCount++;
        await say(sock, jid, `❌ Por favor, elige un número entre 1 y ${matches.length}.`, ctx);
        return;
    }
    const producto = matches[selection - 1];
    await handleProductSelection(sock, jid, producto, ctx);
    userSession.phase = PHASE.SELECT_DETAILS;
    userSession.currentProduct = producto;
    userSession.errorCount = 0;
    // Ensure awaitingField is correct after selection
    const numSaboresSel = parseInt(producto.Numero_de_Sabores || 0);
    const numToppingsSel = parseInt(producto.Numero_de_Toppings || 0);
    if (numSaboresSel > 0 || numToppingsSel > 0) {
        userSession.awaitingField = 'details';
    } else {
        userSession.awaitingField = 'quantity';
    }
}

async function handleSelectDetails(sock, jid, input, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleSelectDetails. Input: "${input}"`);

    // Determine if input looks like a details selection (S1, T2, or simple numeric choice)
    const looksLikeDetail = /^\s*(s\d+|t\d+|\d+|sin)\b/i.test(input.trim());

    // Evitar re-preguntas solo si el input no parece ser una selección de detalles
    if (userSession.awaitingField && userSession.awaitingField !== 'details' && !looksLikeDetail && userSession.phase !== PHASE.SELECT_DETAILS) {
        logger.info(`[${jid}] -> Ignorando entrada en detalles porque awaitingField=${userSession.awaitingField}`);
        return;
    }

    if (userSession.awaitingField && userSession.awaitingField !== 'details' && userSession.phase === PHASE.SELECT_DETAILS && !looksLikeDetail) {
        logger.warn(`[${jid}] -> Mismatch detected: phase=SELECT_DETAILS but awaitingField=${userSession.awaitingField} and input does not look like details. Ignoring.`);
        return;
    }

    if (userSession.awaitingField && userSession.awaitingField !== 'details' && userSession.phase === PHASE.SELECT_DETAILS && looksLikeDetail) {
        logger.warn(`[${jid}] -> Mismatch detected but input looks like details. Proceeding to handle details despite awaitingField=${userSession.awaitingField}`);
    }

    const producto_actual = userSession.currentProduct;
    if (!producto_actual) {
        await say(sock, jid, '⚠️ Error: No hay producto seleccionado. Volviendo al menú.', ctx);
        await sendMainMenu(sock, jid, ctx);
        return;
    }

    const selectedOptions = input.split(/[,\s]+/).filter(Boolean);
    let valid = true;
    const saboresElegidos = [];
    const toppingsElegidos = [];

    if (input.toLowerCase().includes('sin') || input === '0') {
        userSession.saboresSeleccionados = [];
        userSession.toppingsSeleccionados = [];
        // No hay más que hacer aquí, salimos para el siguiente paso.
    } else {
        for (const option of selectedOptions) {
            const upperOption = option.toUpperCase();
            // Support plain numeric selection (e.g. '1' selects first flavor)
            if (/^\d+$/.test(option)) {
                const idx = parseInt(option, 10) - 1;
                if (producto_actual.sabores && idx >= 0 && idx < producto_actual.sabores.length) {
                    saboresElegidos.push(producto_actual.sabores[idx]);
                    continue;
                }
                // If not a sabor, check toppings list as fallback
                if (producto_actual.toppings && idx >= 0 && idx < producto_actual.toppings.length) {
                    toppingsElegidos.push(producto_actual.toppings[idx]);
                    continue;
                }
                valid = false; break;
            }
            if (upperOption.startsWith('S') && producto_actual.sabores) {
                const flavorIndex = parseInt(upperOption.substring(1)) - 1;
                if (flavorIndex >= 0 && flavorIndex < producto_actual.sabores.length) {
                    saboresElegidos.push(producto_actual.sabores[flavorIndex]);
                } else { valid = false; break; }
            } else if (upperOption.startsWith('T') && producto_actual.toppings) {
                const toppingIndex = parseInt(upperOption.substring(1)) - 1;
                if (toppingIndex >= 0 && toppingIndex < producto_actual.toppings.length) {
                    toppingsElegidos.push(producto_actual.toppings[toppingIndex]);
                } else { valid = false; break; }
            } else {
                // Unrecognized token
                valid = false; break;
            }
        }
    }

    if (!valid) {
        userSession.errorCount++;
        await say(sock, jid, `❌ Opción no válida. Usa el formato correcto (ej: S1, T2) o escribe "sin" si no deseas adicionales.`, ctx);
        return; // Detiene la ejecución si la validación falla.
    }

    userSession.saboresSeleccionados = saboresElegidos;
    userSession.toppingsSeleccionados = toppingsElegidos;
    userSession.errorCount = 0;

    // Limpiamos awaitingField y avanzamos a preguntar la cantidad
    // Marca que ahora esperamos la cantidad para evitar re-preguntas o inputs fuera de orden
    userSession.awaitingField = 'quantity';
    userSession.phase = PHASE.SELECT_QUANTITY;
    userSession.errorCount = 0;
    userSession.quantityPromptAt = Date.now(); // <-- timestamp to detect rapid replies
    await say(sock, jid, '🔢 ¿Cuántas unidades de este producto quieres?', ctx);
}

async function handleSelectQuantity(sock, jid, cleanedText, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleSelectQuantity. Cantidad: "${cleanedText}"`);

    // Evitar re-preguntar si no estamos esperando cantidad
    if (userSession.awaitingField && userSession.awaitingField !== 'quantity') {
        logger.info(`[${jid}] -> Ignorando cantidad porque awaitingField=${userSession.awaitingField}`);
        return;
    }

    // Si ya estamos procesando una cantidad para esta sesión, ignorar mensajes simultáneos
    if (userSession.processingQuantity) {
        logger.warn(`[${jid}] -> Ignorando cantidad porque processingQuantity=true. awaitingField=${userSession.awaitingField} lastAdded=${JSON.stringify(userSession.lastAdded)} lastQuantityReceived=${JSON.stringify(userSession.lastQuantityReceived)}`);
        return;
    }

    // Dedupe: if already received same quantity recently, ignore
    const now = Date.now();
    if (!isNaN(parseInt(cleanedText)) && userSession.lastQuantityReceived && userSession.lastQuantityReceived.value === parseInt(cleanedText) && (now - userSession.lastQuantityReceived.at < 6000)) {
        logger.warn(`[${jid}] -> Ignorando cantidad repetida reciente: ${cleanedText}. lastQuantityReceived=${JSON.stringify(userSession.lastQuantityReceived)} awaitingField=${userSession.awaitingField}`);
        return;
    }

    if (!userSession.currentProduct) {
        logger.error(`[${jid}] -> Error: userSession.currentProduct es nulo. Reiniciando chat.`);
        await say(sock, jid, '⚠️ Ocurrió un error. No se encontró el producto que intentabas agregar. Por favor, intenta seleccionarlo de nuevo desde el menú principal.', ctx);
        resetChat(jid, ctx);
        return;
    }

    if (!validateInput(cleanedText, 'number', { max: 50 })) {
        userSession.errorCount++;
        await say(sock, jid, '❌ Por favor, escribe un número válido entre 1 y 50.', ctx);
        return;
    }

    const quantity = parseInt(cleanedText);

    // Dedupe: si ya añadimos el mismo producto y cantidad en los últimos 5s, ignorar mensaje repetido
    if (userSession.lastAdded && userSession.lastAdded.codigo === userSession.currentProduct.CodigoProducto && userSession.lastAdded.cantidad === quantity && (now - userSession.lastAdded.at < 5000)) {
        logger.warn(`[${jid}] -> Ignorando cantidad duplicada para producto ${userSession.currentProduct.CodigoProducto}. lastAdded=${JSON.stringify(userSession.lastAdded)} awaitingField=${userSession.awaitingField} lastMessage=${JSON.stringify(userSession.lastMessage)}`);
        return;
    }

    // Marca que estamos procesando para evitar race conditions
    userSession.processingQuantity = true;

    try {
        // Limpiamos la bandera awaitingField al recibir la cantidad válida
        userSession.awaitingField = null;

        addToCart(ctx, jid, {
            codigo: userSession.currentProduct.CodigoProducto,
            nombre: userSession.currentProduct.NombreProducto,
            precio: userSession.currentProduct.Precio_Venta,
            sabores: userSession.saboresSeleccionados,
            toppings: userSession.toppingsSeleccionados,
        }, quantity);

        // Guardar registro de la última adición para evitar duplicados por reenvíos
        userSession.lastAdded = { codigo: userSession.currentProduct.CodigoProducto, cantidad: quantity, at: Date.now() };

        // After successfully adding to cart, record lastQuantityReceived
        userSession.lastQuantityReceived = { value: quantity, at: Date.now() };

        const totalPrice = userSession.currentProduct.Precio_Venta * quantity;
        await say(sock, jid, `✅ ¡Agregado! *${quantity}x* ${userSession.currentProduct.NombreProducto} - *COP$ ${money(totalPrice)}*`, ctx);

        // Después de agregar, limpiamos currentProduct para evitar que reenvíos vuelvan a añadir el mismo item
        userSession.currentProduct = null;

        userSession.phase = PHASE.BROWSE_IMAGES;
        await say(sock, jid, `¿Qué deseas hacer ahora?\n\n*1)* 🛒 Pagar mi pedido\n*2)* 🍨 Seguir comprando\n*3)* 📋 Volver al menú principal`, ctx);
    } finally {
        // Limpiar flag de procesamiento pase lo que pase
        userSession.processingQuantity = false;
    }
}

async function handleEncargo(sock, jid, input, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleEncargo. Mensaje: "${input}"`);
    await say(sock, jid, `📦 Procesando tu solicitud de encargo... Un agente te contactará pronto.`, ctx);
    if (CONFIG.ADMIN_JID) {
        await say(sock, CONFIG.ADMIN_JID, `📦 SOLICITUD DE ENCARGO:\nCliente: ${jid}\nMensaje: ${input}`, ctx);
    }
    resetChat(jid, ctx);
}

// --- CONFIGURACIÓN DE SOCKET Y TAREAS DE MANTENIMIENTO (Sin cambios) ---
function setupSocketHandlers(sock, ctx) {
    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            if (!msg.message) continue;
             const messageTimestampInSeconds = msg.messageTimestamp;
            const botStartTimeInMs = ctx.startTime;

            if ((messageTimestampInSeconds * 1000) < botStartTimeInMs) {
                logger.info(`[${msg.key.remoteJid}] -> Ignorando mensaje antiguo.`);
                continue; 
            }
            const messageData = {
                from: msg.key.remoteJid,
                text: msg.message?.conversation || msg.message?.extendedTextMessage?.text || '',
                key: msg.key
            };
            if (!messageData.text || !messageData.text.trim()) continue;
            processIncomingMessage(sock, messageData, ctx).catch(error => {
                logger.error('❌ Error crítico al procesar mensaje:', error);
                logUserError(messageData.from, 'main_handler', messageData.text, error.stack);
            });
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
    logger.info('🎯 Event handlers configurados.');
}

function startMaintenanceTasks(ctx) {
    const oneHour = 60 * 60 * 1000;
    const maintenanceInterval = setInterval(() => {
        const now = Date.now();
        let cleanedSessions = 0;
        for (const [jid, session] of Object.entries(ctx.sessions)) {
            if (now - session.lastPromptAt > oneHour) {
                delete ctx.sessions[jid];
                cleanedSessions++;
            }
        }
        if (cleanedSessions > 0) logger.info(`🧹 Limpieza automática: ${cleanedSessions} sesiones inactivas eliminadas`);
    }, oneHour);
    _backgroundIntervals.push(maintenanceInterval);
    logger.info('⚙️ Tareas de mantenimiento iniciadas');
}

function stopBackgroundTasks() {
    for (const id of _backgroundIntervals) {
        try { clearInterval(id); } catch (e) { /* ignore */ }
    }
    _backgroundIntervals = [];
    logger.info('🛑 Background intervals cleared');
}

function initializeBotContext() {
    const ctx = {
        sessions: {},
        botEnabled: true,
        startTime: Date.now(),
        version: '2.0.1', // Versión actualizada con el fix
        mutedChats: new Set() // <-- asegurar que exista para evitar errores al consultar
    };
    logger.info('✅ Contexto del bot inicializado.');
    return ctx;
}


module.exports = {
    setupSocketHandlers,
    startMaintenanceTasks,
    initializeBotContext,
    processIncomingMessage, // export para pruebas y uso externo
    stopBackgroundTasks
};