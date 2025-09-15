module.exports = {
  apps: [
    {
      name: "MundoHeladosAPI",
      script: "manage.py",
      args: ["runserver", "127.0.0.1:8001"],
      interpreter: "python",
      // La ruta de la API es "inventario_wasap"
      cwd: "./inventario_wasap/",
    },
    // ... (configuración del bot)
  ],
};