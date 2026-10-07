# Genera dist/index.tsx (código de la Railway Function) embebiendo los archivos de public/
$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)

$entradas = foreach ($f in Get-ChildItem (Join-Path $raiz 'public') -File) {
  $c = [IO.File]::ReadAllText($f.FullName, $utf8)
  $c = $c.Replace('\', '\\').Replace('`', '\`').Replace('${', '\${')
  "  '/$($f.Name)': ``$c``,"
}
$assets = "const ASSETS: Record<string, string> = {`n" + ($entradas -join "`n") + "`n};"

$server = [IO.File]::ReadAllText((Join-Path $raiz 'function\server.ts'), $utf8)
$salida = $server.Replace('// __ASSETS__', $assets)

New-Item -ItemType Directory -Force (Join-Path $raiz 'dist') | Out-Null
[IO.File]::WriteAllText((Join-Path $raiz 'dist\index.tsx'), $salida, $utf8)
"dist\index.tsx generado: {0:N1} KB" -f ((Get-Item (Join-Path $raiz 'dist\index.tsx')).Length / 1KB)
