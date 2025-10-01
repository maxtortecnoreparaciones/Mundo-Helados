const API_KEY = "[REDACTED_GCP_API_KEY_1]";

async function listModels() {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models?key=${API_KEY}`
    );

    if (!res.ok) {
      throw new Error(`Error al obtener modelos: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    console.log("📋 Modelos disponibles con tu API Key:\n");
    data.models.forEach(m => console.log(`- ${m.name}`));
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

listModels();
