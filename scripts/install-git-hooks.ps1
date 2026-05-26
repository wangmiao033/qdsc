$ErrorActionPreference = "Stop"
$root = git -c safe.directory=H:/qdsc/qdsc rev-parse --show-toplevel
if (-not $root) {
  Write-Error "Not a git repository."
}

$src = Join-Path $root "scripts\git-hooks\post-commit"
$dst = Join-Path $root ".git\hooks\post-commit"

if (-not (Test-Path $src)) {
  Write-Error "Missing hook source: $src"
}

Copy-Item -Path $src -Destination $dst -Force
Write-Host "Installed post-commit hook -> $dst"
Write-Host "Every local commit will auto-run: git push origin <current-branch>"
