# 🤖 Bot de Pedidos para WhatsApp - Mundo Helados

Este proyecto es un bot de pedidos automatizado para WhatsApp, diseñado para una heladería. Permite a los clientes explorar el menú, realizar un pedido, y finalizar la compra de forma interactiva y guiada, 24/7. El bot gestiona el flujo de la conversación, administra el carrito de compras del usuario y se integra con un sistema de backend para procesar los pedidos.

### 🚀 Características y Tecnologías

* **Node.js**: Entorno de ejecución de JavaScript.
* **Baileys**: Librería para interactuar con la API de WhatsApp.
* **Express**: Framework para la creación de un servidor web y la API de backend.
* **Manejo de estados (Finite State Machine)**: Lógica de conversación robusta y predecible.
* **Integración con API RESTful**: Comunicación con un backend para la gestión de productos y pedidos.
* **Manejo de sesiones**: Soporte para múltiples conversaciones simultáneas.

* ### ⚙️ Instalación

1.  Clona este repositorio:
    `git clone https://github.com/tu_usuario/MundoHeladosBot.git`
2.  Navega al directorio del proyecto:
    `cd MundoHeladosBot`
3.  Instala las dependencias:
    `npm install`
4.  Crea un archivo `.env` en la raíz del proyecto y configura tus variables de entorno (ver la sección de 'Configuración de Credenciales').
5.  Ejecuta la aplicación:
    `npm start`

El bot generará un código QR en la terminal. Escanéalo con tu teléfono desde la opción 'Dispositivos vinculados' en WhatsApp.
