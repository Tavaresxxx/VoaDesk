param([string]$PairingUrl = 'http://127.0.0.1:47832')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'build.ps1') -PairingUrl $PairingUrl
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$cache = Join-Path $projectRoot '.cache\native'
& $compiler /nologo /target:exe /platform:x64 /optimize+ /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Net.Http.dll ('/reference:' + (Join-Path $projectRoot 'dist\VoaDeskCliente.exe')) ('/out:' + (Join-Path $cache 'ClientSmoke.exe')) (Join-Path $projectRoot 'native\ClientSmoke.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar teste do cliente.' }
Copy-Item -LiteralPath (Join-Path $projectRoot 'dist\VoaDeskCliente.exe') -Destination (Join-Path $cache 'VoaDeskCliente.exe') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'dist\VoaDesk.exe') -Destination $cache -Force
foreach($dependency in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll')){Copy-Item -LiteralPath (Join-Path $projectRoot ('dist\'+$dependency)) -Destination $cache -Force}
& $compiler /nologo /target:exe /platform:x64 /main:StartupSmoke /reference:System.Windows.Forms.dll /reference:System.Security.dll /reference:System.Web.Extensions.dll ('/reference:' + (Join-Path $projectRoot 'dist\VoaDesk.exe')) ('/out:' + (Join-Path $cache 'StartupSmoke.exe')) (Join-Path $projectRoot 'native\StartupSmoke.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar teste das permissoes de inicializacao.' }

& $compiler /nologo /target:exe /platform:x64 /optimize+ /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Net.Http.dll /reference:System.Web.Extensions.dll ('/reference:' + (Join-Path $projectRoot 'dist\VoaDeskCliente.exe')) ('/reference:' + (Join-Path $cache 'VoaDeskUpdate.exe')) ('/out:' + (Join-Path $cache 'FeatureSmoke.exe')) (Join-Path $projectRoot 'native\FeatureSmoke.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar FeatureSmoke.' }
& $compiler /nologo /target:exe /platform:x64 /optimize+ /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Net.Http.dll /reference:System.Web.Extensions.dll ('/reference:' + (Join-Path $projectRoot 'dist\VoaDeskCliente.exe')) ('/out:' + (Join-Path $cache 'SupportClientSmoke.exe')) (Join-Path $projectRoot 'native\SupportClientSmoke.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar SupportClientSmoke.' }

& $compiler /nologo /target:exe /platform:x64 /reference:System.Windows.Forms.dll /reference:System.Drawing.dll ('/reference:' + (Join-Path $projectRoot 'dist\VoaDeskCliente.exe')) ('/out:' + (Join-Path $cache 'UpdateUiSmoke.exe')) (Join-Path $projectRoot 'native\UpdateUiSmoke.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar UpdateUiSmoke.' }

& $compiler /nologo /target:exe /platform:x64 /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Net.Http.dll /reference:System.Web.Extensions.dll ('/reference:' + (Join-Path $projectRoot 'dist\VoaDeskCliente.exe')) ('/out:' + (Join-Path $cache 'NativeBridgeSmoke.exe')) (Join-Path $projectRoot 'native\NativeBridgeSmoke.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar NativeBridgeSmoke.' }

& $compiler /nologo /target:exe /platform:x64 /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Net.Http.dll /reference:System.Web.Extensions.dll ('/reference:' + (Join-Path $projectRoot 'dist\VoaDeskCliente.exe')) ('/out:' + (Join-Path $cache 'DesktopBridgeFixture.exe')) (Join-Path $projectRoot 'native\DesktopBridgeFixture.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar fixture da ponte nativa.' }

& $compiler /nologo /target:exe /platform:x64 /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll ('/reference:'+(Join-Path $projectRoot 'dist\Microsoft.Web.WebView2.Core.dll')) ('/reference:'+(Join-Path $projectRoot 'dist\Microsoft.Web.WebView2.WinForms.dll')) ('/reference:'+(Join-Path $projectRoot 'dist\VoaDesk.exe')) ('/out:'+(Join-Path $cache 'TechnicianFixture.exe')) (Join-Path $projectRoot 'native\TechnicianFixture.cs')
if($LASTEXITCODE -ne 0){throw 'Falha ao compilar fixture da janela do tecnico.'}
