// Importamos las funciones que queremos probar desde el archivo utils/util.js
const {
    normalizarMensaje,
    money,
    parsePrice,
    parseProductAndQuantity,
    isGreeting
} = require('./utils/util');

// --- Prueba 1: normalizarMensaje ---
console.log('--- Probando normalizarMensaje ---');
// Debería convertir el texto a minúsculas y eliminar acentos y espacios extra
const resultado1 = normalizarMensaje('  Hola Mundo!  ');
const esperado1 = 'hola mundo!';
if (resultado1 === esperado1) {
    console.log('✅ Prueba de normalizarMensaje: ¡OK!');
} else {
    console.error('❌ Prueba de normalizarMensaje: ¡FALLÓ!');
    console.error(`Esperado: "${esperado1}", Obtenido: "${resultado1}"`);
}

// --- Prueba 2: money ---
console.log('\n--- Probando money ---');
// Debería formatear un número como moneda colombiana sin decimales
const resultado2 = money(15000);
const esperado2 = '15.000';
if (resultado2 === esperado2) {
    console.log('✅ Prueba de money: ¡OK!');
} else {
    console.error('❌ Prueba de money: ¡FALLÓ!');
    console.error(`Esperado: "${esperado2}", Obtenido: "${resultado2}"`);
}

// --- Prueba 3: parsePrice ---
console.log('\n--- Probando parsePrice ---');
// Debería extraer el número de un string
const resultado3 = parsePrice('$1.200');
const esperado3 = 1200;
if (resultado3 === esperado3) {
    console.log('✅ Prueba de parsePrice: ¡OK!');
} else {
    console.error('❌ Prueba de parsePrice: ¡FALLÓ!');
    console.error(`Esperado: "${esperado3}", Obtenido: "${resultado3}"`);
}

// --- Prueba 4: parseProductAndQuantity ---
console.log('\n--- Probando parseProductAndQuantity ---');
// Debería separar la cantidad del nombre del producto
const resultado4_1 = parseProductAndQuantity('2 copas helado');
const esperado4_1 = { productName: 'copas helado', quantity: 2 };
if (resultado4_1.quantity === esperado4_1.quantity && resultado4_1.productName === esperado4_1.productName) {
    console.log('✅ Prueba de parseProductAndQuantity (con número): ¡OK!');
} else {
    console.error('❌ Prueba de parseProductAndQuantity (con número): ¡FALLÓ!');
    console.error(`Esperado: ${JSON.stringify(esperado4_1)}, Obtenido: ${JSON.stringify(resultado4_1)}`);
}

// Prueba sin número
const resultado4_2 = parseProductAndQuantity('malteada');
const esperado4_2 = { productName: 'malteada', quantity: 1 };
if (resultado4_2.quantity === esperado4_2.quantity && resultado4_2.productName === esperado4_2.productName) {
    console.log('✅ Prueba de parseProductAndQuantity (sin número): ¡OK!');
} else {
    console.error('❌ Prueba de parseProductAndQuantity (sin número): ¡FALLÓ!');
    console.error(`Esperado: ${JSON.stringify(esperado4_2)}, Obtenido: ${JSON.stringify(resultado4_2)}`);
}

// --- Prueba 5: isGreeting ---
console.log('\n--- Probando isGreeting ---');
// Debería detectar si un mensaje contiene un saludo
const resultado5_1 = isGreeting('hola que mas');
const esperado5_1 = true;
if (resultado5_1 === esperado5_1) {
    console.log('✅ Prueba de isGreeting (con saludo): ¡OK!');
} else {
    console.error('❌ Prueba de isGreeting (con saludo): ¡FALLÓ!');
    console.error(`Esperado: ${esperado5_1}, Obtenido: ${resultado5_1}`);
}

// Prueba sin saludo
const resultado5_2 = isGreeting('quiero una malteada');
const esperado5_2 = false;
if (resultado5_2 === esperado5_2) {
    console.log('✅ Prueba de isGreeting (sin saludo): ¡OK!');
} else {
    console.error('❌ Prueba de isGreeting (sin saludo): ¡FALLÓ!');
    console.error(`Esperado: ${esperado5_2}, Obtenido: ${resultado5_2}`);
}