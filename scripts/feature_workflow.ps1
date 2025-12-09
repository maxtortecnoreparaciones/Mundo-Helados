# PowerShell script to prepare feature branch, run tests and secret scan (gitleaks)
# Run from repository root in PowerShell (Windows).
# Usage: .\scripts\feature_workflow.ps1

$ErrorActionPreference = 'Stop'
Write-Host "Starting feature branch workflow..."

function Check-Command($name) {
    try { Get-Command $name -ErrorAction Stop | Out-Null; return $true } catch { return $false }
}

# Ensure we're inside a git repo
if (-not (Check-Command git)) {
    Write-Error "git is not installed or not in PATH. Aborting."
    exit 1
}

try {
    git rev-parse --is-inside-work-tree > $null 2>&1
} catch {
    Write-Error "Current directory is not a git repository. Aborting."
    exit 1
}

# Ensure clean working tree
$status = git status --porcelain
if ($status) {
    Write-Error "Working tree is not clean. Please commit or stash your changes before running this script.\nChanged files:\n$status"
    exit 1
}

$branch = 'feature/handler-fixes'
$exists = git show-ref --verify --quiet refs/heads/$branch
if ($LASTEXITCODE -eq 0) {
    Write-Error "Branch '$branch' already exists locally. Please rename or remove it and re-run the script."
    exit 1
}

# Create branch
git checkout -b $branch
Write-Host "Created and switched to branch $branch"

# Install dependencies (non-interactive)
if (Test-Path package.json) {
    if (Check-Command npm) {
        Write-Host "Running npm ci at repo root (if lockfile exists) or npm install..."
        if (Test-Path package-lock.json -or Test-Path npm-shrinkwrap.json) { npm ci } else { npm install }
    } else {
        Write-Warning "npm not found. Skipping install at root. Ensure tests can run."
    }
}

# Install in bot-wasap and run tests there
$botDir = Join-Path $PSScriptRoot '..\bot-wasap' | Resolve-Path -ErrorAction SilentlyContinue
if ($botDir) { $botDir = $botDir.Path } else { $botDir = Join-Path (Get-Location) 'bot-wasap' }
if (Test-Path (Join-Path $botDir 'package.json')) {
    Push-Location $botDir
    try {
        if (Check-Command npm) {
            Write-Host "Installing dependencies in bot-wasap..."
            if (Test-Path package-lock.json -or Test-Path npm-shrinkwrap.json) { npm ci } else { npm install }
            Write-Host "Running tests in bot-wasap..."
            npm test
        } else {
            Write-Warning "npm not found. Skipping bot-wasap tests."
        }
    } finally { Pop-Location }
} else {
    Write-Warning "bot-wasap package.json not found. Skipping bot-wasap test run."
}

# Run root tests
if (Test-Path package.json) {
    if (Check-Command npm) {
        Write-Host "Running tests at repository root..."
        npm test
    } else {
        Write-Warning "npm not found. Skipping root tests."
    }
}

# Run gitleaks secret scan (try npx, fallback to docker)
Write-Host "Running gitleaks secret scan..."
$gitleaksOk = $false
if (Check-Command npx) {
    try {
        npx --no-install gitleaks@latest detect --source . --verbose
        $gitleaksOk = $true
    } catch {
        Write-Warning "npx gitleaks failed or not available. Will try Docker fallback."
    }
}

if (-not $gitleaksOk) {
    if (Check-Command docker) {
        $pwd = (Get-Location).Path -replace "\\","/"
        try {
            docker run --rm -v "${pwd}:/repo" zricethezav/gitleaks:latest detect --source=/repo --verbose
            $gitleaksOk = $true
        } catch {
            Write-Warning "Docker gitleaks run failed: $_"
        }
    } else {
        Write-Warning "Neither npx nor docker available to run gitleaks. Please run a secret scan manually before pushing."
    }
}

if (-not $gitleaksOk) {
    Write-Warning "Gitleaks scan could not be completed. Proceed with caution and run secrets scan locally before pushing."
}

# Stage and commit changes
Write-Host "Staging all changes and creating a commit."
git add -A
$commitMessage = "feat: centralize secrets, handler fixes and resilience (askGemini timeout/retries; move secrets to loader)"
try {
    git commit -m "$commitMessage"
    Write-Host "Committed changes on $branch"
} catch {
    Write-Warning "Nothing to commit or commit failed: $_"
}

Write-Host "Re-run gitleaks detect to ensure no secrets were introduced in the commit."
if (Check-Command npx) {
    try { npx --no-install gitleaks@latest detect --source . --verbose } catch { }
}

Write-Host "Done.\nNext steps (manual):\n - Review gitleaks results and rotate any exposed secrets immediately.\n - Create a remote branch and push: git push -u origin $branch\n - Create a PR (you can use 'gh pr create' if you have GitHub CLI configured)\n - Ensure CI (tests + secret scan) pass before merging."

# Optional: attempt to push and create PR if gh CLI is available and user consents
if (Check-Command gh) {
    $pushConsent = Read-Host "gh CLI detected. Do you want to push the branch and open a PR now? (y/N)"
    if ($pushConsent -match '^(y|Y)') {
        try {
            git push -u origin $branch
            gh pr create --fill --title "feat: handler fixes & secrets centralization" --body "Automated PR: centralize secrets, add resilience to Gemini calls, and handler fixes. Run gitleaks and tests in CI." 
            Write-Host "PR created."
        } catch {
            Write-Warning "Push or PR creation failed: $_"
        }
    } else {
        Write-Host "Skipping push/PR creation."
    }
}

Write-Host "Script finished."
