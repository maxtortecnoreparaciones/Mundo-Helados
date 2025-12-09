# Rotación y revocación de secretos — Pasos recomendados

Importante: actúa de inmediato para rotar cualquier credencial que haya estado expuesta en el repositorio o en archivos dentro del workspace (p. ej. `service_account.json`, `auth_info_baileys/creds.json`, tokens en `config.json`).

Resumen rápido
- Revocar y crear nuevas credenciales para: Google service account, claves de IA (Gemini), GitHub PATs, claves de terceros (APIs), y credenciales de Baileys.
- Actualizar el `.env` local y los secretos en el entorno de despliegue (GitHub Secrets, orquestador, etc.).
- Ejecutar un escaneo de secretos en el repositorio y, si los secretos aparecen en commits históricos, reescribir el historial y coordinar con colaboradores.

Pasos detallados

1) Identificar secretos expuestos
- Ejecuta localmente un scanner (gitleaks / detect-secrets) y revisa el reporte.

2) Rotar credenciales críticas inmediatamente
- Google service account (si existe `service_account.json`):
  1. En Google Cloud Console, crea una nueva clave para la cuenta de servicio o crea una nueva cuenta de servicio con permisos equivalentes.
  2. Descarga el nuevo JSON y guárdalo fuera del repo (p. ej. en un almacén de secretos o en tu servidor, y añade su ruta a `.env`).
  3. En GCP, elimina la clave antigua si corresponde.

- Gemini / Google Generative AI API key:
  1. En la consola del proveedor, revoca la clave actual y genera una nueva.
  2. Actualiza tu `.env` local y los secretos en producción (GitHub Actions secrets, etc.).

- GitHub PATs / Tokens:
  1. Revoca cualquier PAT comprometido desde GitHub > Settings > Developer settings > Personal access tokens.
  2. Genera uno nuevo con el scope mínimo necesario y actualiza los secretos en CI/CD.

- Baileys / credenciales locales (`auth_info_baileys/creds.json`):
  1. Si el archivo contiene credenciales persistentes, renueva el proceso de autenticación: borra `auth_info_baileys/creds.json` y realiza un nuevo escaneo QR para generar credenciales limpias.
  2. Asegúrate de no commitear el archivo; añádelo a `.gitignore` si no está.

3) Actualizar secrets en los entornos remotos
- GitHub Actions / Azure / Heroku / Vercel: actualiza los secretos (GEMINI_API_KEY, GOOGLE_SERVICE_ACCOUNT, etc.).

4) Reescribir historial de git (solo si los secretos aparecieron en commits previos)
- Nota: reescribir historial obliga a force-push y coordinación con colaboradores. Hazlo solo si entiendes las implicaciones.
- Herramientas: `git filter-repo` (recomendado) o `bfg-repo-cleaner`.
- Ejemplo (conceptual):
  - Instala `git-filter-repo` y corre el script que elimine los archivos con secretos.
  - Forzar push a la rama principal después de comunicar a todos los colaboradores.

5) Añadir prevención y monitorización
- Añade `gitleaks` en CI para bloquear PRs que contengan secretos.
- Añade un hook pre-commit (husky) que ejecute un scanner localmente.
- Mantén un proceso de rotación de claves periódico.

6) Actualizar documentación y credenciales locales
- No guardes claves reales en `config.json` ni en el repo. Usa `.env` y `config.secrets.js` como en este repositorio.
- Añade al README los pasos para configurar `.env` localmente y cómo obtener claves (enlace a administradores/owner).

7) Validación final
- Después de rotar y limpiar el repo, ejecutar nuevamente el escaneo y confirmar que no aparecen claves en el repositorio ni en el historial.

# SECRET_ROTATION.md

Guía rápida para rotar y revocar secretos si se exponen en el repositorio.

1) Rotar / Revocar inmediatamente
- Si encontraste credenciales (API keys, service_account.json, tokens) en el repo o historial, revócalas y crea nuevas.
- Para Google service accounts: elimina la clave expuesta en Google Cloud Console y genera una nueva. Actualiza los despliegues con la nueva clave.
- Para Gemini / OpenAI keys: revoca la clave en la consola del proveedor y crea una nueva.

2) Actualizar entornos
- Actualiza variables en entornos locales (.env), servidores y CI (GitHub Secrets, Azure Key Vault, etc.).
- Nunca subas .env ni archivos de credenciales al repositorio.

3) Scanner de secretos
- Ejecuta gitleaks o detect-secrets para verificar commits históricos y el estado actual.
  Ejemplo (local):
    npx gitleaks detect --source . --verbose
  o con Docker:
    docker run --rm -v "$(pwd):/repo" zricethezav/gitleaks:latest detect --source=/repo --verbose

4) Reescribir historial (si procede)
- Si las credenciales se comprometieron en commits pasados y el repositorio se ha compartido públicamente, considera reescribir el historial.
- Herramientas recomendadas: git-filter-repo (recomendado), BFG Repo-Cleaner.

  git-filter-repo ejemplo para eliminar archivo:
    git filter-repo --path service_account.json --invert-paths

  BFG ejemplo para eliminar tokens:
    bfg --delete-files service_account.json

- Advertencia: reescribir historial cambia SHA y requiere forzar push y coordinación con el equipo (todos deberán volver a clonar o resetear sus ramas).

5) Prevención
- Añade hook pre-commit (husky) que ejecute gitleaks o detect-secrets localmente.
- Añade job en CI que falle el build si se detectan secretos (ya incluimos gitleaks en .github/workflows/ci.yml).

6) Comunicación
- Si las credenciales se filtraron públicamente, informa a los stakeholders y a cualquier usuario afectado.
- Documenta qué fue rotado y la fecha en la que se invalidaron las credenciales.

7) Reemplazo en despliegues
- Actualiza las variables en GitHub Actions Secrets, servidores y contenedores.
- Reinicia servicios que hayan almacenado las credenciales.

8) Verificación
- Confirma que la clave expuesta ya no funciona. Prueba endpoints con la nueva clave en entornos seguros.

Notas finales:
- Si necesitas, puedo generar los comandos específicos para git-filter-repo y guiarte en el proceso seguro de reescritura del historial.

Contactos y acciones de emergencia
- Si detectas un token activo en el historial público, revócalo inmediatamente y considera notificar a la plataforma (p. ej. GitHub Support) si fue expuesto públicamente.

---
Guía breve de referencia: si quieres, puedo generar los comandos PowerShell exactos para:
- ejecutar gitleaks localmente,
- rotar claves de GCP desde la CLI (gcloud),
- reescribir historia con git-filter-repo.
