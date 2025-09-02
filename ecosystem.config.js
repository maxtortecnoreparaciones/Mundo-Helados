module.exports = {
  apps : [
    {
      name: "MundoHeladosAPI",
      script: "manage.py",
      args: ["runserver", "127.0.0.1:8001"],
      interpreter: "python",
      cwd: "C:/Users/Administrador/Documents/Mundoherlados/",
      wait_ready: true,
      listen_timeout: 10000,
    },
    {
      name: "MundoHeladosBot",
      script: "index.js",
      cwd: "C:/Users/Administrador/Documents/Mundoherlados/bot-wasap/",
      wait_ready: true,
      listen_timeout: 10000,
    }
  ]
};