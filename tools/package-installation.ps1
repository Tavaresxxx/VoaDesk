param([string]$PairingUrl = 'https://voadesk.onrender.com')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'build.ps1') -PairingUrl $PairingUrl
if ($LASTEXITCODE -ne 0) { throw 'Build de distribuição falhou.' }
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$stage = Join-Path $projectRoot ('.cache\installation-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '\VoaDeskTecnico')
New-Item -ItemType Directory -Force -Path $stage | Out-Null
foreach ($folder in @('src','dist','runtime','assets')) { New-Item -ItemType Directory -Force -Path (Join-Path $stage $folder) | Out-Null }
Copy-Item -LiteralPath (Join-Path $projectRoot 'src') -Destination $stage -Recurse -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'assets\Logo.png.base64') -Destination (Join-Path $stage 'assets')
foreach ($binary in @('VoaDesk.exe','FarolProbe.exe','VoaDeskCliente.exe')) { Copy-Item -LiteralPath (Join-Path $projectRoot ('dist\'+$binary)) -Destination (Join-Path $stage 'dist') }
Copy-Item -LiteralPath (Join-Path $projectRoot 'dist\VoaDeskTecnico.exe') -Destination $stage
foreach($dependency in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','WebView2-LICENSE.txt','WebView2-NOTICE.txt')){
 Copy-Item -LiteralPath (Join-Path $projectRoot ('dist\'+$dependency)) -Destination $stage
 Copy-Item -LiteralPath (Join-Path $projectRoot ('dist\'+$dependency)) -Destination (Join-Path $stage 'dist')
}
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
$start = '@echo off' + "`r`n" + 'start "" "%~dp0VoaDeskTecnico.exe" --online' + "`r`n"
Set-Content -LiteralPath (Join-Path $stage 'AbrirTecnico.bat') -Value $start -Encoding Ascii
$localStart = '@echo off' + "`r`n" + 'start "" "%~dp0VoaDeskTecnico.exe" --local' + "`r`n"
Set-Content -LiteralPath (Join-Path $stage 'AbrirTecnicoLocal.bat') -Value $localStart -Encoding Ascii
Set-Content -LiteralPath (Join-Path $stage 'modo-online.flag') -Value 'VoaDesk: usar a configuracao existente do operador; --local inicia somente localhost.' -Encoding Ascii
$guide = @"
VoaDesk Tecnico $version - previa de teste em rede local

1. Extraia esta pasta inteira. Abra VoaDeskTecnico.exe pelo icone. AbrirTecnico.bat continua disponivel como alternativa.
2. O Node.js e o SDK WebView2 estao incluidos. Windows x64, .NET Framework 4.8 e Microsoft Edge WebView2 Runtime Evergreen sao necessarios.
   A janela informa se o WebView2 Runtime estiver ausente e mostra o link oficial de instalacao. Nao e necessario instalar Node.js.
3. A credencial do tecnico e lida da configuracao privada ja existente nesta conta Windows.
   A distribuicao nao contem credenciais. Em outro computador de tecnico e necessario provisionamento autorizado.
4. Entregue VoaDeskCliente.exe ao computador atendido. Ambos precisam de internet e da mesma rede local.
5. Informe o codigo do cliente e clique em Solicitar acesso. A tela de espera abre e solicita o consentimento no cliente.
   O cliente compacto expande para Aceitar conexao ou recusar. Aceitar autoriza controle, monitores e arquivos.
6. Use a barra do tecnico para trocar de monitor, ajustar zoom e copiar arquivos. Encerre e confirme a parada nas duas pontas.
7. Para receber ajuda neste computador, use Abrir meu codigo na tela inicial. O cliente mostra o codigo real do dispositivo.
8. AbrirTecnicoLocal.bat inicia sinalizacao somente em loopback para teste nesta maquina. Nenhuma credencial e exigida nesse modo.
9. Fechar a janela encerra a sessao e o servidor local pertencente ao aplicativo. Outros processos nao sao encerrados.

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
