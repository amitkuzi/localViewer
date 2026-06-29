<#
.SYNOPSIS
    Launches localViewer in Edge for a single .md/.stl/.3mf file.

.DESCRIPTION
    Starts a tiny loopback HTTP server (TcpListener) that serves:
      - the viewer SPA from the parent folder
      - the requested file under /file/<name>
    Then opens Edge in app-window mode pointing at the viewer with ?src=.

    Stays alive while the page is in use; auto-exits after idle timeout.
    No admin / no URL ACL reservation required (uses TcpListener directly).

.PARAMETER Path
    Absolute or relative path to the file to view.

.PARAMETER Port
    Optional fixed port. Default 0 = pick a free ephemeral port.

.PARAMETER IdleMinutes
    Shut the server down after this many minutes with no requests. Default 15.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Path,

    [int]$Port = 0,

    [int]$IdleMinutes = 15
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Write-Error "File not found: $Path"
    exit 1
}

$file       = Get-Item -LiteralPath $Path
$viewerDir  = Split-Path -Parent $PSScriptRoot      # parent of tools/ = viewer/
$viewerDirN = ([IO.Path]::GetFullPath($viewerDir)).TrimEnd('\') + '\'
$fileName   = $file.Name

# ---- start TCP listener ----
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
$boundPort = $listener.LocalEndpoint.Port
Write-Host "localViewer serving on http://127.0.0.1:$boundPort/"

# ---- open Edge in app mode ----
# Pass the real on-disk path too, so the viewer can show it and reveal the
# file in Explorer via the /__open-folder endpoint below.
$srcParam  = '/file/' + [uri]::EscapeDataString($fileName)
$pathParam = [uri]::EscapeDataString($file.FullName)
$url       = "http://127.0.0.1:$boundPort/?src=$srcParam&path=$pathParam"
$edgeArgs  = @("--app=$url", "--new-window")

$edgeExe = $null
foreach ($cand in @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)) { if (Test-Path -LiteralPath $cand) { $edgeExe = $cand; break } }

try {
    if ($edgeExe) {
        Start-Process -FilePath $edgeExe -ArgumentList $edgeArgs | Out-Null
    } else {
        # Fall back to default browser
        Start-Process $url | Out-Null
    }
} catch {
    Write-Warning "Could not open browser automatically. Visit: $url"
}

# ---- minimal HTTP server ----
$mime = @{
    '.html'        = 'text/html; charset=utf-8'
    '.htm'         = 'text/html; charset=utf-8'
    '.js'          = 'application/javascript; charset=utf-8'
    '.mjs'         = 'application/javascript; charset=utf-8'
    '.json'        = 'application/json; charset=utf-8'
    '.webmanifest' = 'application/manifest+json; charset=utf-8'
    '.svg'         = 'image/svg+xml'
    '.png'         = 'image/png'
    '.css'         = 'text/css; charset=utf-8'
    '.md'          = 'text/markdown; charset=utf-8'
    '.markdown'    = 'text/markdown; charset=utf-8'
    '.txt'         = 'text/plain; charset=utf-8'
    '.stl'         = 'application/sla'
    '.3mf'         = 'model/3mf'
}

