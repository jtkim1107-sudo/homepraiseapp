# Simple static file server for the homeapp folder.
# Usage: powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 5173]
param(
  [int]$Port = 5173,
  [string]$Root = $PSScriptRoot
)

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "우리집 칭찬가게 → http://localhost:$Port/"
Write-Host "Serving: $Root"

$mime = @{
  '.html'='text/html; charset=utf-8'
  '.css' ='text/css; charset=utf-8'
  '.js'  ='application/javascript; charset=utf-8'
  '.json'='application/json; charset=utf-8'
  '.svg' ='image/svg+xml'
  '.png' ='image/png'
  '.jpg' ='image/jpeg'
  '.ico' ='image/x-icon'
  '.txt' ='text/plain; charset=utf-8'
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    try {
      $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
      if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }
      $safe = $path.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)
      $file = Join-Path $Root $safe
      $full = [IO.Path]::GetFullPath($file)
      $rootFull = [IO.Path]::GetFullPath($Root)
      if (-not $full.StartsWith($rootFull)) {
        $res.StatusCode = 403
      } elseif (Test-Path -LiteralPath $full -PathType Leaf) {
        $ext = [IO.Path]::GetExtension($full).ToLower()
        $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $bytes = [IO.File]::ReadAllBytes($full)
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $res.StatusCode = 404
        $msg = [Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
        $res.OutputStream.Write($msg, 0, $msg.Length)
      }
    } catch {
      $res.StatusCode = 500
    } finally {
      $res.OutputStream.Close()
    }
  }
} finally {
  $listener.Stop()
}
