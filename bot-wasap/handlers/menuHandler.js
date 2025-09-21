'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { say, sendImage, handleProductSelection, startEncargoBrowse, sleep } = require('../services/bot_core');
const { logger } = require('../utils/logger');
const { normalizeText } = require('../utils/util');
const { findBestMatch } = require('../services/checkoutHandler');
const PHASE = require('../utils/phases');
const CONFIG = require('../config.json');

async function sendMainMenu(sock, jid, ctx) {
    const welcomeMessage = `Holiii ☺️\nComo estas? Somos heladeria mundo helados en riohacha🍦\n\n*1)* 🛍️ Ver nuestro menú y hacer un pedido\n*2)* 📍 Dirección y horarios\n*3)* 📦 Pedidos por encargo (litros, eventos y grandes cantidades)\n\n_Escribe el número de la opción (1, 2 o 3)._`;
    await say(sock, jid, welcomeMessage, ctx);
}

async function handleSeleccionOpcion(sock, jid, input, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleSeleccionOpcion. Opción: "${input}"`);

    const options = {
        '1': ['1', 'ver menu', 'hacer pedido', 'comprar', 'productos'],
        '2': ['2', 'direccion', 'horarios', 'ubicacion'],
        '3': ['3', 'encargo', 'pedidos grandes', 'eventos']
    };

    let match = null;
    const cleanInput = input.toLowerCase().trim();

    for (const key in options) {
        if (findBestMatch(cleanInput, options[key], 2)) {
            match = key;
            break;
        }
    }

    switch (match) {
        case '1':
            await say(sock, jid, '📋 ¡Aquí está nuestro delicioso menú del día!', ctx);
            const menuPath1 = path.join(__dirname, '../menu-1.jpeg');
            const menuPath2 = path.join(__dirname, '../menu-2.jpeg');
            if (fs.existsSync(menuPath1)) await sendImage(sock, jid, menuPath1, 'Menú - Parte 1', ctx);
            if (fs.existsSync(menuPath2)) await sendImage(sock, jid, menuPath2, 'Menú - Parte 2', ctx);
            await say(sock, jid, `🔍 *Paso 1:* Escribe el *NOMBRE* completo o una palabra de tu producto favorito. Ejemplos: Copa Brownie, Volcán, Búho, Helado`, ctx);
            userSession.phase = PHASE.BROWSE_IMAGES;
            break;
        case '2':
            await say(sock, jid, `📍 *Nuestra ubicación:* Cra 7h n 34 b 08\n🕐 *Horario de atención:* Todos los días de 2:00 PM a 10:00 PM`, ctx);
            await sleep(1500);
            await sendMainMenu(sock, jid, ctx);
            userSession.phase = PHASE.SELECCION_OPCION;
            break;
        case '3':
            await startEncargoBrowse(sock, jid, ctx);
            userSession.phase = PHASE.ENCARGO;
            break;
        default:
            await say(sock, jid, '❌ No entendí esa opción. Por favor, elige 1, 2 o 3.', ctx);
            break;
    }
}

async function handleBrowseImages(sock, jid, text, userSession, ctx) {
    logger.info(`[${jid}] -> Entrando a handleBrowseImages. Búsqueda: "${text}"`);
    try {
        // Primero, obtenemos la lista completa de productos para poder comparar
        const inventoryResponse = await axios.get(CONFIG.API_BASE + CONFIG.ENDPOINTS.BUSCAR_PRODUCTO, { params: { q: '' } });
        const allProductsApi = inventoryResponse.data.matches || [];
        
        if (!allProductsApi.length) {
            await say(sock, jid, '⚠️ No pude cargar el inventario en este momento. Intenta más tarde.', ctx);
            return;
        }
        
        const productNames = allProductsApi.map(p => p.NombreProducto.toLowerCase());

        // Buscamos la mejor coincidencia para lo que escribió el usuario
        const bestMatchName = findBestMatch(text, productNames, 3);
        
        const query = bestMatchName || text; // Si encontramos una coincidencia, la usamos. Si no, usamos el texto original.

        const urlCompleta = CONFIG.API_BASE + CONFIG.ENDPOINTS.BUSCAR_PRODUCTO;
        const response = await axios.get(urlCompleta, { params: { q: query } });
        
        let productosApi = response.data.matches || (response.data.CodigoProducto ? [response.data] : []);

        const productos = productosApi.map(p => ({
            nombre: p.NombreProducto,
            codigo: p.CodigoProducto,
            precio: parseFloat(String(p.Precio_Venta).replace('.', '')),
            descripcion: p.Descripcion,
            numero_de_sabores: parseInt(p.Numero_de_Sabores || 0),
            numero_de_toppings: parseInt(p.Numero_de_Toppings || 0),
            sabores: p.sabores,
            toppings: p.toppings
        }));

        if (productos.length === 1) {
            const producto = productos[0];
            await handleProductSelection(sock, jid, producto, ctx);
            userSession.currentProduct = producto;
            const numSabores = producto.numero_de_sabores;
            const numToppings = producto.numero_de_toppings;
            userSession.phase = (numSabores > 0 || numToppings > 0) ? PHASE.SELECT_DETAILS : PHASE.SELECT_QUANTITY;
            logger.info(`[${jid}] -> Producto único. Nueva fase: ${userSession.phase}`);
        } else if (productos.length > 1) {
            userSession.phase = PHASE.SELECCION_PRODUCTO;
            userSession.lastMatches = productos;
            const list = productos.slice(0, 10).map((p, i) => `*${i + 1}.* ${p.nombre}`).join('\n');
            await say(sock, jid, `🤔 Encontré varios productos similares:\n${list}\n_Escribe el número del producto que deseas._`, ctx);
        } else {
            await say(sock, jid, `❌ No encontré el producto *"${text}"*.`, ctx);
        }
    } catch (error) {
        console.error('🔴 ERROR DETALLADO EN LA BÚSQUEDA DE PRODUCTOS:', error.message);
        logger.error('[browse] error:', error.message);
        await say(sock, jid, '⚠️ Error de conexión. Intenta de nuevo.', ctx);
    }
}

module.exports = {
    sendMainMenu,
    handleSeleccionOpcion,
    handleBrowseImages
};