function Send-Response {
    param(
        [System.IO.Stream]$stream,
        [string]$status,
        [hashtable]$headers,
        [byte[]]$body
    )
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine("HTTP/1.1 $status")
    foreach ($k in $headers.Keys) { [void]$sb.AppendLine("${k}: $($headers[$k])") }
    [void]$sb.AppendLine("Content-Length: $($body.Length)")
    [void]$sb.AppendLine("Connection: close")
    [void]$sb.AppendLine()
    $head = [System.Text.Encoding]::ASCII.GetBytes($sb.ToString())
    $stream.Write($head, 0, $head.Length)
    if ($body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
    $stream.Flush()
}

$idleTimeout  = [TimeSpan]::FromMinutes($IdleMinutes)
$lastActivity = Get-Date

try {
    while ($true) {
        if (-not $listener.Pending()) {
            if ((Get-Date) - $lastActivity -gt $idleTimeout) {
                Write-Host "Idle timeout reached. Shutting down."
                break
            }
            Start-Sleep -Milliseconds 150
            continue
        }

        $client = $listener.AcceptTcpClient()
        $lastActivity = Get-Date

        try {
            $stream = $client.GetStream()
            $stream.ReadTimeout  = 5000
            $stream.WriteTimeout = 5000
            $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)

            $requestLine = $reader.ReadLine()
            if (-not $requestLine) { $client.Close(); continue }
            while (($h = $reader.ReadLine()) -ne $null -and $h.Length -gt 0) { }

            $parts = $requestLine -split ' '
            if ($parts.Count -lt 2) { $client.Close(); continue }
            $method  = $parts[0]
            $target  = $parts[1]
            $urlPath = ($target -split '\?')[0]

            # Reveal the served file in Explorer. No client input is trusted —
            # the server already knows exactly which file it is serving.
            if ($urlPath -eq '/__open-folder') {
                try {
                    Start-Process explorer.exe -ArgumentList "/select,`"$($file.FullName)`"" | Out-Null
                    $b = [System.Text.Encoding]::UTF8.GetBytes('ok')
                    Send-Response $stream "200 OK" @{ 'Content-Type' = 'text/plain'; 'Cache-Control' = 'no-store' } $b
                } catch {
                    $b = [System.Text.Encoding]::UTF8.GetBytes('error')
                    Send-Response $stream "500 Internal Server Error" @{ 'Content-Type' = 'text/plain' } $b
                }
                $client.Close(); continue
            }

            if ($method -ne 'GET' -and $method -ne 'HEAD') {
                $b = [System.Text.Encoding]::UTF8.GetBytes('Method not allowed')
                Send-Response $stream "405 Method Not Allowed" @{ 'Content-Type' = 'text/plain' } $b
                $client.Close(); continue
            }

            $bytes = $null
            $ctype = 'application/octet-stream'

            if ($urlPath -like '/file/*') {
                # Only the configured file is exposed under /file/
                $requestedName = [uri]::UnescapeDataString($urlPath.Substring('/file/'.Length))
                if ($requestedName -eq $fileName) {
                    $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
                    $ext   = $file.Extension.ToLower()
                    if ($mime.ContainsKey($ext)) { $ctype = $mime[$ext] }
                }
            }
            else {
                $rel = $urlPath.TrimStart('/')
                if ([string]::IsNullOrEmpty($rel)) { $rel = 'index.html' }
                $rel = $rel -replace '/', '\'
                $candidate = [IO.Path]::GetFullPath((Join-Path $viewerDir $rel))
                if ($candidate.StartsWith($viewerDirN, [System.StringComparison]::OrdinalIgnoreCase) -and
                    (Test-Path -LiteralPath $candidate -PathType Leaf)) {
                    $bytes = [System.IO.File]::ReadAllBytes($candidate)
                    $ext   = [IO.Path]::GetExtension($candidate).ToLower()
                    if ($mime.ContainsKey($ext)) { $ctype = $mime[$ext] }
                }
            }

            if ($null -ne $bytes) {
                $hdrs = @{ 'Content-Type' = $ctype; 'Cache-Control' = 'no-store' }
                if ($method -eq 'HEAD') {
                    Send-Response $stream "200 OK" $hdrs ([byte[]]@())
                } else {
                    Send-Response $stream "200 OK" $hdrs $bytes
                }
            } else {
                $b = [System.Text.Encoding]::UTF8.GetBytes("Not Found: $urlPath")
                Send-Response $stream "404 Not Found" @{ 'Content-Type' = 'text/plain' } $b
            }
        } catch {
            # Per-connection errors are non-fatal
        } finally {
            $client.Close()
        }
    }
} finally {
    $listener.Stop()
}
