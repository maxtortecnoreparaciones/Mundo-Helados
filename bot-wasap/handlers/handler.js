'use strict';

const { isGreeting, wantsMenu, money, normalizeText } = require('../utils/util');
const { say, resetChat, addToCart, askGemini, handleProductSelection } = require('../services/bot_core');
const { handleCartSummary, handleEnterAddress, handleEnterName, handleEnterTelefono, handleEnterPaymentMethod, handleConfirmOrder, validateInput, findBestMatch } = require('../services/checkoutHandler');
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

async function handleNaturalLanguageOrder(sock, jid, text, userSession, ctx) {
    logger.info(`[${jid}] -> Procesando con Gemini: "${text}"`);
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
        await say(sock, jid, 'No pude procesar esa petición. Intenta escribiendo "menú".', ctx);
    }
}

async function processIncomingMessage(sock, msg, ctx) {
    try {
        const { from, text, key } = msg;

        // --- INICIO DE LA CORRECCIÓN ---
        // Se mueven estas dos líneas aquí arriba para que siempre estén disponibles
        // para todas las partes de la función, solucionando el error. NO SE BORRA NADA MÁS.
        const cleanedText = text.replace(/[^0-9]/g, '').trim();
        const t = text.toLowerCase().trim();
        // --- FIN DE LA CORRECCIÓN ---

        if (!text || !from || from.includes('status@broadcast') || from.includes('@g.us') || key.fromMe) return;
        
        const jid = from;

        // --- Log de conversación del humano ---
        logConversation(jid, text);

        // --- Bloque de comandos de administrador ---
        if (jid === CONFIG.ADMIN_JID) {
            switch (t) {
                case 'disable':
                    ctx.botEnabled = false;
                    await say(sock, jid, '🔴 Bot desactivado.', ctx);
                    return;
                case 'enable':
                    ctx.botEnabled = true;
                    await say(sock, jid, '🟢 Bot activado.', ctx);
                    return;
            }
        }
        
        if (!ctx.botEnabled) return;
        
        if (processedMessages.has(key.id)) return;
        processedMessages.set(key.id, Date.now());

        const userSession = initializeUserSession(jid, ctx);
        userSession.lastPromptAt = Date.now();
        logger.info(`[${jid}] -> Fase actual: ${userSession.phase}. Mensaje recibido: "${text}"`);

        if (isGreeting(t) || wantsMenu(t)) {
            resetChat(jid, ctx);
            await sendMainMenu(sock, jid, ctx);
            return;
        }

        switch (userSession.phase) {
            case PHASE.SELECCION_OPCION:
                const menuOptions = ['1', '2', '3'];
                const isMenuOption = menuOptions.includes(t) || findBestMatch(t, ['ver menu', 'direccion', 'encargo']);
                if (isMenuOption) {
                    await handleSeleccionOpcion(sock, jid, t, userSession, ctx);
                } else {
                    await handleNaturalLanguageOrder(sock, jid, text, userSession, ctx);
                }
                break;
            case PHASE.BROWSE_IMAGES:
                const postAddOptions = ['1', 'pagar', 'carrito', '2', '3', 'menu'];
                const bestMatch = findBestMatch(t, postAddOptions);
                if (bestMatch) {
                    if (bestMatch === '1' || bestMatch === 'pagar' || bestMatch === 'carrito') {
                        await handleCartSummary(sock, jid, userSession, ctx);
                    } else if (bestMatch === '2') {
                        await say(sock, jid, '¡Perfecto! Escribe el nombre del siguiente producto que deseas añadir.', ctx);
                    } else if (bestMatch === '3' || bestMatch === 'menu') {
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
            case PHASE.ENCARGO:
                await handleEncargo(sock, jid, t, userSession, ctx);
                break;
            default:
                await handleNaturalLanguageOrder(sock, jid, text, userSession, ctx);
                break;
        }
    } catch (error) {
        console.error('Error al procesar mensaje:', error);
        logUserError(msg.from, 'main_handler', msg.text, error.stack);
        await say(sock, msg.from, '⚠️ Ocurrió un error. Por favor, intenta de nuevo.', ctx);
    }
}

async function handleSeleccionProducto(sock, jid, input, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleSeleccionProducto. Selección: "${input}"`);
    
    const matches = userSession.lastMatches;
    const selection = parseInt(input);
    
    if (!isNaN(selection) && selection >= 1 && selection <= matches.length) {
        
        const productoSeleccionado = matches[selection - 1];
        userSession.currentProduct = productoSeleccionado;
        userSession.phase = PHASE.SELECT_DETAILS;

        const saboresRequeridos = productoSeleccionado.saboresRequeridos;
        let mensajeSabores = '';
        if (saboresRequeridos > 1) {
            mensajeSabores = `Elige ${saboresRequeridos} sabores de la lista (ej: S1, S3):\n\n`;
        } else {
            mensajeSabores = `Elige 1 sabor de la lista (ej: S1):\n\n`;
        }

        const listaSabores = "S1) Chocolate\nS2) fresa\nS3) vainilla\nS4) cainilla chips\nS5) arequipe\nS6) ron pasas\nS7) frutos del boque\nS8) arcoiris\nS9) brownie\n";
        const listaToppings = "T1) Fresas Frescas\nT2) crema chantilly\n...";
        
        const mensaje = `Has seleccionado: *${productoSeleccionado.nombre}* — $ ${money(productoSeleccionado.precio)}\n` +
                        `${productoSeleccionado.descripcion || ''}\n\n` +
                        `${mensajeSabores}${listaSabores}\n\n` +
                        `*Elige hasta 23 toppings (ej: T1, T2):*\n${listaToppings}`;

        say(sock, jid, mensaje, ctx).then(() => {
            // Lógica después de enviar el mensaje, si es necesaria
        }).catch(err => {
            logger.error(`Error al enviar mensaje: ${err}`);
        });

    } else {
        say(sock, jid, '❌ Por favor, elige un número válido de la lista.', ctx).catch(err => {
            logger.error(`Error al enviar mensaje de error: ${err}`);
        });
    }
}


function handleSelectDetails(sock, jid, input, userSession, ctx) {
    // Elimina el 'async' del inicio de la función
    // y usa .then() en lugar de await para las llamadas a 'say'
    // ... (la misma lógica de validación) ...

    say(sock, jid, '✅ Sabores y toppings agregados. ¿Cuántas unidades de este producto quieres?', ctx)
        .then(() => {
            userSession.phase = PHASE.SELECT_QUANTITY;
        })
        .catch(err => {
            logger.error(`Error al enviar mensaje: ${err}`);
        });
    
    // Y así con todos los 'await say' que tengas en esta función
}

// NUEVA FUNCIÓN para manejar los sabores uno por uno
async function handleSelectNextSabor(sock, jid, input, userSession, ctx) {
    const selection = input.toLowerCase().trim();
    if (selection.startsWith('s')) {
        const index = parseInt(selection.substring(1));
        const saboresDisponibles = ['chocolate', 'fresa', 'vainilla', 'vainilla chips', 'arequipe', 'ron pasas', 'frutos del boque', 'arcoiris', 'brownie'];
        
        if (!isNaN(index) && index > 0 && index <= saboresDisponibles.length) {
            userSession.saboresSeleccionados.push(saboresDisponibles[index - 1]);
            const saboresRequeridos = userSession.currentProduct.saboresRequeridos;
            const saboresActuales = userSession.saboresSeleccionados.length;
            
            if (saboresActuales < saboresRequeridos) {
                await say(sock, jid, `✅ Has seleccionado: *${saboresDisponibles[index - 1]}*. ¡Te faltan ${saboresRequeridos - saboresActuales} sabores! Elige el siguiente:`, ctx);
            } else {
                // Si ya se completaron los sabores requeridos, preguntar por los toppings
                await say(sock, jid, '✅ Todos los sabores agregados. Ahora, elige tus toppings (ej: T1, T2):', ctx);
                userSession.phase = PHASE.SELECT_TOPPINGS;
            }
        } else {
            await say(sock, jid, '❌ Por favor, elige un sabor válido de la lista (ej: S1).', ctx);
        }
    } else if (selection.startsWith('t')) {
        // Lógica para manejar la selección de toppings si el cliente los envía antes de terminar con los sabores
        // ... (Tu lógica de validación de toppings) ...
        await say(sock, jid, 'Por favor, termina de elegir tus sabores antes de seleccionar toppings.', ctx);
    } else {
        await say(sock, jid, '❌ Por favor, elige un sabor válido.', ctx);
    }
}



async function handleSelectQuantity(sock, jid, cleanedText, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleSelectQuantity. Cantidad: "${cleanedText}"`);
    if (!userSession.currentProduct) {
        await say(sock, jid, '⚠️ Ocurrió un error, no se encontró el producto.', ctx);
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
    const nextStepMessage = `¿Qué deseas hacer ahora?\n\n*1)* 🛒 Ver mi pedido y pagar\n*2)* 🍨 Añadir otro producto\n*3)* 📋 Volver al menú principal\n\n_Responde con un número o una palabra clave._`;
    await say(sock, jid, nextStepMessage, ctx);
}

async function handleEncargo(sock, jid, input, userSession, ctx) {
    await say(sock, jid, `📦 Procesando tu solicitud de encargo... Un agente te contactará pronto.`, ctx);
    if (CONFIG.ADMIN_JID) {
        await say(sock, CONFIG.ADMIN_JID, `📦 SOLICITUD DE ENCARGO:\nCliente: ${jid}\nMensaje: ${input}`, ctx);
    }
    resetChat(jid, ctx);
}

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
        version: '3.2.0' // Versión final con IA
    };
    logger.info('✅ Contexto del bot inicializado.');
    return ctx;
}

module.exports = {
    setupSocketHandlers,
    startMaintenanceTasks,
    initializeBotContext
};