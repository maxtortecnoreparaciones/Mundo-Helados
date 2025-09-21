'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { say, sendImage } = require('./bot_core');
const { money } = require('../utils/util');
const { logger } = require('../utils/logger');
const PHASE = require('../utils/phases');
const CONFIG = require('../config.json');

function generateCartSummary(userSession) {
    if (!userSession || !userSession.order || !userSession.order.items) {
        return { text: 'Tu carrito está vacío.', total: 0 };
    }

    let total = 0;
    const summaryLines = userSession.order.items.map(item => {
        const itemTotal = item.precio * item.cantidad;
        total += itemTotal;
        let itemText = `*${item.cantidad}x* ${item.nombre} - *${money(itemTotal)}*`;

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
            return ['si', 'sí', 'yes', 'y', 'confirmar', '1'].includes(cleanInput);
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
        logger.info(`[${jid}] -> Carrito vacío.`);
        await say(sock, jid, `🛒 Tu carrito está vacío. Escribe *menú* para empezar a comprar.`, ctx);
        return;
    }

    const summary = generateCartSummary(userSession);
    const summaryMessage = `📝 *Este es tu pedido actual:*\n\n${summary.text}\n\n*Total del pedido: ${money(summary.total)}*`;
    await say(sock, jid, summaryMessage, ctx);
    
    const addressPrompt = `Para continuar con el envío, por favor, escribe tu *dirección completa*.`;
    await say(sock, jid, addressPrompt, ctx);

    userSession.phase = PHASE.CHECK_DIR;
    logger.info(`[${jid}] -> Carrito mostrado. Pasando a la fase de solicitar dirección: ${userSession.phase}`);
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

    await say(sock, jid, '💳 ¿Cómo vas a pagar? Escribe *Transferencia* o *Efectivo*.', ctx);
    logger.info(`[${jid}] -> Fase cambiada a ${userSession.phase}. Solicitando método de pago.`);
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
            await say(sock, jid, 'Realiza el pago a Nequi 123456789. Recuerda enviarnos el comprobante.', ctx);
        }
    }

    userSession.phase = PHASE.CONFIRM_ORDER;
    const summary = generateCartSummary(userSession);
    userSession.order.deliveryCost = 0;
    const orderTotal = summary.total + (userSession.order.deliveryCost || 0);

    const summaryText = `📝 *Resumen final del pedido*\n\n` +
        `*Productos:*\n${summary.text}\n\n` +
        `Subtotal: ${money(summary.total)}\n` +
        `Domicilio: ${money(userSession.order.deliveryCost)}\n` +
        `*Total a pagar: ${money(orderTotal)}*\n\n` +
        `*Datos de entrega:*\n` +
        `👤 Nombre: ${userSession.order.name}\n` +
        `📞 Teléfono: ${userSession.order.telefono}\n` +
        `🏠 Dirección: ${userSession.order.address}\n` +
        `💳 Pago: ${userSession.order.paymentMethod}\n\n` +
        `¿Está todo correcto?\nEscribe *confirmar* para finalizar o *editar* para cambiar algún dato.`;

    await say(sock, jid, summaryText, ctx);
    logger.info(`[${jid}] -> Fase cambiada a ${userSession.phase}. Mostrando resumen.`);
}

