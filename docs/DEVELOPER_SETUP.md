README de desarrollo — Configuración rápida

Objetivo
- Proveer pasos mínimos para que un desarrollador configure el entorno local de forma segura: cargar secretos en .env (NO subirlos), instalar hooks (husky), ejecutar tests y escanear secretos antes de push.

1) Copiar plantilla .env
- Ir a la carpeta del servicio:
  - bot-wasap\.env.example -> bot-wasap\.env
- PowerShell:
  Copy-Item .\bot-wasap\.env.example .\bot-wasap\.env
  # Editar .\bot-wasap\.env y rellenar GEMINI_API_KEY y otros valores (NO subir)

2) Instalar dependencias
- Desde la raíz del repo:
  npm install
- En la carpeta del bot (si existe package.json):
  Push-Location .\bot-wasap; npm install; Pop-Location

3) Preparar husky (ganchos pre-commit)
- Inicializar (script "prepare" ya está en package.json):
  npm run prepare
- Opcional—usar el helper PowerShell (instala husky y añade hook):
  .\scripts\precommit_setup.ps1
- Qué hace el hook: ejecuta gitleaks detect + npm test antes de permitir commits.

4) Ejecutar tests y escaneo localmente (antes de push)
- Tests (root):
  npm test
- Tests (bot):
  Push-Location .\bot-wasap; npm test; Pop-Location
- Escanear secretos con gitleaks (npx o docker):
  npx --no-install gitleaks@latest detect --source . --verbose
  # o con Docker:
  docker run --rm -v "${PWD}:/repo" zricethezav/gitleaks:latest detect --source=/repo --verbose

5) Flujo para crear rama de feature (local)
- PowerShell:
  git checkout -b feature/handler-fixes
  git add -A
  git commit -m "feat: handler fixes and secrets centralization"
  git push -u origin feature/handler-fixes
- Preferir usar el script automatizado si se desea (incluye gitleaks/tests):
  .\scripts\feature_workflow.ps1

6) Limpieza de historial (solo si detectaste secretos en commits pasados)
- Antes: ROTAR/REVOCAR las claves expuestas (hacer esto inmediatamente).
- Hacer backup del repo y ejecutar el helper que crea un bundle y corre git-filter-repo:
  .\scripts\repo_cleanup_filter.ps1
- Revisar salida, ejecutar gitleaks nuevamente y coordinar force-push con el equipo.
- IMPORTANTE: después de reescribir historial, TODOS deberán reclonar o resetear sus clones.

7) CI y variables en GitHub
- Subir variables a Settings > Secrets > Actions (por ejemplo GEMINI_API_KEY).
- El workflow en .github/workflows/ci.yml ya lee del entorno de Actions mediante secrets (configurar en la UI).

8) Buenas prácticas
- Nunca commitear .env ni archivos de credenciales.
- Si un secreto se expone: revoca, genera uno nuevo y reemplázalo en entornos (CI, servidores).
- Ejecuta gitleaks antes de push y en CI para evitar filtraciones accidentales.

9) Recursos y comandos útiles
- Crear backup bundle:
  git bundle create ..\repo-backup.bundle --all
- Forzar push después de git-filter-repo (solo tras coordinar):
  git push origin --force --all
  git push origin --force --tags
- Eliminar archivo temporal replace-secrets.txt después de usarlo.

Contacto
- Para soporte sobre el proceso de rotación o la reescritura del historial, contacta al responsable del repositorio antes de forzar push.
