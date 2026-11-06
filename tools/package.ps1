param([string]$PairingUrl='http://127.0.0.1:47832',[switch]$SkipBuild)
$ErrorActionPreference='Stop'
# One reviewed runtime-only distribution; legacy developer bundles no longer copy local evidence or data.
& (Join-Path $PSScriptRoot 'package-installation.ps1') -PairingUrl $PairingUrl
