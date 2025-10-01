console.log('--- Iniciando diagnóstico en bot_core.js ---');
'use strict';

const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { logConversation } = require('../utils/logger');
const { sleep, money } = require('../utils/util');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const CONFIG = require('../config.json');



async function getSaboresYToppings(ctx) {
    try {
        const response = await axios.get(CONFIG.API_BASE + CONFIG.ENDPOINTS.LISTAR_SABORES_TOPPINGS);
        if (response.data) {
            ctx.saboresYToppings = response.data;
            console.log("✅ Sabores y toppings cargados.");
        }
    } catch (e) {
        console.error('Error al obtener sabores y toppings de la API:', e.response?.data || e.message);
    }
}

function resetChat(jid, ctx) {
    // En lugar de borrar, sobreescribimos la sesión con un estado limpio y por defecto.
    // Esto asegura que la sesión SIEMPRE exista después de un reseteo.
    ctx.sessions[jid] = {
        phase: 'seleccion_opcion', // Usamos el nombre de la fase directamente
        lastPromptAt: Date.now(),
        errorCount: 0,
        order: { items: [] },
        currentProduct: null,
        saboresSeleccionados: [],
        toppingsSeleccionados: [],
        lastMatches: [],
        createdAt: Date.now()
    };
    console.log(`Sesión y carrito reseteados para ${jid}`);
}

// =================================================================================
// CAMBIO 1: FUNCIÓN `addToCart` CORREGIDA Y CENTRALIZADA
// Esta función ahora guarda los productos en `ctx.sessions[jid].order.items`,
// que es la estructura correcta que usa tu `handler.js`.
// Esto asegura que el carrito funcione correctamente en todo el bot.
// =================================================================================
function addToCart(ctx, jid, item, quantity = 1) {
    const userSession = ctx.sessions[jid];

    // Se asegura de que la estructura del pedido exista (doble verificación)
    if (!userSession.order) {
        userSession.order = { items: [] };
    }
    if (!userSession.order.items) {
        userSession.order.items = [];
    }

    const cart = userSession.order.items;
    const itemIndex = cart.findIndex(x => x.codigo === item.codigo);

    if (itemIndex >= 0) {
        // Si el item ya existe, actualiza la cantidad
        cart[itemIndex].cantidad += quantity;
        if (item.sabores && item.sabores.length > 0) cart[itemIndex].sabores = item.sabores;
        if (item.toppings && item.toppings.length > 0) cart[itemIndex].toppings = item.toppings;
    } else {
        // Si es un item nuevo, lo añade al carrito
        cart.push({
            codigo: item.codigo,
            nombre: item.nombre,
            precio: item.precio,
            cantidad: quantity,
            sabores: item.sabores,
            toppings: item.toppings
        });
    }
    console.log(`Item añadido al carrito de ${jid}: ${quantity}x ${item.nombre}`);
}


async function say(sock, jid, text, ctx) {
    if (!ctx.lastSent) {
        ctx.lastSent = {};
    }
    ctx.lastSent[jid] = text;
    console.log(`[${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}] 🤖 Bot: "${text.split('\n')[0]}..."`);
    logConversation(jid, text, true);
    await sock.sendPresenceUpdate('composing', jid);
    await sleep(CONFIG.TIME.WRITING_SIMULATION_MS);
    await sock.sendMessage(jid, { text });
    await sock.sendPresenceUpdate('paused', jid);
}

async function sendImage(sock, jid, imagePath, caption, ctx) {
    try {
        const media = fs.readFileSync(imagePath);
        await sock.sendMessage(jid, { image: media, caption });
        console.log(`[${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}] 🤖 Bot: Enviando imagen "${caption}"`);
        logConversation(jid, `Enviando imagen: ${caption}`, true);
    } catch (error) {
        console.error(`Error al enviar la imagen: ${error.message}`);
        await say(sock, jid, 'Lo siento, no pude enviar la imagen. Por favor, avisa a soporte.', ctx);
    }
}