async function handleConfirmOrder(sock, jid, input, userSession, ctx) {
    const confirmation = input.toLowerCase().trim();

    if (['1', '2', '3', '4'].includes(confirmation)) {
        switch (confirmation) {
            case '1':
                await confirmAndProcessOrder(sock, jid, userSession, ctx);
                return;
            case '2':
                userSession.phase = PHASE.BROWSE_IMAGES;
                await say(sock, jid, 'Claro, puedes seguir comprando. Escribe el nombre de otro producto o "menú" para ver las opciones.', ctx);
                return;
            case '3':
                await say(sock, jid, 'La función para editar el pedido estará disponible pronto. Por ahora, puedes cancelar y empezar de nuevo escribiendo "menú".', ctx);
                return;
            case '4':
                userSession.order.items = [];
                userSession.phase = PHASE.BROWSE_IMAGES;
                await say(sock, jid, '🗑️ Tu carrito ha sido vaciado. ¡Empecemos de nuevo! Escribe "menú".', ctx);
                return;
        }
    }

    if (validateInput(confirmation, 'confirmation')) {
        await confirmAndProcessOrder(sock, jid, userSession, ctx);
    } else if (confirmation === 'editar') {
        await say(sock, jid, '📝 Para editar, empecemos de nuevo con los datos de entrega. Por favor, escribe tu *dirección*:', ctx);
        userSession.phase = PHASE.CHECK_DIR;
    } else {
        userSession.errorCount++;
        await say(sock, jid, '❌ Por favor, escribe *confirmar* o *editar*.', ctx);
    }
}


async function confirmAndProcessOrder(sock, jid, userSession, ctx) {
    try {
        if (!userSession.order.items || userSession.order.items.length === 0) {
            await say(sock, jid, '⚠️ Tu carrito está vacío...', ctx);
            userSession.phase = PHASE.SELECCION_OPCION;
            return;
        }

        const summary = generateCartSummary(userSession);
        const orderTotal = summary.total + (userSession.order.deliveryCost || 0);

        const detallesDelProducto = userSession.order.items.map(item => {
            const saboresText = (item.sabores && item.sabores.length > 0) ? `Sabores: ${item.sabores.map(s => s.NombreProducto).join(', ')}` : '';
            const toppingsText = (item.toppings && item.toppings.length > 0) ? `Toppings: ${item.toppings.map(t => t.NombreProducto).join(', ')}` : '';
            let detalles = [saboresText, toppingsText].filter(Boolean).join('; ');
            return `${item.nombre} ${detalles ? `(${detalles})` : ''} x${item.cantidad}`;
        }).join(' | ');
        
        const firstItem = userSession.order.items[0];

        const orderData = {
            nombre: userSession.order.name || '',
            telefono: userSession.order.telefono || jid.split('@')[0],
            direccion: userSession.order.address || '',
            monto: orderTotal,
            producto: detallesDelProducto,
            pago: userSession.order.paymentMethod || 'Pendiente',
            codigo: firstItem ? firstItem.codigo : 'N/A'
        };
        
        const urlCompleta = CONFIG.API_BASE + CONFIG.ENDPOINTS.REGISTRAR_CONFIRMACION;
        await axios.post(urlCompleta, orderData);

        await say(sock, jid, '🎉 ¡Tu pedido ha sido confirmado! Un agente se contactará contigo para coordinar la entrega. ¡Gracias por tu compra!', ctx);
        
        const orderInfoForAdmin = `🆕 NUEVO PEDIDO:\nCliente: ${userSession.order.telefono}\nNombre: ${userSession.order.name}\nDirección: ${userSession.order.address}\nMétodo de pago: ${userSession.order.paymentMethod}\nTotal: ${money(orderTotal)}\n\n*Productos:*\n${summary.text}`;
        if (CONFIG.ADMIN_JID) {
            await say(sock, CONFIG.ADMIN_JID, orderInfoForAdmin, ctx);
        }
        
        userSession.order = { items: [] };
        userSession.phase = PHASE.SELECCION_OPCION;

    } catch (error) {
        console.error('🔴 ERROR DETALLADO AL ENVIAR A LA API:');
        if (error.response) {
            console.error('Datos del error:', error.response.data);
            console.error('Código de estado:', error.response.status);
            console.error('Headers:', error.response.headers);
        } else if (error.request) {
            console.error('No se recibió respuesta de la API. ¿Está el servidor Django/backend encendido y la URL es correcta?');
        } else {
            console.error('Error de configuración de la petición (Axios):', error.message);
        }
        
        logger.error('Error al procesar pedido o enviar a API:', error.message);
        await say(sock, jid, '⚠️ Ocurrió un error al procesar el pedido. Por favor, contacta directamente con nosotros.', ctx);
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