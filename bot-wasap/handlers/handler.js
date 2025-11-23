'use strict';

<<<<<<< HEAD
const { isGreeting, wantsMenu, money, normalizeText } = require('../utils/util');
const { say, resetChat, addToCart, askGemini, handleProductSelection } = require('../services/bot_core');
const { handleCartSummary, handleEnterAddress, handleEnterName, handleEnterTelefono, handleEnterPaymentMethod, handleConfirmOrder, validateInput, findBestMatch } = require('../services/checkoutHandler');
const { sendMainMenu, handleSeleccionOpcion, handleBrowseImages } = require('./menuHandler');
const { logConversation, logUserError, logger } = require('../utils/logger');
const PHASE = require('../utils/phases');
const CONFIG = require('../config.json');
=======
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
    sleep
} = require('../services/bot_core');
const {
    handleCartSummary,
    handleEnterAddress,
    handleEnterName,
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
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)

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

<<<<<<< HEAD

function initializeUserSession(jid, ctx) {
    if (!ctx.sessions[jid]) {
        ctx.sessions[jid] = {
            phase: PHASE.SELECCION_OPCION, lastPromptAt: Date.now(), errorCount: 0,
            order: { items: [] }, currentProduct: null, saboresSeleccionados: [],
            toppingsSeleccionados: [], lastMatches: [], createdAt: Date.now()
        };
    }
=======
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
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
    if (!ctx.sessions[jid].order) {
        ctx.sessions[jid].order = { items: [] };
    }
    return ctx.sessions[jid];
}

<<<<<<< HEAD
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
=======
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)

async function processIncomingMessage(sock, msg, ctx) {
    try {
        const { from, text, key } = msg;
<<<<<<< HEAD

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
=======
        const cleanedText = text.replace(/[^0-9]/g, '').trim();
        const t = text.toLowerCase().trim();

        if (!text || !from || from.includes('status@broadcast') || from.includes('@g.us') || key.fromMe) return;

        if (processedMessages.has(key.id)) return;
        processedMessages.set(key.id, Date.now());

        logConversation(from, text);
        const jid = from;

        const userSession = initializeUserSession(jid, ctx);
        const now = Date.now();
        userSession.lastPromptAt = now;

        logger.info(`[${jid}] -> Fase actual: ${userSession.phase}. Mensaje recibido: "${text}"`);

        // --- LÓGICA DE ADMINISTRADOR (Sin cambios) ---
        if (jid === CONFIG.ADMIN_JID) {
            switch (t) {
                case 'test':
                    await say(sock, jid, `🤖 Bot funcionando. Sesiones activas: ${Object.keys(ctx.sessions).length}`, ctx);
                    return;
                case 'reset':
                    resetChat(jid, ctx);
                    await say(sock, jid, '🔄 Chat reiniciado. ✅', ctx);
                    return;
                case 'disable':
                    ctx.botEnabled = false;
                    await say(sock, jid, '🔴 Bot desactivado. 📴', ctx);
                    return;
                case 'enable':
                    ctx.botEnabled = true;
                    await say(sock, jid, '🟢 Bot activado. 🔛', ctx);
                    return;
            }
        }

        if (!ctx.botEnabled && jid !== CONFIG.ADMIN_JID) {
            // No es necesario un await aquí, podemos dejar que se envíe en segundo plano
            say(sock, jid, '🚫 Bot desactivado temporalmente. 😔', ctx);
            return;
        }

        // --- LÓGICA DE REINICIO Y COMANDOS GLOBALES ---
        if (isGreeting(t) || wantsMenu(t) || shouldResetForInactivity(userSession, now)) {
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
            resetChat(jid, ctx);
            await sendMainMenu(sock, jid, ctx);
            return;
        }

<<<<<<< HEAD
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
=======
        // =================================================================================
        // CAMBIO 2: LLAMADA EXPLÍCITA Y SEGURA AL RESUMEN DEL CARRITO
        // Esta sección ahora maneja de forma centralizada la solicitud de ver el carrito.
        // La lógica ya no está dispersa, evitando llamadas accidentales.
        // =================================================================================
        if (t === 'pagar' || t === 'carrito' || t === 'ver carrito') {
            // NOTA: Asegúrate de que tu función `handleCartSummary` en `checkoutHandler.js`
            // también tenga la verificación de seguridad que discutimos.
            await handleCartSummary(sock, jid, userSession, ctx);
            return;
        }


        // --- MANEJADOR DE FASES (SWITCH PRINCIPAL) ---
        switch (userSession.phase) {
            case PHASE.SELECCION_OPCION:
                await handleSeleccionOpcion(sock, jid, t, userSession, ctx);
                break;
            case PHASE.BROWSE_IMAGES:
                await handleBrowseImages(sock, jid, t, userSession, ctx);
                // CAMBIO 3: Se elimina cualquier llamada posterior. El 'break' asegura
                // que el bot espere la siguiente acción del usuario, corrigiendo el flujo del log.
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
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
<<<<<<< HEAD
            case PHASE.CHECK_TELEFONO:
                await handleEnterTelefono(sock, jid, text, userSession, ctx);
                break;
=======
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
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
<<<<<<< HEAD
                await handleNaturalLanguageOrder(sock, jid, text, userSession, ctx);
                break;
        }
    } catch (error) {
        console.error('Error al procesar mensaje:', error);
        logUserError(msg.from, 'main_handler', msg.text, error.stack);
        await say(sock, msg.from, '⚠️ Ocurrió un error. Por favor, intenta de nuevo.', ctx);
=======
                logger.warn(`[${jid}] -> Fase inesperada o indefinida: "${userSession.phase}". Mensaje no procesado por el switch.`);
                userSession.errorCount++;
                await say(sock, jid, '⚠️ Ocurrió un error. Escribe "menú" para volver al inicio.', ctx);
                break;
        }

        if (userSession.errorCount > 3) {
            logger.warn(`Demasiados errores para ${jid}, reiniciando chat.`);
            resetChat(jid, ctx);
            await say(sock, jid, 'Hemos reiniciado el chat debido a múltiples intentos fallidos. Por favor, intenta de nuevo.', ctx);
        }

    } catch (error) {
        console.error('Error al procesar mensaje:', error);
        logUserError(msg.from, 'main_handler', msg.text, error.stack);
        try {
            await say(sock, msg.from, '⚠️ Ocurrió un error. Por favor, intenta de nuevo o escribe "menu" para volver al inicio.', ctx);
        } catch (e) {
            logger.error('Error al enviar mensaje de error:', e);
        }
    }
}

