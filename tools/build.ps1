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
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll /reference:System.Security.dll $icon ('/out:' + (Join-Path $projectRoot 'dist\VoaDesk.exe')) (Join-Path $projectRoot 'native\Launcher.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar launcher.' }
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /reference:System.Windows.Forms.dll ('/out:' + (Join-Path $buildCache 'VoaDeskUpdate.exe')) (Join-Path $projectRoot 'native\UpdateWorker.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar atualizador.' }
& $compiler /nologo /target:winexe /main:ClientWindow /platform:x64 /optimize+ /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Net.Http.dll /reference:System.Web.Extensions.dll /reference:System.Security.dll $icon $iconResource ('/resource:' + (Join-Path $assetDir 'logo.png') + ',VoaDesk.Logo') ('/resource:' + (Join-Path $assetDir 'symbol.png') + ',VoaDesk.Symbol') ('/resource:' + $endpointFile + ',VoaDesk.Server') ('/resource:' + (Join-Path $projectRoot 'assets\update-public.xml') + ',VoaDesk.UpdateKey') ('/resource:' + (Join-Path $buildCache 'VoaDeskUpdate.exe') + ',VoaDesk.Updater') ('/out:' + (Join-Path $projectRoot 'dist\VoaDeskCliente.exe')) (Join-Path $projectRoot 'native\ClientApp.cs') (Join-Path $projectRoot 'native\RemoteInput.cs') (Join-Path $projectRoot 'native\ClientUpdate.cs') (Join-Path $projectRoot 'native\DisplayProbe.cs') (Join-Path $projectRoot 'native\ProductVersion.cs') (Join-Path $projectRoot 'native\Theme.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o cliente.' }
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /reference:System.Drawing.dll $icon $iconResource ('/out:' + (Join-Path $projectRoot 'dist\VoaDeskWindow.exe')) (Join-Path $projectRoot 'native\WindowBranding.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar identidade da janela.' }
& $compiler /nologo /target:exe /platform:x64 /optimize+ /reference:System.Web.Extensions.dll /reference:System.Security.dll ('/out:' + (Join-Path $buildCache 'OperatorSettings.exe')) (Join-Path $projectRoot 'native\OperatorSettings.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar configurador protegido.' }
Write-Output 'Gerados VoaDesk.exe, VoaDeskCliente.exe, VoaDeskWindow.exe e FarolProbe.exe. Cliente independente de Node.js.'
