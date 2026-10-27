param([switch]$Production)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath '.env.local')) {
  Copy-Item -LiteralPath '.env.example' -Destination '.env.local'
}
$taskRuntime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$taskPnpm = Join-Path $taskRuntime 'bin\fallback\pnpm.cmd'
$taskNodeDir = Join-Path $taskRuntime 'node\bin'
if (Test-Path -LiteralPath $taskNodeDir) { $env:PATH = "$taskNodeDir;$env:PATH" }
if (-not (Test-Path -LiteralPath 'node_modules\next\package.json')) {
  if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { & npm.cmd install }
  elseif (Test-Path -LiteralPath $taskPnpm) { & $taskPnpm install --frozen-lockfile }
  else { throw 'Install Node.js LTS (including npm), reopen PowerShell, and run this script again.' }
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
& node scripts/build-worker.mjs
if ($LASTEXITCODE -ne 0) { throw 'Worker build failed.' }
$taskWorker = Start-Process -FilePath (Get-Command node).Source -ArgumentList '--env-file=.env.local', '.next/background-worker.cjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
try {
    if ($Production) {
        & node node_modules/next/dist/bin/next build --webpack
        if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
        & node node_modules/next/dist/bin/next start --hostname 127.0.0.1
    } else {
        & node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1
    }
} finally {
    if (-not $taskWorker.HasExited) { Stop-Process -Id $taskWorker.Id }
}
