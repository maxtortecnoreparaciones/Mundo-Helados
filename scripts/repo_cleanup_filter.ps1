# repo_cleanup_filter.ps1
# PowerShell script to backup repo, remove sensitive files from git history using git-filter-repo,
# run housekeeping and run gitleaks + tests locally.
# Run from repository root in PowerShell: .\scripts\repo_cleanup_filter.ps1

$ErrorActionPreference = 'Stop'

function Check-Command($name) {
    try { Get-Command $name -ErrorAction Stop | Out-Null; return $true } catch { return $false }
}

if (-not (Check-Command git)) { Write-Error "git not found. Install Git and re-run."; exit 1 }
if (-not (Test-Path .git)) { Write-Error "Current folder is not a git repository. Run from repo root."; exit 1 }

# Ensure working tree clean
$status = git status --porcelain
if ($status) {
    Write-Error "Working tree is not clean. Commit or stash changes before running this script.\n$status"; exit 1
}

$confirm = Read-Host "This operation will rewrite git history and delete specified sensitive files from all commits. Have you rotated/revoked the exposed credentials and created a backup? Type YES to continue"
if ($confirm -ne 'YES') { Write-Host "Aborted by user."; exit 0 }

# Backup bundle
$timestamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
$bundlePath = Join-Path '..' "repo-backup-$timestamp.bundle"
Write-Host "Creating backup bundle at: $bundlePath"
git bundle create "$bundlePath" --all
Write-Host "Backup bundle created."

# Ensure git-filter-repo is installed (python + pip)
$hasPython = Check-Command python -or Check-Command python3
if (-not $hasPython) { Write-Error "Python is required for git-filter-repo. Install Python and re-run."; exit 1 }

# Try import git_filter_repo, else pip install
$gitFilterRepoOk = $false
try {
    & python -c "import git_filter_repo" 2>$null
    if ($LASTEXITCODE -eq 0) { $gitFilterRepoOk = $true }
} catch {}

if (-not $gitFilterRepoOk) {
    Write-Host "Installing git-filter-repo via pip..."
    & python -m pip install --upgrade pip
    & python -m pip install git-filter-repo
}

# Prepare replace-text file (optional) if exists
$replaceFile = Join-Path (Get-Location) 'replace-secrets.txt'
if (Test-Path $replaceFile) {
    Write-Host "Using replace-text file: $replaceFile"
    $replaceArg = "--replace-text $replaceFile"
} else {
    $replaceArg = ""
}

# Paths to remove from history (relative to repo root)
$pathsToRemove = @(
    'service_account.json',
    'bot-wasap/auth_info_baileys',
    'bot-wasap/auth_info_baileys/creds.json',
    'bot-wasap/service_account.json'
)

# Build git-filter-repo command
$pathArgs = $pathsToRemove | ForEach-Object { "--path `"$_`"" } | Out-String
$pathArgs = $pathArgs -replace "\s+"," "

Write-Host "About to run git filter-repo to remove paths:`n$($pathsToRemove -join "`n")"
$finalCmd = "git filter-repo --force --invert-paths $pathArgs $replaceArg"
Write-Host "Running: $finalCmd"

# Execute filter-repo
try {
    iex $finalCmd
} catch {
    Write-Error "git-filter-repo failed: $_"; exit 1
}

Write-Host "git-filter-repo completed. Performing reflog expire and gc..."

git reflog expire --expire=now --all
git gc --prune=now --aggressive

Write-Host "Repository cleaned locally.\nNext recommended steps (MANUAL):\n 1) Inspect history and run 'git log --name-only --all | egrep "service_account.json|auth_info_baileys"' to confirm removal.\n 2) Run gitleaks to verify no secrets remain.\n 3) If satisfied, coordinate with team and force-push to remote: 'git push origin --force --all' and 'git push origin --force --tags'."

# Run gitleaks if available
if (Get-Command npx -ErrorAction SilentlyContinue) {
    Write-Host "Running gitleaks detect via npx..."
    try { npx --no-install gitleaks@latest detect --source . --verbose } catch { Write-Warning "gitleaks reported issues or failed. Check output above." }
} elseif (Get-Command docker -ErrorAction SilentlyContinue) {
    $pwdUnix = (Get-Location).Path -replace "\\","/"
    try { docker run --rm -v "${pwdUnix}:/repo" zricethezav/gitleaks:latest detect --source=/repo --verbose } catch { Write-Warning "Docker gitleaks failed." }
} else {
    Write-Warning "Neither npx nor docker available to run gitleaks. Please run gitleaks manually."
}

# Run tests (optional)
if (Test-Path package.json) {
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        Write-Host "Running npm test at repo root..."
        try { npm test } catch { Write-Warning "Root tests failed or not configured." }
    }
}

# Optionally run bot-wasap tests
$botDir = Join-Path (Get-Location) 'bot-wasap'
if (Test-Path (Join-Path $botDir 'package.json')) {
    Push-Location $botDir
    try {
        if (Get-Command npm -ErrorAction SilentlyContinue) {
            Write-Host "Running npm test in bot-wasap..."
            try { npm test } catch { Write-Warning "bot-wasap tests failed or not configured." }
        }
    } finally { Pop-Location }
}

Write-Host "Script finished. If results are satisfactory, coordinate with your team and force-push to remote."
