// RUTA: services/checkoutHandler.js - CORREGIDO Y ACTUALIZADO

'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { say, sendImage } = require('./bot_core');
const { money } = require('../utils/util');
const { logger } = require('../utils/logger');
const PHASE = require('../utils/phases');
const CONFIG = require('../config.json');


// =================================================================================
// CAMBIO 1: SE CREA UNA FUNCIÓN INTERNA PARA GENERAR EL RESUMEN DEL CARRITO.
// Esta función no se exporta, solo la usan las demás funciones de este archivo.
// Elimina la dependencia de `bot_core.js` y soluciona el error `cartSummary is not a function`.
// También corrige cómo se muestran los sabores y toppings.
// =================================================================================
function generateCartSummary(userSession) {
    if (!userSession || !userSession.order || !userSession.order.items) {
        return { text: 'Tu carrito está vacío.', total: 0 };
    }

    let total = 0;
    const summaryLines = userSession.order.items.map(item => {
        const itemTotal = item.precio * item.cantidad;
        total += itemTotal;
        let itemText = `*${item.cantidad}x* ${item.nombre} - *${money(itemTotal)}*`;

        // CORRECCIÓN: Se mapea el nombre del sabor/topping correctamente.
        if (item.sabores && item.sabores.length > 0) {
            itemText += `\n  sabores: _${item.sabores.map(s => s.NombreProducto).join(', ')}_`;
        }
        if (item.toppings && item.toppings.length > 0) {
            itemText += `\n  toppings: _${item.toppings.map(t => t.NombreProducto).join(', ')}_`;
        }
        return itemText;
    });

    return {
        text: summaryLines.join('\n\n'),
        total: total
    };
}


function validateInput(input, expectedType, options = {}) {
    const cleanInput = input.toLowerCase().trim();
    switch (expectedType) {
        case 'number':
            const num = parseInt(cleanInput);
            return !isNaN(num) && num > 0 && (options.max ? num <= options.max : true);
        case 'confirmation':
            return ['si', 'sí', 'yes', 'y', 'confirmar', '1'].includes(cleanInput); // Añadido '1'
        case 'cancellation':
            return ['no', 'n', 'cancelar'].includes(cleanInput);
        case 'address':
            return cleanInput.length >= 8;
        case 'string':
            return cleanInput.length >= (options.minLength || 3);
        case 'edit':
            return ['editar'].includes(cleanInput);
        case 'payment':
            return ['transferencia', 'efectivo'].includes(cleanInput);
        default:
            return cleanInput.length > 0;
    }
}

async function handleCartSummary(sock, jid, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleCartSummary.`);
    
    if (!userSession.order || userSession.order.items.length === 0) {
        logger.info(`[${jid}] -> Carrito vacío. Volviendo al menú principal.`);
        await say(sock, jid, `🛒 Tu carrito está vacío. Escribe *menú* para empezar a comprar.`, ctx);
        userSession.phase = PHASE.SELECCION_OPCION; // Devuelve al usuario a un estado seguro
        return;
    }

    // CAMBIO 2: Se utiliza la nueva función interna `generateCartSummary`.
    const summary = generateCartSummary(userSession);

    const fullMessage = `📝 *Este es tu pedido actual:*\n\n${summary.text}\n\n*Total del pedido: ${money(summary.total)}*\n\n¿Qué deseas hacer?\n\n*1)* ✅ Confirmar y finalizar pedido\n*2)* ➕ Seguir comprando\n🍨 Escribe el nombre o una palabra de tu helado favorito para seguir comprando`;

    await say(sock, jid, fullMessage, ctx);
    userSession.phase = PHASE.CONFIRM_ORDER;
}

async function handleEnterAddress(sock, jid, address, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleEnterAddress. Dirección recibida: "${address}"`);

    if (!validateInput(address, 'address')) {
        userSession.errorCount++;
        await say(sock, jid, '❌ Por favor, proporciona una dirección más detallada (mínimo 8 caracteres).', ctx);
        return;
    }

    if (!userSession.order) userSession.order = {};
    userSession.order.address = address.trim();

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

    userSession.order.name = input.trim();
    userSession.phase = PHASE.CHECK_PAGO;
    userSession.errorCount = 0;

    await say(sock, jid, '💳 ¿Cómo vas a pagar? Escribe *Transferencia* o *Efectivo*.', ctx);
    logger.info(`[${jid}] -> Fase cambiada a ${userSession.phase}. Solicitando método de pago.`);
}

