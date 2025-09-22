'use strict';

const axios = require('axios');
const CONFIG = require('../config.json');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeText(text) {
    if (typeof text !== 'string') return '';
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function money(number) {
    if (isNaN(number)) return '$ 0';
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
        const urlCompleta = CONFIG.API_BASE + CONFIG.ENDPOINTS.DELIVERY_COST;
        const response = await axios.get(urlCompleta, {
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
    const greetings = CONFIG.KEYWORDS.GREETINGS;
    return greetings.some(greeting => t.includes(greeting));
}

function wantsMenu(t) {
    const menuRequests = CONFIG.KEYWORDS.MENU_REQUESTS;
    return menuRequests.some(request => t.includes(request));
}

module.exports = {
    sleep,
    normalizeText, 
    money,
    parsePrice,
    parseProductAndQuantity,
    getDeliveryCost,
    isGreeting,
    wantsMenu
};