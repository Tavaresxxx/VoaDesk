$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = Split-Path -Parent $PSScriptRoot
$output = Join-Path $projectRoot ('instala'+[char]0xE7+[char]0xE3+'o')
$files = @(Get-ChildItem -LiteralPath $output -File)
if ($files.Count -ne 2) { throw 'A pasta de instalacao deve conter os dois arquivos esperados.' }
$target = Join-Path $projectRoot ('.cache\installation-qa-' + [guid]::NewGuid().ToString('N'))
Expand-Archive -LiteralPath (Join-Path $output 'VoaDeskTecnico.zip') -DestinationPath $target
$packageRoot = Join-Path $target 'VoaDeskTecnico'
$manifest = Get-Content -LiteralPath (Join-Path $packageRoot 'manifest-sha256.json') -Raw | ConvertFrom-Json
foreach ($entry in $manifest) {
  $file = [IO.Path]::GetFullPath((Join-Path $packageRoot $entry.path))
  if (!$file.StartsWith($packageRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Caminho fora do pacote.' }
  if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw 'Integridade do pacote nao confirmada.' }
}
$forbidden = Get-ChildItem -LiteralPath $packageRoot -Recurse -Force | Where-Object { $_.Name -in @('.runtime','.cache','.env','operator-settings.json','update-signing-key.pem','pairing-devices.json','saved-clients.json','history.json') }
if ($forbidden) { throw 'Arquivo privado inesperado no pacote.' }
$credential = & (Join-Path $projectRoot '.cache\native\OperatorSettings.exe') --read (Join-Path $projectRoot '.runtime\operator-settings.json')
foreach ($file in (Get-ChildItem -LiteralPath $packageRoot -Recurse -File | Where-Object { $_.Extension -in @('.mjs','.json','.txt','.bat','.html','.css') })) {
  if ([IO.File]::ReadAllText($file.FullName).Contains($credential)) { throw 'Credencial encontrada no pacote.' }
}
$credential = $null
$nodeVersion = (& (Join-Path $packageRoot 'runtime\node.exe') --version).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Node portatil falhou.' }
$client = Join-Path $output 'VoaDeskCliente.exe'
$assembly = [Reflection.Assembly]::ReflectionOnlyLoadFrom($client)
$stream = $assembly.GetManifestResourceStream('VoaDesk.Server')
$reader = New-Object IO.StreamReader($stream)
$endpoint = $reader.ReadToEnd().Trim(); $reader.Dispose()
if ($endpoint -ne 'https://voadesk.onrender.com') { throw 'Endpoint incorreto no cliente.' }
if ([Diagnostics.FileVersionInfo]::GetVersionInfo($client).FileVersion -ne '0.4.1.0') { throw 'Versao incorreta do cliente.' }
$evidence = [ordered]@{ date=[DateTime]::UtcNow.ToString('o'); result='passed'; manifestFiles=$manifest.Count; privateFilesIncluded=$false; operatorCredentialIncluded=$false; nodeVersion=$nodeVersion; clientEndpoint=$endpoint; clientVersion='0.4.1.0'; extractedPackage=$packageRoot; files=@($files | ForEach-Object { [ordered]@{name=$_.Name;size=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()} }) }
$report = Join-Path $projectRoot 'artifacts\production-qa'
New-Item -ItemType Directory -Force -Path $report | Out-Null
$evidence | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $report 'installation.json') -Encoding UTF8
$evidence | ConvertTo-Json -Depth 5
