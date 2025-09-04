module.exports = {
  apps: [
    {
      name: "MundoHeladosAPI",
      script: "manage.py",
      args: ["runserver", "127.0.0.1:8001"],
      interpreter: "python",
      cwd: "C:/Users/Administrador/Documents/Mundoherlados/inventario_wasap/",
      // Eliminamos wait_ready y listen_timeout
    },
    {
      name: "MundoHeladosBot",
      script: "index.js",
      cwd: "C:/Users/Administrador/Documents/Mundoherlados/bot-wasap/",
      // Eliminamos wait_ready y listen_timeout
    },
  ],
};