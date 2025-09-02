@echo off
echo Iniciando MundoHeladosAPI...
start "" "C:\Users\Administrador\AppData\Local\Programs\Python\Python313\python.exe" manage.py runserver 127.0.0.1:8001

echo.
echo Esperando a que la API se inicie (10 segundos)...
timeout /t 10 /nobreak >nul

echo.
echo Iniciando MundoHeladosBot...
pm2 start ecosystem.config.js

echo.
echo Procesos iniciados. Puedes cerrar esta ventana.
exit
