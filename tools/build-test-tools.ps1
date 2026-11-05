param([string]$PairingUrl = 'http://127.0.0.1:47832')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'build.ps1') -PairingUrl $PairingUrl
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$cache = Join-Path $projectRoot '.cache\native'
& $compiler /nologo /target:exe /platform:x64 /optimize+ /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Net.Http.dll ('/reference:' + (Join-Path $projectRoot 'dist\VoaDeskCliente.exe')) ('/out:' + (Join-Path $cache 'ClientSmoke.exe')) (Join-Path $projectRoot 'native\ClientSmoke.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar teste do cliente.' }
Copy-Item -LiteralPath (Join-Path $projectRoot 'dist\VoaDeskCliente.exe') -Destination (Join-Path $cache 'VoaDeskCliente.exe') -Force
& $compiler /nologo /target:exe /platform:x64 /optimize+ ('/out:' + (Join-Path $cache 'WindowSmoke.exe')) (Join-Path $projectRoot 'native\WindowSmoke.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar teste da janela.' }
