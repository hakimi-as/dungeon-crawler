$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$url  = 'http://localhost:8080/'

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
$listener.Start()
Write-Host "Serving at $url  (Ctrl+C to stop)"

try {
  while ($listener.IsListening) {
    $ctx  = $listener.GetContext()
    $req  = $ctx.Request
    $resp = $ctx.Response

    $local = $req.Url.LocalPath
    if ($local -eq '/') { $local = '/index.html' }

    $path = Join-Path $root ($local.TrimStart('/').Replace('/', '\'))

    if (Test-Path $path -PathType Leaf) {
      $ext  = [IO.Path]::GetExtension($path)
      $ct   = if ($mime[$ext]) { $mime[$ext] } else { 'application/octet-stream' }
      $data = [IO.File]::ReadAllBytes($path)
      $resp.ContentType     = $ct
      $resp.ContentLength64 = $data.Length
      $resp.OutputStream.Write($data, 0, $data.Length)
    } else {
      $resp.StatusCode = 404
    }
    $resp.OutputStream.Close()
  }
} finally {
  $listener.Stop()
}
