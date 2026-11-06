param([string]$PairingUrl = 'https://voadesk.onrender.com')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'build.ps1') -PairingUrl $PairingUrl
if ($LASTEXITCODE -ne 0) { throw 'Build de distribuição falhou.' }
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$stage = Join-Path $projectRoot ('.cache\installation-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '\VoaDeskTecnico')
New-Item -ItemType Directory -Force -Path $stage | Out-Null
foreach ($folder in @('src','dist','runtime')) { New-Item -ItemType Directory -Force -Path (Join-Path $stage $folder) | Out-Null }
Copy-Item -LiteralPath (Join-Path $projectRoot 'src') -Destination $stage -Recurse -Force
foreach ($binary in @('VoaDesk.exe','VoaDeskWindow.exe','FarolProbe.exe','VoaDeskCliente.exe')) { Copy-Item -LiteralPath (Join-Path $projectRoot ('dist\'+$binary)) -Destination (Join-Path $stage 'dist') }
$node = (Get-Command node.exe -ErrorAction Stop).Source
Copy-Item -LiteralPath $node -Destination (Join-Path $stage 'runtime\node.exe')
$nodeVersion = (& $node --version).Trim()
$licenseDir = Join-Path $projectRoot '.cache\licenses'
New-Item -ItemType Directory -Force -Path $licenseDir | Out-Null
$nodeLicense = Join-Path $licenseDir ('node-'+$nodeVersion+'-LICENSE.txt')
if (!(Test-Path -LiteralPath $nodeLicense)) { Invoke-WebRequest -UseBasicParsing -Uri ('https://raw.githubusercontent.com/nodejs/node/'+$nodeVersion+'/LICENSE') -OutFile $nodeLicense }
if (!(Get-Content -LiteralPath $nodeLicense -Raw).StartsWith('Node.js is licensed for use as follows:')) { throw 'Licenca oficial do Node.js nao confirmada.' }
Copy-Item -LiteralPath $nodeLicense -Destination (Join-Path $stage 'runtime\LICENSE.txt')
Copy-Item -LiteralPath (Join-Path $projectRoot 'LICENSE') -Destination $stage
Copy-Item -LiteralPath (Join-Path $projectRoot 'package.json') -Destination $stage
$start = '@echo off' + "`r`n" + 'start "" "%~dp0dist\VoaDesk.exe" --online' + "`r`n"
Set-Content -LiteralPath (Join-Path $stage 'AbrirTecnico.bat') -Value $start -Encoding Ascii
$guide = @"
VoaDesk Tecnico $version - previa de teste em rede local

1. Extraia esta pasta inteira. Execute AbrirTecnico.bat.
2. O Node.js esta incluido. Microsoft Edge e .NET Framework 4.8 sao necessarios.
3. A credencial do tecnico e lida da configuracao privada ja existente nesta conta Windows.
   A distribuicao nao contem credenciais. Em outro computador de tecnico e necessario provisionamento autorizado.
4. Entregue VoaDeskCliente.exe ao computador atendido. Ambos precisam de internet e da mesma rede local.
5. Informe o codigo do cliente, solicite atendimento e aguarde consentimento e selecao do monitor SDR.
6. Teste visualizar antes de autorizar controle. Encerre e confirme a parada nas duas pontas.

Servidor: $PairingUrl
Sem TURN ou garantia de conexao entre redes diferentes. Nao desative firewall, Defender ou UAC.
O servidor usa presencas em memoria e codigos derivados. Reinicios encerram sessoes; a chave do servidor e a identidade local preservam o codigo, nao um historico em banco.
"@
Set-Content -LiteralPath (Join-Path $stage 'LEIA-ME.txt') -Value $guide -Encoding UTF8
$manifest = Get-ChildItem -LiteralPath $stage -Recurse -File | ForEach-Object { [pscustomobject]@{ path = $_.FullName.Substring($stage.Length+1).Replace('\','/'); sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() } }
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stage 'manifest-sha256.json') -Encoding UTF8
$output = Join-Path $projectRoot ('instala'+[char]0xE7+[char]0xE3+'o')
New-Item -ItemType Directory -Force -Path $output | Out-Null
$client = Join-Path $output 'VoaDeskCliente.exe'
$technician = Join-Path $output 'VoaDeskTecnico.zip'
Copy-Item -LiteralPath (Join-Path $projectRoot 'dist\VoaDeskCliente.exe') -Destination $client -Force
Compress-Archive -LiteralPath $stage -DestinationPath $technician -Force
foreach ($file in @($client,$technician)) { Get-FileHash -LiteralPath $file -Algorithm SHA256 | Select-Object Path,Hash }
Write-Output 'Dois arquivos preparados; nenhum dado ou credencial local foi incluido.'