async function handleEnterTelefono(sock, jid, input, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleEnterTelefono.`);
    const telefono = input.replace(/[^0-9]/g, '').trim();
    if (!validateInput(telefono, 'string', { minLength: 10 })) {
        await say(sock, jid, '❌ Por favor, escribe un número de teléfono válido.', ctx);
        return;
    }
    userSession.order.telefono = telefono;
    userSession.phase = PHASE.CHECK_PAGO;
    await say(sock, jid, '💳 ¿Cómo vas a pagar? Escribe *Transferencia* o *Efectivo*.', ctx);
}

async function handleEnterPaymentMethod(sock, jid, input, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleEnterPaymentMethod. Método de pago recibido: "${input}"`);
    const paymentMethod = input.toLowerCase().trim();
    if (!validateInput(paymentMethod, 'payment')) {
        userSession.errorCount++;
        await say(sock, jid, '❌ Opción no válida. Por favor, escribe *Transferencia* o *Efectivo*.', ctx);
        return;
    }

    userSession.order.paymentMethod = paymentMethod;
    userSession.errorCount = 0;

    if (paymentMethod === 'transferencia') {
        const qrPath = path.join(__dirname, '../qr.png');
        if (fs.existsSync(qrPath)) {
            await sendImage(sock, jid, qrPath, 'Escanea el siguiente código QR para realizar el pago. Recuerda enviarnos la imagen del pago por favor.', ctx);
        } else {
            await say(sock, jid, 'Realiza el pago a Nequi 313 6939663. Recuerda enviarnos el comprobante.', ctx);
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

    await say(sock, jid, summaryText, ctx);
    logger.info(`[${jid}] -> Fase cambiada a ${userSession.phase}. Mostrando resumen.`);
}

async function handleConfirmOrder(sock, jid, input, userSession, ctx) {
    const confirmation = input.toLowerCase().trim();

    // --- LÓGICA INTELIGENTE MEJORADA ---
    switch (confirmation) {
        case '1':
        case 'confirmar':
            // Si el usuario confirma, iniciamos el proceso de pedir datos
            userSession.phase = PHASE.CHECK_DIR;
            await say(sock, jid, '¡Perfecto! Para continuar con el envío, por favor, escribe tu *dirección completa*.', ctx);
            break;
        
        case '2':
        case 'seguir comprando':
            // Si quiere seguir comprando, lo devolvemos a la fase de búsqueda
            userSession.phase = PHASE.BROWSE_IMAGES;
            await say(sock, jid, '¡Claro! Escribe el nombre del siguiente producto que deseas añadir.', ctx);
            break;

        case '3':
        case 'editar':
            // Si quiere editar, vaciamos el carrito y lo devolvemos a la búsqueda
            userSession.order.items = [];
            userSession.order.notes = [];
            userSession.phase = PHASE.BROWSE_IMAGES;
            await say(sock, jid, '✏️ Entendido. He vaciado tu carrito. Por favor, escribe el nombre del primer producto que deseas ordenar.', ctx);
            break;
            
        case '4':
        case 'vaciar':
        case 'cancelar':
             // Si quiere cancelar, vaciamos el carrito y lo mandamos al menú principal
            resetChat(jid, ctx);
            await say(sock, jid, '🗑️ Tu pedido ha sido cancelado.', ctx);
            await sendMainMenu(sock, jid, ctx);
            break;

        default:
            // Si no es ninguna de las opciones, asumimos que es un producto nuevo
            logger.info(`[${jid}] -> El usuario no eligió opción, asumiendo búsqueda de producto: "${input}"`);
            userSession.phase = PHASE.BROWSE_IMAGES;
            await handleBrowseImages(sock, jid, input, userSession, ctx);
            break;
    }
}

module.exports = {
    handleCartSummary,
    handleEnterAddress,
    handleEnterName,
    handleEnterTelefono,
    handleEnterPaymentMethod,
    handleConfirmOrder,
    validateInput
    
};