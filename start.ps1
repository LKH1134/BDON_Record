$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskNode = Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
$taskBundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (-not $taskNode -or [int]((& $taskNode --version).TrimStart('v').Split('.')[0]) -lt 24) {
    if (Test-Path -LiteralPath $taskBundledNode) { $taskNode = $taskBundledNode }
    else { throw 'Node.js 24 or newer is required.' }
}
$taskPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) { $taskPython = 'python' }
& $taskPython scripts/import_data.py
if ($LASTEXITCODE -ne 0) { throw 'Excel data import failed.' }
& $taskNode server/index.mjs
