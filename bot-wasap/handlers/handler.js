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
    validateInput
    
} = require('../services/checkoutHandler');
const {
    logConversation,
    logUserError,
    logger
} = require('../utils/logger');
const PHASE = require('../utils/phases');
const CONFIG = require('../config.json');
const ENDPOINTS = CONFIG.ENDPOINTS;

// --- FUNCIONES AUXILIARES (Sin cambios) ---
function normalizeText(text) {
    if (!text) return '';
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

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
async function handleNaturalLanguageOrder(sock, jid, text, userSession, ctx) {
    logger.info(`[${jid}] -> Procesando con MIA: "${text}"`);
    const jsonResponse = await askGemini(ctx, text);

    if (!jsonResponse) {
        userSession.erroresMIA = (userSession.erroresMIA || 0) + 1;
        if (userSession.erroresMIA >= 2) {
            ctx.mutedChats.add(jid);
            const notification = `🔔 ¡ATENCIÓN! 🔔\n\nEl cliente ${jid.split('@')[0]} necesita ayuda. MIA no entendió su petición dos veces.\nEl bot ha sido silenciado para este chat.\n\nPara reactivar, escribe: *mia activa*`;
            const ADMINS_TO_NOTIFY = [CONFIG.ADMIN_JID, CONFIG.SOCIA_JID].filter(Boolean);
            for (const adminJid of ADMINS_TO_NOTIFY) {
                if (adminJid) await say(sock, adminJid, notification, ctx);
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



if (jid === CONFIG.ADMIN_JID || jid === CONFIG.SOCIA_JID) {
            if (t === 'yo continuo') {
                const customerJid = userSession.lastCustomerJid;
                if (customerJid) {
                    ctx.mutedChats.add(customerJid);
                    await say(sock, jid, `✅ Bot silenciado para el chat con ${customerJid.split('@')[0]}. Ya puedes hablar.`, ctx);
                }
                return;
            }
            if (t === 'mia activa') {
                const customerJid = userSession.lastCustomerJid;
                if (customerJid && ctx.mutedChats.has(customerJid)) {
                    ctx.mutedChats.delete(customerJid);
                    await say(sock, jid, `✅ Bot reactivado para el chat con ${customerJid.split('@')[0]}.`, ctx);
                    await say(sock, customerJid, '¡Hola! Soy MIA y estoy de vuelta para ayudarte. Escribe *menú* si lo necesitas.', ctx);
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

        const userSession = initializeUserSession(jid, ctx);
        userSession.lastPromptAt = Date.now();
        logger.info(`[${jid}] -> Fase actual: ${userSession.phase}. Mensaje recibido: "${text}"`);

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
            await handleNaturalLanguageOrder(sock, jid, text, userSession, ctx);
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
        // Si no es una opción, es una búsqueda de producto.
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
    // Verificamos si es una confirmación inicial (después del carrito) o la final
    const isInitialConfirmation = validateInput(t, 'confirmation');

    // SI ES LA CONFIRMACIÓN INICIAL Y AÚN NO TENEMOS LA DIRECCIÓN:
    if (isInitialConfirmation && !userSession.order.address) {
        logger.info(`[${jid}] -> Confirmación inicial detectada. Pasando a pedir dirección.`);
        userSession.phase = PHASE.CHECK_DIR; // <-- ¡Paso clave!
        await say(sock, jid, '🏠 ¡Perfecto! Para continuar, por favor escribe tu *dirección de entrega*.', ctx);
    } 
    // SI YA ESTAMOS EN EL PROCESO DE CONFIRMACIÓN FINAL (o editando):
    else {
        await handleConfirmOrder(sock, jid, t, userSession, ctx);
    }
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

        const errorMessageForAdmin = `🔴 *¡Error Crítico en el Bot!* 🔴\n\n- *Cliente:* ${msg.from}\n- *Mensaje:* "${msg.text}"\n- *Error:* ${error.message}\n\nPor favor, revisa la consola o los logs para más detalles.`;
        if (CONFIG.ADMIN_JIDS && CONFIG.ADMIN_JIDS.length > 0) {
            for (const adminJid of CONFIG.ADMIN_JIDS) {
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

        case '2':
            await say(sock, jid, `📍 *Nuestra ubicación:* Cra 7h n 34 b 08\n🕐 *Horario de atención:* Todos los días de 2:00 PM a 10:00 PM`, ctx);
            await sleep(1500);
            await sendMainMenu(sock, jid, ctx);
            break;

        case '3':
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
}

async function handleSelectDetails(sock, jid, input, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleSelectDetails. Input: "${input}"`);
    const producto_actual = userSession.currentProduct;
    if (!producto_actual) {
        await say(sock, jid, '⚠️ Error: No hay producto seleccionado. Volviendo al menú.', ctx);
        await sendMainMenu(sock, jid, ctx);
        return;
    }

    const selectedOptions = input.split(/[\s,]+/).filter(Boolean);
    let valid = true;
    const saboresElegidos = [];
    const toppingsElegidos = [];

    if (input.toLowerCase().includes('sin') || input === '0') {
        userSession.saboresSeleccionados = [];
        userSession.toppingsSeleccionados = [];
    } else {
        for (const option of selectedOptions) {
            const upperOption = option.toUpperCase();
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
            }
        }
        if (!valid) {
            userSession.errorCount++;
            await say(sock, jid, `❌ Opción no válida. Usa *S1, T2* o *sin*.`, ctx);
            return;
        }
        userSession.saboresSeleccionados = saboresElegidos;
        userSession.toppingsSeleccionados = toppingsElegidos;
    }

    await say(sock, jid, '🔢 ¿Cuántas unidades de este producto quieres?', ctx);
    userSession.phase = PHASE.SELECT_QUANTITY;
    userSession.errorCount = 0;
}

async function handleSelectQuantity(sock, jid, cleanedText, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleSelectQuantity. Cantidad: "${cleanedText}"`);
    if (!userSession.currentProduct) {
        logger.error(`[${jid}] -> Error: userSession.currentProduct es nulo. Reiniciando chat.`);
        userSession.errorCount++;
        await say(sock, jid, '⚠️ Ocurrió un error. No se encontró el producto que intentabas agregar. Por favor, intenta seleccionarlo de nuevo desde el menú principal.', ctx);
        resetChat(jid, ctx);
        return;
    }

    const quantity = parseInt(cleanedText);
    if (!validateInput(cleanedText, 'number', { max: 50 })) {
        userSession.errorCount++;
        await say(sock, jid, '❌ Por favor, escribe un número válido entre 1 y 50.', ctx);
        return;
    }

    addToCart(ctx, jid, {
        codigo: userSession.currentProduct.CodigoProducto,
        nombre: userSession.currentProduct.NombreProducto,
        precio: userSession.currentProduct.Precio_Venta,
        sabores: userSession.saboresSeleccionados,
        toppings: userSession.toppingsSeleccionados,
    }, quantity);

    const totalPrice = userSession.currentProduct.Precio_Venta * quantity;
    await say(sock, jid, `✅ ¡Agregado! *${quantity}x* ${userSession.currentProduct.NombreProducto} - *COP$${money(totalPrice)}*`, ctx);

    // Se cambia la fase a BROWSE_IMAGES para permitir añadir más productos.
    userSession.phase = PHASE.BROWSE_IMAGES;

    await say(sock, jid, `¿Qué deseas hacer ahora?\n\n🛒 Escribe *carrito* o *pagar* - Ver tu pedido\n🍨 Escribe el nombre o una palabra de otro producto para seguir comprando\n📋 Escribe *menu* - Volver al menú principal`, ctx);
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
    logger.info('⚙️ Tareas de mantenimiento iniciadas');
}

function initializeBotContext() {
    const ctx = {
        sessions: {},
        botEnabled: true,
        startTime: Date.now(),
        version: '2.0.1' // Versión actualizada con el fix
    };
    logger.info('✅ Contexto del bot inicializado.');
    return ctx;
}


module.exports = {
    setupSocketHandlers,
    startMaintenanceTasks,
    initializeBotContext
};