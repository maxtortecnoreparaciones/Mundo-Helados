<<<<<<< HEAD
=======
// RUTA: services/checkoutHandler.js - CORREGIDO Y ACTUALIZADO

>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
<<<<<<< HEAD
const levenshtein = require('fast-levenshtein');
=======
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
const { say, sendImage } = require('./bot_core');
const { money } = require('../utils/util');
const { logger } = require('../utils/logger');
const PHASE = require('../utils/phases');
const CONFIG = require('../config.json');

<<<<<<< HEAD
=======

// =================================================================================
// CAMBIO 1: SE CREA UNA FUNCIÓN INTERNA PARA GENERAR EL RESUMEN DEL CARRITO.
// Esta función no se exporta, solo la usan las demás funciones de este archivo.
// Elimina la dependencia de `bot_core.js` y soluciona el error `cartSummary is not a function`.
// También corrige cómo se muestran los sabores y toppings.
// =================================================================================
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
function generateCartSummary(userSession) {
    if (!userSession || !userSession.order || !userSession.order.items) {
        return { text: 'Tu carrito está vacío.', total: 0 };
    }
<<<<<<< HEAD
=======

>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
    let total = 0;
    const summaryLines = userSession.order.items.map(item => {
        const itemTotal = item.precio * item.cantidad;
        total += itemTotal;
        let itemText = `*${item.cantidad}x* ${item.nombre} - *${money(itemTotal)}*`;
<<<<<<< HEAD
=======

        // CORRECCIÓN: Se mapea el nombre del sabor/topping correctamente.
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
        if (item.sabores && item.sabores.length > 0) {
            itemText += `\n  sabores: _${item.sabores.map(s => s.NombreProducto).join(', ')}_`;
        }
        if (item.toppings && item.toppings.length > 0) {
            itemText += `\n  toppings: _${item.toppings.map(t => t.NombreProducto).join(', ')}_`;
        }
        return itemText;
    });
<<<<<<< HEAD
=======

>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
    return {
        text: summaryLines.join('\n\n'),
        total: total
    };
}

<<<<<<< HEAD
function findBestMatch(input, options, threshold = 2) {
    const cleanInput = input.toLowerCase().trim();
    let bestMatch = null;
    let minDistance = Infinity;

    for (const option of options) {
        const distance = levenshtein.get(cleanInput, option.toLowerCase().trim());
        if (distance < minDistance && distance <= threshold) {
            minDistance = distance;
            bestMatch = option;
        }
    }
    return bestMatch;
}
=======
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)

function validateInput(input, expectedType, options = {}) {
    const cleanInput = input.toLowerCase().trim();
    switch (expectedType) {
<<<<<<< HEAD
        case 'payment':
            return findBestMatch(cleanInput, ['transferencia', 'efectivo']);
=======
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
        case 'number':
            const num = parseInt(cleanInput);
            return !isNaN(num) && num > 0 && (options.max ? num <= options.max : true);
        case 'confirmation':
<<<<<<< HEAD
            return ['si', 'sí', 'yes', 'y', 'confirmar', '1'].includes(cleanInput);
=======
            return ['si', 'sí', 'yes', 'y', 'confirmar', '1'].includes(cleanInput); // Añadido '1'
        case 'cancellation':
            return ['no', 'n', 'cancelar'].includes(cleanInput);
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
        case 'address':
            return cleanInput.length >= 8;
        case 'string':
            return cleanInput.length >= (options.minLength || 3);
<<<<<<< HEAD
=======
        case 'edit':
            return ['editar'].includes(cleanInput);
        case 'payment':
            return ['transferencia', 'efectivo'].includes(cleanInput);
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
        default:
            return cleanInput.length > 0;
    }
}

