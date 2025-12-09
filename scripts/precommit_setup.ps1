# precommit_setup.ps1
# Run from repository root to set up husky pre-commit hook that runs gitleaks + tests.
$ErrorActionPreference = 'Stop'

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Write-Error "npm not found in PATH"; exit 1 }

Write-Host "Installing husky dev dependency..."
npm install --save-dev husky

Write-Host "Initializing husky..."
npm run prepare

# Create pre-commit hook: run gitleaks detect and npm test
$hookCmd = 'npx --no-install gitleaks@latest detect --source . || exit 1; npm test'

Write-Host "Adding pre-commit hook to husky..."
./.husky/pre-commit Husky was not initialised > $null 2>&1
if (-not (Test-Path ./.husky)) {
    npx husky install
}

npx husky add .husky/pre-commit "$hookCmd"
Write-Host "Pre-commit hook added: runs gitleaks detect and npm test.\nBe sure to rotate any exposed secrets before committing."