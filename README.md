# 🤖 Chatbot de Ventas para WhatsApp - Mundo Helados

Este es un chatbot transaccional desarrollado con Node.js y Baileys para automatizar el proceso de pedidos de la heladería "Mundo Helados". El bot guía al usuario a través del menú, la selección de productos, la personalización y la confirmación del pedido.

## ✨ Características Principales

-   **Flujo de Pedido Completo:** Desde el saludo inicial hasta la confirmación y notificación al administrador.
-   **Manejo de Estado por Fases:** El bot sabe en qué parte de la conversación está cada usuario para dar respuestas coherentes.
-   **Integración con APIs Externas:**
    -   Consume una API REST para obtener el catálogo de productos y precios en tiempo real.
    -   Utiliza la API de Google Gemini para responder preguntas abiertas y conversaciones casuales.
-   **Arquitectura Modular:** El código está organizado en manejadores (handlers), servicios y gestores (managers) para facilitar su mantenimiento y escalabilidad.
-   **Proceso de Pago:** Guía al usuario en la selección de método de pago (Efectivo/Transferencia) y presenta la información necesaria.

## 🚀 Stack Tecnológico

-   **Backend:** Node.js
-   **Librería de WhatsApp:** Baileys
-   **Inteligencia Artificial:** Google Gemini API
-   **Peticiones HTTP:** Axios

## ⚙️ Instalación y Uso

1.  **Clonar el repositorio:**
    ```bash
    git clone [https://github.com/maxtortecnoreparaciones/Mundo-Helados.git](https://github.com/maxtortecnoreparaciones/Mundo-Helados.git)
    ```
2.  **Instalar dependencias:**
    ```bash
    cd Mundo-Helados
    npm install
    ```
3.  **Configurar Variables de Entorno:**
    -   Renombra el archivo `.env.example` a `.env`.
    -   Añade tus claves de API y configuraciones en el archivo `.env`.

4.  **Iniciar el bot:**
    ```bash
    npm start
    ```

## 📸 Demostración (Prueba desde el numero que funciona actualmente)


