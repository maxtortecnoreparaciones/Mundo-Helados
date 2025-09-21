const axios = require('axios');
const CONFIG = require('../config.json');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// CAMBIO 1: Se renombra la función para que coincida con lo que se importa
function normalizeText(text) {
    if (typeof text !== 'string') return '';
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function money(number) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0
    }).format(number).replace('COP', '').trim();
}

function parsePrice(price) {
    if (typeof price === 'string') {
        const cleaned = price.replace(/[^0-9.]/g, '');
        return parseFloat(cleaned) || 0;
    }
    return parseFloat(price) || 0;
}

function parseProductAndQuantity(text) {
    const defaultQuantity = 1;
    // Se actualiza para usar el nuevo nombre de la función
    const tokens = normalizeText(text).split(' '); 
    let quantity = defaultQuantity;
    let productName = text;

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (!isNaN(parseInt(token))) {
            quantity = parseInt(token);
            tokens.splice(i, 1);
            productName = tokens.join(' ');
            break;
        }
    }
    return { productName, quantity };
}

async function getDeliveryCost(address) {
    try {
        const response = await axios.get(CONFIG.API_BASE + '/' + CONFIG.ENDPOINTS.DELIVERY_COST, {
            params: { q: address },
            timeout: 10000
        });
        if (response.data && response.data.costo) {
            return parsePrice(response.data.costo);
        } else {
            return null;
        }
    } catch (e) {
        console.error('Error al obtener costo de envío:', e.response?.data || e.message);
        return null;
    }
}

function isGreeting(t) {
    const greetings = ['hola', 'holas', 'buenas', 'hi', 'hey', 'hello', 'que mas'];
    return greetings.some(greeting => t.includes(greeting));
}

function wantsMenu(t) {
    const menuRequests = ['menu', 'catalogo', 'carta', 'productos', 'quiero comprar'];
    return menuRequests.some(request => t.includes(request));
}

module.exports = {
    sleep,
    // CAMBIO 2: Se exporta la función con el nombre correcto
    normalizeText, 
    money,
    parsePrice,
    parseProductAndQuantity,
    getDeliveryCost,
    isGreeting,
    wantsMenu
};