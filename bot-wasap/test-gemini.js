const { GoogleGenerativeAI } = require("@google/generative-ai");

// 🔑 Reemplaza esto con tu API Key real de Gemini
const API_KEY = "[REDACTED_GCP_API_KEY_1]";

async function testModel(modelName) {
  try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: modelName });

    const start = Date.now();
    const result = await model.generateContent("Di 'Hola, soy " + modelName + "'");
    const latency = ((Date.now() - start) / 1000).toFixed(4);

    console.log(`✅ Modelo disponible: ${modelName} (tiempo: ${latency}s)`);
    console.log("👉 Respuesta:", result.response.text(), "\n");
  } catch (err) {
    console.log(`❌ Modelo no disponible: ${modelName}`);
    console.log("   Error:", err.message, "\n");
  }
}

(async () => {
  const models = [
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-pro",
    "gemini-pro-vision"
  ];

  for (const m of models) {
    await testModel(m);
  }
})();
