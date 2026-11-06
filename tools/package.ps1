param([string]$PairingUrl = 'http://127.0.0.1:47832', [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (!$SkipBuild) { & (Join-Path $PSScriptRoot 'build.ps1') -PairingUrl $PairingUrl }
else { foreach ($binary in @('VoaDesk.exe','VoaDeskCliente.exe','VoaDeskWindow.exe','FarolProbe.exe')) { if (!(Test-Path -LiteralPath (Join-Path $projectRoot ('dist\'+$binary)))) { throw ('Binario ausente: '+$binary) } } }
$stagingRoot = Join-Path $projectRoot ('.cache\packages\' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '\VoaDesk')
New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null
foreach ($entry in @('src','native','tools','docs','tests','assets','README.md','AGENTS.md','LICENSE','package.json','IniciarVoaDesk.bat','IniciarCliente.bat')) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $entry) -Destination $stagingRoot -Recurse
}
$binaryDir = Join-Path $stagingRoot 'dist'
New-Item -ItemType Directory -Force -Path $binaryDir | Out-Null
foreach ($binary in @('VoaDesk.exe','VoaDeskCliente.exe','VoaDeskWindow.exe','FarolProbe.exe')) {
  Copy-Item -LiteralPath (Join-Path $projectRoot ('dist\' + $binary)) -Destination $binaryDir
}
$evidenceDir = Join-Path $stagingRoot 'artifacts'
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null
foreach ($entry in @('voadesk','support-local','voadesk-video','render-deployment.json','startup-permission-fix.json')) {
  $evidencePath = Join-Path $projectRoot ('artifacts\' + $entry)
  if (Test-Path -LiteralPath $evidencePath) { Copy-Item -LiteralPath $evidencePath -Destination $evidenceDir -Recurse }
}
foreach ($entry in @('environment.json','video-smoke.json','video-local-raw.json','video-synthetic.png','synthetic-quality-1080.png')) {
  $evidencePath = Join-Path $projectRoot ('artifacts\' + $entry)
  if (Test-Path -LiteralPath $evidencePath) { Copy-Item -LiteralPath $evidencePath -Destination $evidenceDir }
}
$zip = Join-Path $projectRoot 'dist\VoaDesk-0.4.0-local-windows-x64.zip'
Compress-Archive -LiteralPath $stagingRoot -DestinationPath $zip -Force
$clientDir = Join-Path (Split-Path -Parent $stagingRoot) 'VoaDeskCliente'
New-Item -ItemType Directory -Force -Path $clientDir | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'dist\VoaDeskCliente.exe') -Destination $clientDir
$instructions = "VoaDesk Cliente 0.4 local`r`nAbra VoaDeskCliente.exe e informe o codigo ao suporte.`r`nServidor configurado: $PairingUrl`r`nCodigo fixo; sessao exige autorizacao explicita. Este pacote localhost atende somente a mesma maquina. Compartilhar usa Edge e um monitor SDR.`r`nSem conexao: tente novamente ou solicite um arquivo configurado ao suporte.`r`n"
Set-Content -LiteralPath (Join-Path $clientDir 'LEIA-ME.txt') -Value $instructions -Encoding UTF8
$clientZip = Join-Path $projectRoot 'dist\VoaDeskCliente-0.4.0-local.zip'
Compress-Archive -LiteralPath $clientDir -DestinationPath $clientZip -Force
foreach ($archive in @($zip,$clientZip)) {
  $hash = Get-FileHash -LiteralPath $archive -Algorithm SHA256
  Set-Content -LiteralPath ($archive + '.sha256') -Encoding Ascii -Value ($hash.Hash + '  ' + [IO.Path]::GetFileName($archive))
  $hash
}
Write-Output 'Pacotes VoaDesk gerados sem perfil, historico ou credenciais. Cliente e um unico EXE sem Node.js.'
