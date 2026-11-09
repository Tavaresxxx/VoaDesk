param([string]$PairingUrl = 'http://127.0.0.1:47832')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'Compilador C# .NET Framework 4.x não encontrado.' }
New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot 'dist') | Out-Null
$buildCache = Join-Path $projectRoot '.cache\native'
New-Item -ItemType Directory -Force -Path $buildCache | Out-Null
$assetDir = Join-Path $projectRoot 'src\assets'
$sourceLogo = Join-Path $projectRoot 'Logo.png'
if (!(Test-Path -LiteralPath $sourceLogo)) {
  $encodedLogo = Join-Path $projectRoot 'assets\Logo.png.base64'
  if (!(Test-Path -LiteralPath $encodedLogo)) { throw 'Logo.png original nao encontrado.' }
  [IO.File]::WriteAllBytes($sourceLogo,[Convert]::FromBase64String([IO.File]::ReadAllText($encodedLogo)))
}
& $compiler /nologo /target:exe /platform:x64 /optimize+ /reference:System.Drawing.dll ('/out:' + (Join-Path $buildCache 'BrandAssets.exe')) (Join-Path $projectRoot 'native\BrandAssets.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar a identidade visual.' }
& (Join-Path $buildCache 'BrandAssets.exe') $sourceLogo $assetDir
if ($LASTEXITCODE -ne 0) { throw 'Falha ao converter a logo.' }
$uri = [Uri]$PairingUrl
if (!$uri.IsAbsoluteUri -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or (($uri.Scheme -ne 'https') -and !(($uri.Scheme -eq 'http') -and ($uri.Host -in @('127.0.0.1','localhost'))))) { throw 'Endereco do cliente deve usar HTTPS, ou loopback HTTP para testes.' }
$endpointFile = Join-Path $buildCache 'endpoint.txt'
[IO.File]::WriteAllText($endpointFile,$PairingUrl,(New-Object Text.UTF8Encoding($false)))
$icon = '/win32icon:' + (Join-Path $assetDir 'voadesk.ico')
$iconResource = '/resource:' + (Join-Path $assetDir 'voadesk.ico') + ',VoaDesk.Icon'
& $compiler /nologo /target:exe /platform:x64 /optimize+ '/reference:System.Web.Extensions.dll' ('/out:' + (Join-Path $projectRoot 'dist\FarolProbe.exe')) (Join-Path $projectRoot 'native\DisplayProbe.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar consulta de cor.' }
& (Join-Path $PSScriptRoot 'prepare-webview2.ps1')
$webviewRefs = @(('/reference:'+(Join-Path $projectRoot 'dist\Microsoft.Web.WebView2.Core.dll')),('/reference:'+(Join-Path $projectRoot 'dist\Microsoft.Web.WebView2.WinForms.dll')))
& $compiler /nologo /target:winexe /main:Launcher /platform:x64 /optimize+ /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll /reference:System.Security.dll $webviewRefs $icon $iconResource ('/out:' + (Join-Path $projectRoot 'dist\VoaDesk.exe')) (Join-Path $projectRoot 'native\Launcher.cs') (Join-Path $projectRoot 'native\TechnicianWindow.cs') (Join-Path $projectRoot 'native\OperatorSettings.cs') (Join-Path $projectRoot 'native\ProductVersion.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar a janela do tecnico.' }
Copy-Item -LiteralPath (Join-Path $projectRoot 'dist\VoaDesk.exe') -Destination (Join-Path $projectRoot 'dist\VoaDeskTecnico.exe') -Force
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /reference:System.Windows.Forms.dll ('/out:' + (Join-Path $buildCache 'VoaDeskUpdate.exe')) (Join-Path $projectRoot 'native\UpdateWorker.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar atualizador.' }
$captureFiles = [ordered]@{
  'capture.html'='src\video\capture.html'; 'capture.mjs'='src\video\capture.mjs'; 'shared.mjs'='src\video\peer.mjs'
  'quality.mjs'='src\video\quality.mjs'; 'stats.mjs'='src\video\stats.mjs'; 'profiles.mjs'='src\video\profiles.mjs'
  'input-queue.mjs'='src\video\input-queue.mjs'; 'files.mjs'='src\video\files.mjs'; 'theme.css'='src\ui\theme.css'; 'capture.css'='src\video\capture.css'
}
$captureResources = @($captureFiles.GetEnumerator() | ForEach-Object { '/resource:' + (Join-Path $projectRoot $_.Value) + ',VoaDesk.Capture.' + $_.Key })
& $compiler /nologo /target:winexe /main:ClientWindow $captureResources /platform:x64 /optimize+ /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Net.Http.dll /reference:System.Web.Extensions.dll /reference:System.Security.dll $icon $iconResource ('/resource:' + (Join-Path $assetDir 'logo.png') + ',VoaDesk.Logo') ('/resource:' + (Join-Path $assetDir 'symbol.png') + ',VoaDesk.Symbol') ('/resource:' + $endpointFile + ',VoaDesk.Server') ('/resource:' + (Join-Path $projectRoot 'assets\update-public.xml') + ',VoaDesk.UpdateKey') ('/resource:' + (Join-Path $buildCache 'VoaDeskUpdate.exe') + ',VoaDesk.Updater') ('/out:' + (Join-Path $projectRoot 'dist\VoaDeskCliente.exe')) (Join-Path $projectRoot 'native\ClientApp.cs') (Join-Path $projectRoot 'native\RemoteInput.cs') (Join-Path $projectRoot 'native\DesktopBridge.cs') (Join-Path $projectRoot 'native\ClientUpdate.cs') (Join-Path $projectRoot 'native\DisplayProbe.cs') (Join-Path $projectRoot 'native\ProductVersion.cs') (Join-Path $projectRoot 'native\Theme.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o cliente.' }
& $compiler /nologo /target:exe /platform:x64 /optimize+ /reference:System.Web.Extensions.dll /reference:System.Security.dll ('/out:' + (Join-Path $buildCache 'OperatorSettings.exe')) (Join-Path $projectRoot 'native\OperatorSettings.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar configurador protegido.' }
Write-Output 'Gerados VoaDeskTecnico.exe (WinForms/WebView2), VoaDesk.exe, VoaDeskCliente.exe e FarolProbe.exe.'
