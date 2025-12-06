// RUTA: services/checkoutHandler.js - CORREGIDO Y ACTUALIZADO

'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { say, sendImage, resetChat } = require('./bot_core');
const { money } = require('../utils/util');
const { logger } = require('../utils/logger');
const PHASE = require('../utils/phases');
const CONFIG = require('../config.json');

// =================================================================================
// CAMBIO 1: SE CREA UNA FUNCIÓN INTERNA PARA GENERAR EL RESUMEN DEL CARRITO.
// Esta función no se exporta, solo la usan las demás funciones de este archivo.
// Elimina la dependencia de `bot_core.js` y soluciona el error `cartSummary is not a función`.
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

async function handleEnterAddress(sock, jid, address, userSession, ctx, isInitialCall = false) {
    logger.info(`[${jid}] -> Entrando a handleEnterAddress. Dirección: "${address}", Inicio: ${isInitialCall}`);

    if (isInitialCall) {
        userSession.phase = PHASE.CHECK_DIR;
        await say(sock, jid, '🏠 ¡Perfecto! Para continuar, por favor escribe tu *dirección de entrega*.', ctx);
        return;
    }

    if (!validateInput(address, 'address')) {
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
    // CORRECCIÓN DEFINITIVA: Se reestructura el if-else para evitar el retorno `undefined`.
    // Esto garantiza que la fase nunca se quede sin asignar.
    if (validateInput(input, 'string', { minLength: 3 })) {
        userSession.order.name = input.trim();
        userSession.phase = PHASE.CHECK_TELEFONO; // Se asigna la fase correcta.
        userSession.errorCount = 0;

        await say(sock, jid, '📞 ¡Genial! Ahora, por favor, escribe tu *número de teléfono* para contactarte si es necesario.', ctx);
        logger.info(`[${jid}] -> Fase cambiada a ${userSession.phase}. Solicitando teléfono.`);
    } else {
        userSession.errorCount++;
        await say(sock, jid, '❌ Por favor, escribe un nombre válido (mínimo 3 caracteres).', ctx);
    }
}

async function handleEnterTelefono(sock, jid, input, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleEnterTelefono.`);
    const telefono = input.replace(/[^0-9]/g, '').trim();
    // CORRECCIÓN: Se ajusta la validación del teléfono a un mínimo de 7 dígitos.
    if (!validateInput(telefono, 'string', { minLength: 7 })) {
        await say(sock, jid, '❌ Por favor, escribe un número de teléfono válido (mínimo 7 dígitos).', ctx);
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

    // CORRECCIÓN DE ROBUSTEZ: Se valida que la fase de finalización exista.
    if (!PHASE.FINALIZE_ORDER) {
        logger.error(`[${jid}] -> ERROR CRÍTICO: La fase 'FINALIZE_ORDER' no está definida en utils/phases.js. El flujo se romperá.`);
        await say(sock, jid, '⚠️ Ocurrió un error crítico de configuración. Por favor, contacta a soporte.', ctx);
        return;
    }
    userSession.phase = PHASE.FINALIZE_ORDER;
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

async function handleFinalizeOrder(sock, jid, input, userSession, ctx) {
    const finalAction = input.toLowerCase().trim();

    if (validateInput(finalAction, 'confirmation')) {
        logger.info(`[${jid}] -> Pedido confirmado. Enviando al backend en ${CONFIG.API_BASE}`);

        // Construir resumen legible y payload para el backend
        const summary = generateCartSummary(userSession);
        const productsText = userSession.order.items.map(i => {
            const sabores = i.sabores && i.sabores.length ? ` (Sabores: ${i.sabores.map(s => s.NombreProducto || s).join(', ')})` : '';
            const toppings = i.toppings && i.toppings.length ? ` (Toppings: ${i.toppings.map(t => t.NombreProducto || t).join(', ')})` : '';
            return `${i.nombre}${sabores}${toppings} x${i.cantidad}`;
        }).join('; ');
        const codes = userSession.order.items.map(i => i.codigo).join('; ');
        const orderTotal = summary.total + (userSession.order.deliveryCost || 0);

        const payload = {
            fecha: new Date().toISOString(),
            nombre: userSession.order.name || '',
            productos: productsText,
            codigos: codes,
            telefono: userSession.order.telefono || '',
            direccion: userSession.order.address || '',
            total: orderTotal,
            pago: userSession.order.paymentMethod || '',
            estado: userSession.order.status || 'Por despachar',
            origen: 'WhatsApp',
            cliente_jid: jid
        };

        const endpoint = (CONFIG.ENDPOINTS && CONFIG.ENDPOINTS.REGISTRAR_CONFIRMACION) ? CONFIG.ENDPOINTS.REGISTRAR_CONFIRMACION : '/registrar_entrega/';
        const url = `${CONFIG.API_BASE}${endpoint}`;

        try {
            const resp = await axios.post(url, payload, { timeout: 10000 });
            logger.info(`[${jid}] -> Backend respondió: ${resp.status} ${resp.statusText}`);

            // Notificar a administradores por WhatsApp
            const admins = CONFIG.ADMIN_JIDS || [];
            const adminMessage = `📦 NUEVO PEDIDO (WhatsApp)\n\n*Cliente:* ${payload.nombre || jid}\n*Productos:*\n${productsText.replace(/;\s*/g, '\n')}\n\n*Codigos:* ${codes}\n*Telefono:* ${payload.telefono}\n*Direccion:* ${payload.direccion}\n*Total:* ${money(orderTotal)}\n*Pago:* ${payload.pago}\n*Estado:* ${payload.estado}`;

            for (const admin of admins) {
                try {
                    await say(sock, admin, adminMessage, ctx);
                } catch (err) {
                    logger.error(`Error notificando al admin ${admin}: ${err.message}`);
                }
            }

            // Confirmación al usuario
            await say(sock, jid, '✅ ¡Tu pedido ha sido confirmado con éxito! Pronto estará en camino. 🛵', ctx);

            // Reiniciar la sesión del usuario
            resetChat(jid, ctx);
            userSession.phase = PHASE.SELECCION_OPCION;

        } catch (error) {
            logger.error(`[${jid}] -> Error al enviar pedido al backend: ${error.message}`);

            // Intentar notificar a los admins del fallo
            const admins = CONFIG.ADMIN_JIDS || [];
            const errorMsg = `⚠️ ERROR AL REGISTRAR PEDIDO (WhatsApp):\nCliente: ${payload.nombre || jid}\nTelefono: ${payload.telefono}\nDireccion: ${payload.direccion}\nError: ${error.message}`;
            for (const admin of admins) {
                try { await say(sock, admin, errorMsg, ctx); } catch (e) { logger.error(`Error notificando admin por fallo: ${e.message}`); }
            }

            // Informar al usuario y mantener la sesión para reintento
            await say(sock, jid, '⚠️ Ocurrió un error al registrar tu pedido. El negocio ha sido notificado y te contactaremos en breve.', ctx);
        }

    } else if (validateInput(finalAction, 'edit')) {
        await say(sock, jid, '✏️ De acuerdo. ¿Qué dato deseas editar? (Dirección, Nombre, Pago)', ctx);
        // Aquí podrías implementar una lógica de edición más compleja
    } else {
        await say(sock, jid, '❌ Opción no válida. Por favor, escribe *confirmar* o *editar*.', ctx);
    }
}

async function handleConfirmOrder(sock, jid, input, userSession, ctx) {
    const confirmation = input.toLowerCase().trim();

    // --- LÓGICA INTELIGENTE MEJORADA ---
    const isConfirmation = validateInput(confirmation, 'confirmation');

    if (isConfirmation) {
        // Si el usuario confirma, iniciamos el proceso de pedir datos
        // CORRECCIÓN: En lugar de repetir la pregunta, llamamos directamente a la función que inicia la recolección de dirección.
        await handleEnterAddress(sock, jid, null, userSession, ctx, true); // El 'true' indica que es la llamada inicial.
    } else if (confirmation === '2' || confirmation === 'seguir comprando') {
        // Si quiere seguir comprando, lo devolvemos a la fase de búsqueda
        userSession.phase = PHASE.BROWSE_IMAGES;
        await say(sock, jid, '¡Claro! Escribe el nombre del siguiente producto que deseas añadir.', ctx);
    } else if (confirmation === '3' || confirmation === 'editar') {
        // Si quiere editar, vaciamos el carrito y lo devolvemos a la búsqueda
        userSession.order.items = [];
        userSession.order.notes = [];
        userSession.phase = PHASE.BROWSE_IMAGES;
        await say(sock, jid, '✏️ Entendido. He vaciado tu carrito. Por favor, escribe el nombre del primer producto que deseas ordenar.', ctx);
    } else if (confirmation === '4' || confirmation === 'vaciar' || confirmation === 'cancelar') {
        // Si quiere cancelar, vaciamos el carrito y lo mandamos al menú principal
        // La función resetChat ya está en handleFinalizeOrder, aquí solo necesitamos reiniciar.
        const { resetChat } = require('./bot_core'); // Importación local para evitar dependencias circulares si no está global
        resetChat(jid, ctx);
        await say(sock, jid, '🗑️ Tu pedido ha sido cancelado. Escribe *menú* para empezar de nuevo.', ctx);
    } else {
        // Si no es ninguna de las opciones, asumimos que es un producto nuevo
        logger.info(`[${jid}] -> El usuario no eligió opción, asumiendo búsqueda de producto: "${input}"`);
        userSession.phase = PHASE.BROWSE_IMAGES;
        // La siguiente línea causaba una dependencia circular y ha sido eliminada.
        // El flujo correcto es que el bot simplemente espere la siguiente entrada del usuario en la fase BROWSE_IMAGES.
    }
}

// Envía una notificación con formato al(los) admin(s)
async function sendOrderNotification(sock, userOrder, ctx) {
    const admins = CONFIG.ADMIN_JIDS || [];
    if (!admins.length) {
        logger.warn('sendOrderNotification: No hay ADMIN_JIDS configurados.');
        return;
    }

    const summary = generateCartSummary(userOrder);
    const productsText = userOrder.items.map(i => {
        const sabores = i.sabores && i.sabores.length ? ` (Sabores: ${i.sabores.map(s => s.NombreProducto || s).join(', ')})` : '';
        const toppings = i.toppings && i.toppings.length ? ` (Toppings: ${i.toppings.map(t => t.NombreProducto || t).join(', ')})` : '';
        return `${i.nombre}${sabores}${toppings} x${i.cantidad}`;
    }).join('\n');

    const orderTotal = summary.total + (userOrder.deliveryCost || 0);

    const message = `📦 NUEVO PEDIDO (WhatsApp)\n\n` +
        `*Cliente:* ${userOrder.name || 'No especificado'}\n` +
        `*Productos:*\n${productsText}\n\n` +
        `*Codigos:* ${userOrder.items.map(i => i.codigo).join(', ')}\n` +
        `*Telefono:* ${userOrder.telefono || ''}\n` +
        `*Direccion:* ${userOrder.address || ''}\n` +
        `*Total:* ${money(orderTotal)}\n` +
        `*Pago:* ${userOrder.paymentMethod || ''}\n` +
        `*Estado:* ${userOrder.status || 'Por despachar'}`;

    for (const admin of admins) {
        try {
            await say(sock, admin, message, ctx);
        } catch (err) {
            logger.error(`Error notificando al admin ${admin}: ${err.message}`);
        }
    }
}

module.exports = {
    handleCartSummary,
    handleEnterAddress,
    handleEnterName,
    handleEnterTelefono,
    handleEnterPaymentMethod,
    handleFinalizeOrder,
    handleConfirmOrder,
    validateInput,
    sendOrderNotification
};