<#
.SYNOPSIS
    Removes the HKCU registrations created by register-windows.ps1.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'SilentlyContinue'

$paths = @(
    'HKCU:\Software\Classes\Applications\localViewer.cmd'
)
foreach ($p in $paths) {
    if (Test-Path -LiteralPath $p) {
        Remove-Item -LiteralPath $p -Recurse -Force
        Write-Host "Removed $p"
    }
}

foreach ($ext in @('.md', '.stl', '.3mf')) {
    $owp = "HKCU:\Software\Classes\$ext\OpenWithProgids"
    if (Test-Path -LiteralPath $owp) {
        Remove-ItemProperty -LiteralPath $owp -Name 'Applications\localViewer.cmd' -ErrorAction SilentlyContinue
    }
    $owl = "HKCU:\Software\Classes\$ext\OpenWithList\localViewer.cmd"
    if (Test-Path -LiteralPath $owl) {
        Remove-Item -LiteralPath $owl -Recurse -Force
    }
}

Write-Host ""
Write-Host "Unregistered. You may need to log out/in for Explorer to fully refresh." -ForegroundColor Yellow