// =================================================================================
// EL RESTO DEL ARCHIVO PERMANECE IGUAL, YA QUE LA LÓGICA DE CADA FUNCIÓN
// PARECE CORRECTA. EL PROBLEMA ESTABA EN LA GESTIÓN DE LA SESIÓN Y EL FLUJO.
// =================================================================================


async function sendMainMenu(sock, jid, ctx) {
    const welcomeMessage = `Holiii ☺️
Como estas? Somos heladeria mundo helados en riohacha🍦

*1)* 🛍️ Ver nuestro menú y hacer un pedido
*2)* 📍 Dirección y horarios
*3)* 📦 Pedidos por encargo (litros, eventos y grandes cantidades)

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
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
    }
}

async function handleSeleccionProducto(sock, jid, input, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleSeleccionProducto. Selección: "${input}"`);
<<<<<<< HEAD
    
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
=======
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
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
        await say(sock, jid, '❌ Por favor, escribe un número válido entre 1 y 50.', ctx);
        return;
    }

<<<<<<< HEAD
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
=======
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
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
    await say(sock, jid, `📦 Procesando tu solicitud de encargo... Un agente te contactará pronto.`, ctx);
    if (CONFIG.ADMIN_JID) {
        await say(sock, CONFIG.ADMIN_JID, `📦 SOLICITUD DE ENCARGO:\nCliente: ${jid}\nMensaje: ${input}`, ctx);
    }
    resetChat(jid, ctx);
}

<<<<<<< HEAD
=======
// --- CONFIGURACIÓN DE SOCKET Y TAREAS DE MANTENIMIENTO (Sin cambios) ---
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
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
<<<<<<< HEAD
            processIncomingMessage(sock, messageData, ctx);
=======
            processIncomingMessage(sock, messageData, ctx).catch(error => {
                logger.error('❌ Error crítico al procesar mensaje:', error);
                logUserError(messageData.from, 'main_handler', messageData.text, error.stack);
            });
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
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
<<<<<<< HEAD
    sock.ev.on('creds.update', () => logger.info('🔑 Credenciales actualizadas'));
=======

    sock.ev.on('creds.update', () => logger.info('🔑 Credenciales actualizadas'));
    logger.info('🎯 Event handlers configurados.');
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
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
<<<<<<< HEAD
=======
    logger.info('⚙️ Tareas de mantenimiento iniciadas');
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
}

function initializeBotContext() {
    const ctx = {
        sessions: {},
        botEnabled: true,
        startTime: Date.now(),
<<<<<<< HEAD
        version: '3.2.0' // Versión final con IA
=======
        version: '2.0.1' // Versión actualizada con el fix
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
    };
    logger.info('✅ Contexto del bot inicializado.');
    return ctx;
}

<<<<<<< HEAD
=======

>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
module.exports = {
    setupSocketHandlers,
    startMaintenanceTasks,
    initializeBotContext
};