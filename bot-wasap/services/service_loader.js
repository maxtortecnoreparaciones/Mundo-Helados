'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const CONFIG = require('../config.json');

async function initServices(context) {
    console.log('Inicializando servicios...');

    if (CONFIG.GEMINI_API_KEY) {
        context.gemini = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);
        console.log('Servicio de Google Generative AI (Gemini) cargado.');
    } else {
        console.warn('Advertencia: No se encontró la clave de la API de Gemini. Las funciones de IA no estarán disponibles.');
    }
}

module.exports = {
    initServices,
};