async function askGemini(ctx, question) {
    if (!ctx.gemini) {
        console.error("Error: Cliente de Gemini no inicializado.");
        return JSON.stringify({ "respuesta_texto": "Lo siento, mi conexión con la IA está fallando." });
    }

    
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "models/gemini-2.5-flash" });
        

    const prompt = `
                Eres "Mundo Bot", el asistente experto de la heladería "Mundo Helados".

        **FAQ de Mundo Helados:**
        - ¿Tienen sabor Ferrero? → Sí, está disponible en nuestra Malteada Especial.
        - ¿Aceptan tarjeta de crédito? → Solo aceptamos pagos en Efectivo o por Transferencia (Nequi).
        - ¿Cuánto demora el domicilio? → Entre 20 y 40 minutos.
        - ¿Tienen helado de pistacho? → No, actualmente no.
        - ¿Cuál es la dirección? → Cra 7h n 34 b 08.
        - ¿Cuál es el horario? → Todos los días de 2:00 PM a 10:00 PM.

        TAREAS:
        1. TOMA DE PEDIDOS: Si el cliente pide productos, devuelve un JSON con una lista "items".
        2. RESPUESTA A PREGUNTAS: Si es una pregunta, responde en un JSON con la clave "respuesta_texto".

        EJEMPLOS:
        - Petición: "Quiero una ensalada sin papaya" 
          → {"items": [{"producto": "Ensalada de frutas", "cantidad": 1, "modificaciones": ["sin papaya"]}]}

        - Petición: "Aceptan tarjeta?" 
          → {"respuesta_texto": "Por el momento solo aceptamos Efectivo o Transferencia (Nequi) 😊."}

        ---
        Petición del cliente: "${question}"

        RECUERDA:
- Tu única salida debe ser un objeto JSON válido.
- Siempre incluye la clave "cantidad". Si el cliente no dice cuántos, pon 1.
- No incluyas ningún otro texto, saludo o explicación. Solo el JSON.
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text().trim();
        text = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
return text;   // ✅ ahora sí devuelve el JSON limpio
    ;
    } catch (error) {
        console.error("Error al interactuar con la API de Gemini:", error.message);
        // Devolvemos un JSON de error para no romper el flujo.
        return JSON.stringify({ "respuesta_texto": "¡Uy! No entiendo indicame cual es tu solicitud mas exacta. 😅 Por favor, intenta de nuevo." });
    }
}

// =================================================================================
// CAMBIO 2 (PRINCIPAL): FUNCIÓN `handleProductSelection` COMPLETAMENTE RECONSTRUIDA
// Ahora esta función construye un mensaje completo que guía al usuario al siguiente
// paso, preguntando por sabores y toppings si es necesario, o directamente por
// la cantidad si el producto no tiene opciones. Esto desbloquea la conversación.
// =================================================================================
async function handleProductSelection(sock, jid, producto, ctx) {
    // 1. Guarda el producto actual en la sesión del usuario
    ctx.sessions[jid].currentProduct = producto;

    // 2. Construye el mensaje de respuesta paso a paso
    let mensaje = `Has seleccionado: *${producto.NombreProducto}* — COP$${money(producto.Precio_Venta)}\n${producto.Descripcion || ''}`;

    const numSabores = parseInt(producto.Numero_de_Sabores || 0);
    const numToppings = parseInt(producto.Numero_de_Toppings || 0);

    // 3. Añade la sección de SABORES si el producto los requiere
    if (numSabores > 0 && ctx.saboresYToppings && ctx.saboresYToppings.sabores) {
        mensaje += `\n\n*Elige ${numSabores} sabor${numSabores > 1 ? 'es' : ''} de la lista (ej: S1, S3):*\n`;
        mensaje += ctx.saboresYToppings.sabores.map((s, i) => `*S${i + 1})* ${s.NombreProducto}`).join('\n');
    }

    // 4. Añade la sección de TOPPINGS si el producto los requiere
    if (numToppings > 0 && ctx.saboresYToppings && ctx.saboresYToppings.toppings) {
        mensaje += `\n\n*Elige hasta ${numToppings} topping${numToppings > 1 ? 's' : ''} (ej: T1, T2):*\n`;
        mensaje += ctx.saboresYToppings.toppings.map((t, i) => `*T${i + 1})* ${t.NombreProducto}`).join('\n');
    }

    // 5. Añade las instrucciones finales
    if (numSabores > 0 || numToppings > 0) {
        mensaje += `\n\n_Para elegir, escribe los códigos separados por comas o espacio (ej: S1, T2). Si no deseas ninguno, escribe **sin nada**._`;
        // La fase la controla el handler.js, que la pondrá en 'select_details'
    } else {
        // Si el producto no tiene opciones, preguntamos directamente la cantidad
        mensaje += `\n\n🔢 ¿Cuántas unidades de este producto quieres?`;
        // El handler.js cambiará la fase a 'select_details'. La lógica en esa fase
        // deberá ser lo suficientemente inteligente para saltar a 'select_quantity'.
        // O mejor aún, el handler puede manejar esto. Por ahora, esto desbloquea la conversación.
    }

    // 6. Envía el mensaje completo al usuario
    await say(sock, jid, mensaje, ctx);

    // CAMBIO 3: La función `addToCart` duplicada que estaba aquí ha sido eliminada.
}


async function startEncargoBrowse(sock, jid, ctx) {
    // Tu función startEncargoBrowse no necesita cambios
    try {
        const [litrosResponse, cajasResponse] = await Promise.all([
            axios.get(CONFIG.API_BASE + CONFIG.ENDPOINTS.BUSCAR_PRODUCTO, { params: { q: 'Litros de Helado' } }),
            axios.get(CONFIG.API_BASE + CONFIG.ENDPOINTS.BUSCAR_PRODUCTO, { params: { q: 'Cajas de Helado' } })
        ]);

        const productos = [];
        if (litrosResponse.data && litrosResponse.data.NombreProducto) {
            productos.push(litrosResponse.data);
        }
        if (cajasResponse.data && cajasResponse.data.NombreProducto) {
            productos.push(cajasResponse.data);
        }

        if (productos.length === 0) {
            ctx.sessions[jid].phase = 'encargo';
            await say(sock, jid, `¡Claro! Con gusto te ayudamos con tu pedido por encargo. 😊\nPor favor, describe con detalle el pedido que necesitas:\n_Ej: 50 helados de vainilla para un evento, 20 minihelados para una fiesta, etc._`, ctx);
            return;
        }

        ctx.sessions[jid].lastMatches = productos.map((p, i) => ({
            ...p,
            Numero_de_Sabores: parseInt(p.Numero_de_Sabores),
            Numero_de_Toppings: parseInt(p.Numero_de_Toppings),
            Precio_Venta: parseFloat(String(p.Precio_Venta).replace('.', '')),
            index: i + 1
        }));

        const list = ctx.sessions[jid].lastMatches.map(p => {
            return `*${p.index}.* ${p.NombreProducto} — COP$${money(p.Precio_Venta)}\n_Descripción: ${p.Descripcion}_`;
        }).join('\n\n');

        const mensaje = `📦 Estas son nuestras opciones para **pedidos por encargo**:\n${list}\n\n_Escribe el número de un producto o su nombre para continuar, o **menú** para volver._`;
        
        ctx.sessions[jid].phase = 'browse_images'; // Corregido para que el flujo sea consistente
        await say(sock, jid, mensaje, ctx);

    } catch (e) {
        console.error('Error al obtener productos de encargo:', e.response?.data || e.message);
        ctx.sessions[jid].phase = 'encargo';
        await say(sock, jid, `Lo siento, no pude cargar el menú de encargo en este momento.\nPor favor, describe con detalle el pedido que necesitas:\n_Ej: 50 helados de vainilla para un evento, 20 minihelados para una fiesta, etc._`, ctx);
    }
}


// Exportamos las funciones necesarias. Se eliminan las que no se usan o son internas.
module.exports = {
    say,
    sendImage,
    resetChat,
    addToCart,
    handleProductSelection,
    startEncargoBrowse,
    askGemini,
    sleep,
    getSaboresYToppings
    
};