async function handleCartSummary(sock, jid, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleCartSummary.`);
<<<<<<< HEAD
    if (!userSession.order || userSession.order.items.length === 0) {
        logger.info(`[${jid}] -> Carrito vacío.`);
        await say(sock, jid, `🛒 Tu carrito está vacío. Escribe *menú* para empezar a comprar.`, ctx);
        return;
    }
    const summary = generateCartSummary(userSession);
    const summaryMessage = `📝 *Este es tu pedido actual:*\n\n${summary.text}\n\n*Total del pedido: ${money(summary.total)}*`;
    await say(sock, jid, summaryMessage, ctx);
    const addressPrompt = `Para continuar con el envío, por favor, escribe tu *dirección completa* o escribe *reservar* para si vienes al negocio, recuerda debes pagarla para que se aliste.`;
    await say(sock, jid, addressPrompt, ctx);
    userSession.phase = PHASE.CHECK_DIR;
    logger.info(`[${jid}] -> Carrito mostrado. Pasando a la fase de solicitar dirección: ${userSession.phase}`);
=======
    
    if (!userSession.order || userSession.order.items.length === 0) {
        logger.info(`[${jid}] -> Carrito vacío. Volviendo al menú principal.`);
        await say(sock, jid, `🛒 Tu carrito está vacío. Escribe *menú* para empezar a comprar.`, ctx);
        userSession.phase = PHASE.SELECCION_OPCION; // Devuelve al usuario a un estado seguro
        return;
    }

    // CAMBIO 2: Se utiliza la nueva función interna `generateCartSummary`.
    const summary = generateCartSummary(userSession);

    const fullMessage = `📝 *Este es tu pedido actual:*\n\n${summary.text}\n\n*Total del pedido: ${money(summary.total)}*\n\n¿Qué deseas hacer?\n\n*1)* ✅ Confirmar y finalizar pedido\n*2)* ➕ Seguir comprando\n*3)* ✏️ Editar mi pedido (Próximamente)\n*4)* 🗑️ Vaciar carrito y empezar de nuevo`;

    await say(sock, jid, fullMessage, ctx);
    userSession.phase = PHASE.CONFIRM_ORDER;
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
}

async function handleEnterAddress(sock, jid, address, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleEnterAddress. Dirección recibida: "${address}"`);
<<<<<<< HEAD
=======

>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
    if (!validateInput(address, 'address')) {
        userSession.errorCount++;
        await say(sock, jid, '❌ Por favor, proporciona una dirección más detallada (mínimo 8 caracteres).', ctx);
        return;
    }
<<<<<<< HEAD
    if (!userSession.order) userSession.order = {};
    userSession.order.address = address.trim();
=======

    if (!userSession.order) userSession.order = {};
    userSession.order.address = address.trim();

>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
    userSession.phase = PHASE.CHECK_NAME;
    await say(sock, jid, `👤 ¿A nombre de quién va el pedido? Escribe tu nombre completo.`, ctx);
    userSession.errorCount = 0;
    logger.info(`[${jid}] -> Fase cambiada a ${userSession.phase}. Solicitando nombre.`);
}

async function handleEnterName(sock, jid, input, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleEnterName. Nombre recibido: "${input}"`);
    if (!validateInput(input, 'string', { minLength: 3 })) {
        userSession.errorCount++;
        await say(sock, jid, '❌ Por favor, escribe un nombre válido (mínimo 3 caracteres).', ctx);
        return;
    }
<<<<<<< HEAD
    userSession.order.name = input.trim();
    userSession.phase = PHASE.CHECK_TELEFONO;
    userSession.errorCount = 0;
    await say(sock, jid, '📞 Ahora, por favor, escribe el número de teléfono para contactarte por la entrega.', ctx);
    logger.info(`[${jid}] -> Fase cambiada a ${userSession.phase}. Solicitando teléfono.`);
}

async function handleEnterTelefono(sock, jid, input, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleEnterTelefono. Teléfono recibido: "${input}"`);
    const telefono = input.replace(/[^0-9]/g, '').trim();
    if (!validateInput(telefono, 'string', { minLength: 10 })) {
        userSession.errorCount++;
        await say(sock, jid, '❌ Por favor, escribe un número de teléfono válido (mínimo 10 dígitos).', ctx);
        return;
    }
    userSession.order.telefono = telefono;
    userSession.phase = PHASE.CHECK_PAGO;
    userSession.errorCount = 0;
=======

    userSession.order.name = input.trim();
    userSession.phase = PHASE.CHECK_PAGO;
    userSession.errorCount = 0;

