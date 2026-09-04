# Registers a user-logon Scheduled Task that keeps the paper-only scanner
# running through scripts\run_scanner.cmd (restart loop, logs\scanner.log).
#
#   Task name : PredictionAlphaBotScanner
#   Trigger   : at logon of the current user
#   Restart   : 3 times, 2 minutes apart, if the wrapper itself dies
#   Rights    : none beyond the current user; no admin prompt
#
# Run from a normal PowerShell:  .\scripts\install_scanner_task.ps1
# Start without re-logging:      Start-ScheduledTask -TaskName PredictionAlphaBotScanner
# Remove again:                  .\scripts\install_scanner_task.ps1 -Uninstall
#
# The scanner reads .env from the repo root. Set ARB_PUBLISH_DIR there if the
# arb_scan.json feed should be written; without it nothing is published.

param(
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$taskName = "PredictionAlphaBotScanner"
$repo = Split-Path -Parent $PSScriptRoot
$wrapper = Join-Path $repo "scripts\run_scanner.cmd"

if ($Uninstall) {
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        Write-Output "removed $taskName"
    } else {
        Write-Output "$taskName was not registered"
    }
    exit 0
}

if (-not (Test-Path $wrapper)) {
    throw "wrapper not found: $wrapper"
}

if (-not (Test-Path (Join-Path $repo "node_modules"))) {
    throw "node_modules missing in $repo; run npm ci first"
}

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$wrapper`"" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 2) `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Output "registered $taskName (paper-only scanner, restart loop, logs\scanner.log)"
Write-Output "Start now without reboot: Start-ScheduledTask -TaskName $taskName"
