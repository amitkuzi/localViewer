<#
.SYNOPSIS
    Removes the HKCU registrations created by register-windows.ps1.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'SilentlyContinue'

# 1) Remove the Application entry
$appKey = 'HKCU:\Software\Classes\Applications\localViewer.cmd'
if (Test-Path -LiteralPath $appKey) {
    Remove-Item -LiteralPath $appKey -Recurse -Force
    Write-Host "Removed $appKey"
}

foreach ($ext in @('.md', '.stl', '.3mf')) {
    # 2) Remove from HKCU\Software\Classes\<.ext>\OpenWithList
    $classesList = "HKCU:\Software\Classes\$ext\OpenWithList\localViewer.cmd"
    if (Test-Path -LiteralPath $classesList) {
        Remove-Item -LiteralPath $classesList -Recurse -Force
    }
    # Also clean legacy OpenWithProgids entry if any
    $owp = "HKCU:\Software\Classes\$ext\OpenWithProgids"
    if (Test-Path -LiteralPath $owp) {
        Remove-ItemProperty -LiteralPath $owp -Name 'Applications\localViewer.cmd' -ErrorAction SilentlyContinue
    }

    # 3) Remove from Explorer FileExts OpenWithList (the slot letter pointing at localViewer.cmd)
    $fileExts = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$ext\OpenWithList"
    if (Test-Path -LiteralPath $fileExts) {
        $props = Get-ItemProperty -Path $fileExts -ErrorAction SilentlyContinue
        if ($props) {
            $removed = @()
            foreach ($p in $props.PSObject.Properties) {
                if ($p.Name -match '^[a-z]$' -and $p.Value -eq 'localViewer.cmd') {
                    Remove-ItemProperty -LiteralPath $fileExts -Name $p.Name -ErrorAction SilentlyContinue
                    $removed += $p.Name
                }
            }
            # Strip removed letters from MRUList
            $mru = (Get-ItemProperty -Path $fileExts -Name 'MRUList' -ErrorAction SilentlyContinue).MRUList
            if ($mru) {
                foreach ($r in $removed) { $mru = $mru -replace [regex]::Escape($r), '' }
                Set-ItemProperty -Path $fileExts -Name 'MRUList' -Value $mru
            }
        }
    }
}

# 4) Restart Explorer so the menu refreshes
$ans = Read-Host "Restart Explorer now so the menu refreshes? [Y/n]"
if ($ans -eq '' -or $ans -match '^[Yy]') {
    Get-Process explorer -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Milliseconds 600
    if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) {
        Start-Process explorer.exe
    }
    Write-Host "Explorer restarted." -ForegroundColor Green
}

Write-Host ""
Write-Host "Unregistered localViewer from .md / .stl / .3mf." -ForegroundColor Yellow