>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
    await say(sock, jid, '💳 ¿Cómo vas a pagar? Escribe *Transferencia* o *Efectivo*.', ctx);
    logger.info(`[${jid}] -> Fase cambiada a ${userSession.phase}. Solicitando método de pago.`);
}

async function handleEnterPaymentMethod(sock, jid, input, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleEnterPaymentMethod. Método de pago recibido: "${input}"`);
<<<<<<< HEAD
    const paymentMethod = validateInput(input, 'payment');
    if (!paymentMethod) {
=======
    const paymentMethod = input.toLowerCase().trim();
    if (!validateInput(paymentMethod, 'payment')) {
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
        userSession.errorCount++;
        await say(sock, jid, '❌ Opción no válida. Por favor, escribe *Transferencia* o *Efectivo*.', ctx);
        return;
    }
<<<<<<< HEAD
    userSession.order.paymentMethod = paymentMethod;
    userSession.errorCount = 0;
    if (paymentMethod === 'transferencia') {
        const qrPath = path.join(__dirname, 'qr_code.jpg');
        if (fs.existsSync(qrPath)) {
            await sendImage(sock, jid, qrPath, 'Escanea el siguiente código QR para realizar el pago...Recuerda enviarnos el comprobante.', ctx);
        } else {
            await say(sock, jid, 'Realiza el pago a Nequi 3136939636...', ctx);
        }
    }
    userSession.phase = PHASE.CONFIRM_ORDER;
    const summary = generateCartSummary(userSession);
    userSession.order.deliveryCost = 0;
    const orderTotal = summary.total + (userSession.order.deliveryCost || 0);
    const summaryText = `📝 *Resumen final del pedido*\n\n*Productos:*\n${summary.text}\n\nSubtotal: ${money(summary.total)}\nDomicilio: Por confirmar\n*Total a pagar: ${money(orderTotal)}*\n\n*Datos de entrega:*\n👤 Nombre: ${userSession.order.name}\n📞 Teléfono: ${userSession.order.telefono}\n🏠 Dirección: ${userSession.order.address}\n💳 Pago: ${userSession.order.paymentMethod}\n\n¿Está todo correcto?\nEscribe *confirmar* para finalizar o *editar*.`;
=======

    userSession.order.paymentMethod = paymentMethod;
    userSession.errorCount = 0;

    if (paymentMethod === 'transferencia') {
        const qrPath = path.join(__dirname, '../qr.png');
        if (fs.existsSync(qrPath)) {
            await sendImage(sock, jid, qrPath, 'Escanea el siguiente código QR para realizar el pago. Recuerda enviarnos la imagen del pago por favor.', ctx);
        } else {
            await say(sock, jid, 'Realiza el pago a Nequi 123456789. Recuerda enviarnos el comprobante.', ctx);
        }
    }

    userSession.phase = PHASE.CONFIRM_ORDER;
    // CAMBIO 3: Se utiliza la nueva función interna `generateCartSummary`.
    const summary = generateCartSummary(userSession);
    userSession.order.deliveryCost = 0; // Costo de domicilio (puedes calcularlo aquí)
    const orderTotal = summary.total + (userSession.order.deliveryCost || 0);

    const summaryText = `📝 *Resumen final del pedido*\n\n` +
        `*Productos:*\n${summary.text}\n\n` +
        `Subtotal: ${money(summary.total)}\n` +
        `Domicilio: ${money(userSession.order.deliveryCost)}\n` +
        `*Total a pagar: ${money(orderTotal)}*\n\n` +
        `*Datos de entrega:*\n` +
        `👤 Nombre: ${userSession.order.name}\n` +
        `🏠 Dirección: ${userSession.order.address}\n` +
        `💳 Pago: ${userSession.order.paymentMethod}\n\n` +
        `¿Está todo correcto?\nEscribe *confirmar* para finalizar o *editar* para cambiar algún dato.`;

>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
    await say(sock, jid, summaryText, ctx);
    logger.info(`[${jid}] -> Fase cambiada a ${userSession.phase}. Mostrando resumen.`);
}

async function handleConfirmOrder(sock, jid, input, userSession, ctx) {
    const confirmation = input.toLowerCase().trim();
<<<<<<< HEAD
    if (validateInput(confirmation, 'confirmation')) {
        await confirmAndProcessOrder(sock, jid, userSession, ctx);
    } else if (findBestMatch(confirmation, ['editar', 'cambiar', 'corregir'])) {
        await say(sock, jid, '📝 Para editar, empecemos de nuevo. Por favor, escribe tu *dirección*:', ctx);
=======

    // Redirige las opciones numéricas a la lógica de confirmación del pedido
    if (['1', '2', '3', '4'].includes(confirmation) && userSession.phase === PHASE.CONFIRM_ORDER) {
        switch (confirmation) {
            case '1':
                // Continuar con la confirmación
                break;
            case '2':
                userSession.phase = PHASE.BROWSE_IMAGES;
                await say(sock, jid, 'Claro, puedes seguir comprando. Escribe el nombre de otro producto o "menú" para ver las opciones.', ctx);
                return;
            case '3': // Editar (Próximamente)
                await say(sock, jid, 'La función para editar el pedido estará disponible pronto. Por ahora, puedes cancelar y empezar de nuevo escribiendo "menú".', ctx);
                return;
            case '4': // Vaciar carrito
                userSession.order.items = [];
                userSession.phase = PHASE.BROWSE_IMAGES;
                await say(sock, jid, '🗑️ Tu carrito ha sido vaciado. ¡Empecemos de nuevo! Escribe "menú".', ctx);
                return;
        }
    }


    if (validateInput(confirmation, 'confirmation')) {
        try {
            if (!userSession.order.items || userSession.order.items.length === 0) {
                await say(sock, jid, '⚠️ Tu carrito está vacío. No se puede confirmar un pedido sin productos.', ctx);
                resetChat(jid, ctx);
                return;
            }

            // CAMBIO 4: Se utiliza la nueva función interna `generateCartSummary`.
            const summary = generateCartSummary(userSession);
            const orderTotal = summary.total + (userSession.order.deliveryCost || 0);

            // Preparar datos para la API
            const detallesDelProducto = userSession.order.items.map(item => {
                const saboresText = (item.sabores && item.sabores.length > 0) ? `Sabores: ${item.sabores.map(s => s.NombreProducto).join(', ')}` : '';
                const toppingsText = (item.toppings && item.toppings.length > 0) ? `Toppings: ${item.toppings.map(t => t.NombreProducto).join(', ')}` : '';
                let detalles = [saboresText, toppingsText].filter(Boolean).join('; ');
                return `${item.nombre} ${detalles ? `(${detalles})` : ''} x${item.cantidad}`;
            }).join(' | ');

            const orderData = {
                nombre: userSession.order.name || '',
                telefono: jid.replace('@s.whatsapp.net', ''),
                direccion: userSession.order.address || '',
                monto: orderTotal,
                producto: detallesDelProducto,
                pago: userSession.order.paymentMethod || 'Pendiente',
                // ...otros campos
            };
            
            // Envío a la API
            await axios.post(CONFIG.ENDPOINTS.REGISTRAR_CONFIRMACION, orderData);

            await say(sock, jid, '🎉 ¡Tu pedido ha sido confirmado! Un agente se contactará contigo para coordinar la entrega. ¡Gracias por tu compra!', ctx);
            
            const orderInfoForAdmin = `🆕 NUEVO PEDIDO:\nCliente: ${jid.replace('@s.whatsapp.net', '')}\nNombre: ${userSession.order.name}\nDirección: ${userSession.order.address}\nMétodo de pago: ${userSession.order.paymentMethod}\nTotal: ${money(orderTotal)}\n\n*Productos:*\n${summary.text}`;
            await say(sock, CONFIG.ADMIN_JID, orderInfoForAdmin, ctx);

            resetChat(jid, ctx);

        } catch (error) {
            logger.error('Error al procesar pedido o enviar a API:', error.response?.data || error.message);
            await say(sock, jid, '⚠️ Ocurrió un error al procesar el pedido. Por favor, contacta directamente con nosotros.', ctx);
        }

    } else if (confirmation === 'editar') {
        await say(sock, jid, '📝 Para editar, empecemos de nuevo con los datos de entrega. Por favor, escribe tu *dirección*:', ctx);
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
        userSession.phase = PHASE.CHECK_DIR;
    } else {
        userSession.errorCount++;
        await say(sock, jid, '❌ Por favor, escribe *confirmar* o *editar*.', ctx);
    }
}

<<<<<<< HEAD
async function confirmAndProcessOrder(sock, jid, userSession, ctx) {
    try {
        if (!userSession.order.items || userSession.order.items.length === 0) {
            await say(sock, jid, '⚠️ Tu carrito está vacío...', ctx);
            userSession.phase = PHASE.SELECCION_OPCION;
            return;
        }

        const summary = generateCartSummary(userSession);
        const orderTotal = summary.total + (userSession.order.deliveryCost || 0);

        // 1. Obtenemos la descripción base de los productos
        let detallesDelProducto = userSession.order.items.map(item => {
            const saboresText = (item.sabores && item.sabores.length > 0) ? `Sabores: ${item.sabores.map(s => s.NombreProducto).join(', ')}` : '';
            const toppingsText = (item.toppings && item.toppings.length > 0) ? `Toppings: ${item.toppings.map(t => t.NombreProducto).join(', ')}` : '';
            let detalles = [saboresText, toppingsText].filter(Boolean).join('; ');
            return `${item.nombre} ${detalles ? `(${detalles})` : ''} x${item.cantidad}`;
        }).join(' | ');
        
        // --- INICIO DE LA CORRECCIÓN ---
        // 2. Obtenemos las observaciones especiales de Gemini
        const observaciones = userSession.order.notes ? userSession.order.notes.join(', ') : '';

        // 3. Si hay observaciones, las concatenamos al final
        if (observaciones) {
            detallesDelProducto += ` (Observaciones: ${observaciones})`;
        }
        // --- FIN DE LA CORRECCIÓN ---
        
        const firstItem = userSession.order.items[0];

        const orderData = {
            nombre: userSession.order.name || '',
            telefono: userSession.order.telefono || jid.split('@')[0],
            direccion: userSession.order.address || '',
            monto: orderTotal,
            producto: detallesDelProducto, // <--- Usamos la nueva variable con todo incluido
            pago: userSession.order.paymentMethod || 'Pendiente',
            codigo: firstItem ? firstItem.codigo : 'N/A'
            
            // Ya no enviamos el campo 'observaciones' por separado
        };
        
        const urlCompleta = CONFIG.API_BASE + CONFIG.ENDPOINTS.REGISTRAR_CONFIRMACION;
        await axios.post(urlCompleta, orderData);

        await say(sock, jid, '🎉 ¡Tu pedido ha sido confirmado! Gracias por tu compra.', ctx);
        
       const orderInfoForAdmin = `🆕 NUEVO PEDIDO:\n` +
            `Cliente: ${userSession.order.telefono}\n` +
            `Nombre: ${userSession.order.name}\n` +
            `Dirección: ${userSession.order.address}\n` +
            `Método de pago: ${userSession.order.paymentMethod}\n` +
            `Total: ${money(orderTotal)}\n\n` +
            `*Productos:*\n${summary.text}\n\n` +
            `Ver en Google Sheets:\n${CONFIG.DELIVERIES_SHEET_URL}`
        // Limpiamos la sesión para el siguiente pedido
        userSession.order = { items: [] };
        userSession.order.notes = [];
        userSession.phase = PHASE.SELECCION_OPCION;

    } catch (error) {
        // ... (tu bloque de error detallado)
    }
}

=======
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
module.exports = {
    handleCartSummary,
    handleEnterAddress,
    handleEnterName,
<<<<<<< HEAD
    handleEnterTelefono,
    handleEnterPaymentMethod,
    handleConfirmOrder,
    validateInput,
    findBestMatch
=======
    handleEnterPaymentMethod,
    handleConfirmOrder,
    validateInput
>>>>>>> d70a1ee (refactor: Elimina submódulo y añade backend de Django)
};