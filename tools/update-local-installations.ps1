param([string]$PairingUrl = 'https://voadesk.onrender.com')
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$outputRoot = Join-Path $projectRoot ('instala'+[char]0xE7+[char]0xE3+'o')
$backupRoot = Join-Path $projectRoot ('.cache\local-update-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))

function Assert-Within([string]$candidate,[string]$parent) {
  $resolved = [IO.Path]::GetFullPath($candidate)
  if (!$resolved.StartsWith([IO.Path]::GetFullPath($parent)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Caminho fora do diretorio esperado.' }
  return $resolved
}

# Only the two existing extracted installations are targeted; private folders
# and unrelated copies are never synchronized or removed.
$installed = @(Get-ChildItem -LiteralPath $outputRoot -Filter VoaDeskTecnico.exe -File -Recurse | ForEach-Object {
  $folder = Assert-Within $_.Directory.FullName $outputRoot
  if (Test-Path -LiteralPath (Join-Path $folder 'package.json')) { $folder }
} | Sort-Object -Unique)
foreach ($folder in $installed) {
  $running = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($folder+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) })
  if ($running) { throw 'Feche a copia instalada do VoaDesk antes da substituicao dos programas.' }
}

& (Join-Path $PSScriptRoot 'package-installation.ps1') -PairingUrl $PairingUrl
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar distribuicao.' }
& (Join-Path $PSScriptRoot 'verify-installation.ps1') | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Falha ao verificar distribuicao.' }
$verification = Get-Content -LiteralPath (Join-Path $projectRoot 'artifacts\installation-local\installation.json') -Raw | ConvertFrom-Json
$source = Assert-Within $verification.extractedPackage (Join-Path $projectRoot '.cache')
$manifest = Get-Content -LiteralPath (Join-Path $source 'manifest-sha256.json') -Raw | ConvertFrom-Json
foreach ($entry in $manifest) {
  if ($entry.path -match '(^|[\\/])\.(runtime|cache|env)([\\/]|$)') { throw 'Arquivo privado inesperado no pacote.' }
  $file = Assert-Within (Join-Path $source $entry.path) $source
  if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw 'Pacote alterado apos verificacao.' }
}

New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
$privateFiles = @()
foreach ($folder in $installed) {
  $privateRoot = Join-Path $folder '.runtime'
  if (Test-Path -LiteralPath $privateRoot) {
    $privateFiles += @(Get-ChildItem -LiteralPath $privateRoot -File -Force | ForEach-Object { [pscustomobject]@{path=$_.FullName;sha=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash} })
  }
}
$privateFiles | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backupRoot 'private-hashes.json') -Encoding UTF8
$index = 0
foreach ($folder in $installed) {
  $previous = Join-Path $backupRoot ('previous-'+(++$index))
  foreach ($entry in $manifest) {
    $destination = Assert-Within (Join-Path $folder $entry.path) $folder
    if (Test-Path -LiteralPath $destination) {
      $backup = Assert-Within (Join-Path $previous $entry.path) $previous
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backup) | Out-Null
      Copy-Item -LiteralPath $destination -Destination $backup -Force
    }
  }
  foreach ($entry in $manifest) {
    $destination = Assert-Within (Join-Path $folder $entry.path) $folder
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item -LiteralPath (Join-Path $source $entry.path) -Destination $destination -Force
  }
  Copy-Item -LiteralPath (Join-Path $source 'manifest-sha256.json') -Destination (Join-Path $folder 'manifest-sha256.json') -Force
  foreach ($entry in $manifest) {
    if ((Get-FileHash -LiteralPath (Join-Path $folder $entry.path) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw 'Copia instalada nao corresponde ao pacote.' }
  }
}
foreach ($entry in $privateFiles) {
  if ((Get-FileHash -LiteralPath $entry.path -Algorithm SHA256).Hash -ne $entry.sha) { throw 'Dados privados alterados durante substituicao.' }
}
$report = [ordered]@{version=(Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version;installations=$installed;filesPerInstallation=$manifest.Count;privateFilesVerified=$privateFiles.Count;privateDataPreserved=$true;backup=$backupRoot;standaloneClient=(Join-Path $outputRoot 'VoaDeskCliente.exe')}
$report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $backupRoot 'applied.json') -Encoding UTF8
$report | ConvertTo-Json -Depth 4
