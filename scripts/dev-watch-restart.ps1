param(
    [Parameter(Mandatory = $false)]
    [string]$ProjectDir = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"

$script:DevProcess = $null

function Get-PortPids {
    param(
        [int[]]$Ports
    )

    $allPids = New-Object System.Collections.Generic.List[string]

    foreach ($port in $Ports) {
        $lines = netstat -ano -p tcp | Select-String -Pattern (":{0}\s+.*LISTENING\s+(\d+)$" -f $port)
        foreach ($line in $lines) {
            if ($line.Matches.Count -gt 0) {
                $pid = $line.Matches[0].Groups[1].Value
                if ($pid -match "^\d+$") {
                    [void]$allPids.Add($pid)
                }
            }
        }
    }

    return $allPids | Sort-Object -Unique
}

function Stop-Pids {
    param(
        [string[]]$Pids
    )

    foreach ($pid in ($Pids | Sort-Object -Unique)) {
        if ($pid -and $pid -match "^\d+$" -and $pid -ne "$PID") {
            cmd /c "taskkill /PID $pid /T /F" > $null 2>&1
        }
    }
}

function Stop-DevProcess {
    if ($script:DevProcess -and -not $script:DevProcess.HasExited) {
        cmd /c "taskkill /PID $($script:DevProcess.Id) /T /F" > $null 2>&1
        Start-Sleep -Milliseconds 600
    }
}

function Restart-Dev {
    param(
        [string]$Reason
    )

    Write-Host ""
    Write-Host "[RESTART] $Reason"

    Stop-DevProcess

    $portPids = Get-PortPids -Ports @(3000, 8300)
    if ($portPids.Count -gt 0) {
        Write-Host "[PORTS] Killing listeners on 3000/8300: $($portPids -join ', ')"
        Stop-Pids -Pids $portPids
        Start-Sleep -Seconds 1
    }

    $script:DevProcess = Start-Process -FilePath "pnpm.cmd" -ArgumentList @("run", "dev") -WorkingDirectory $ProjectDir -PassThru -NoNewWindow
    Write-Host "[RUNNING] pnpm run dev (PID: $($script:DevProcess.Id))"
}

$watchRoots = @("src", "api")
$watchers = @()
$subscriptions = @()
$sourceIndex = 0

foreach ($root in $watchRoots) {
    $fullPath = Join-Path $ProjectDir $root
    if (-not (Test-Path $fullPath)) {
        continue
    }

    $fsw = New-Object System.IO.FileSystemWatcher
    $fsw.Path = $fullPath
    $fsw.Filter = "*.*"
    $fsw.IncludeSubdirectories = $true
    $fsw.NotifyFilter = [System.IO.NotifyFilters]::FileName -bor [System.IO.NotifyFilters]::LastWrite -bor [System.IO.NotifyFilters]::DirectoryName
    $fsw.EnableRaisingEvents = $true

    $watchers += $fsw

    foreach ($evtName in @("Changed", "Created", "Deleted", "Renamed")) {
        $sourceIndex++
        $sourceId = "DevWatch_$sourceIndex"
        $subscriptions += Register-ObjectEvent -InputObject $fsw -EventName $evtName -SourceIdentifier $sourceId
    }
}

Write-Host ""
Write-Host "Dev mode watcher started"
Write-Host "- Auto restart on code/file changes"
Write-Host "- Ctrl+F5 to force restart ports 3000/8300"
Write-Host "- Ctrl+C to stop"

$pendingRestart = $false
$pendingReason = ""
$lastEventAt = Get-Date

try {
    Restart-Dev -Reason "Initial start"

    while ($true) {
        while ($true) {
            $evt = Wait-Event -Timeout 0
            if (-not $evt) {
                break
            }

            if ($evt.SourceIdentifier -like "DevWatch_*") {
                $pendingRestart = $true
                $pendingReason = "Detected code changes"
                $lastEventAt = Get-Date
            }

            Remove-Event -EventIdentifier $evt.EventIdentifier -ErrorAction SilentlyContinue
        }

        if ($pendingRestart -and (((Get-Date) - $lastEventAt).TotalMilliseconds -ge 900)) {
            $pendingRestart = $false
            Restart-Dev -Reason $pendingReason
        }

        if ([Console]::KeyAvailable) {
            $key = [Console]::ReadKey($true)
            $ctrlPressed = ($key.Modifiers -band [ConsoleModifiers]::Control) -eq [ConsoleModifiers]::Control
            if ($ctrlPressed -and $key.Key -eq [ConsoleKey]::F5) {
                $pendingRestart = $false
                Restart-Dev -Reason "Manual Ctrl+F5"
            }
        }

        Start-Sleep -Milliseconds 150
    }
}
finally {
    Stop-DevProcess
    $portPids = Get-PortPids -Ports @(3000, 8300)
    Stop-Pids -Pids $portPids

    foreach ($sub in $subscriptions) {
        if ($sub) {
            Unregister-Event -SubscriptionId $sub.Id -ErrorAction SilentlyContinue
        }
    }

    foreach ($watcher in $watchers) {
        if ($watcher) {
            $watcher.Dispose()
        }
    }
}
