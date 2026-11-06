$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$version='1.0.4314.35'
$expected='90778DEB1B77E36292828B4B5833C9255C27533F40E0DDD55891AE718944EDC4'
$cache=Join-Path $projectRoot ('.cache\webview2\'+$version)
$package=Join-Path $cache 'sdk.nupkg'
New-Item -ItemType Directory -Force -Path $cache | Out-Null
if(!(Test-Path -LiteralPath $package)){Invoke-WebRequest -UseBasicParsing -Uri ('https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/'+$version+'/microsoft.web.webview2.'+$version+'.nupkg') -OutFile $package}
if((Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash -ne $expected){throw 'Integridade do SDK WebView2 nao confirmada.'}
$sdk=Join-Path $cache 'package'
if(!(Test-Path -LiteralPath $sdk)){Add-Type -AssemblyName System.IO.Compression.FileSystem;[IO.Compression.ZipFile]::ExtractToDirectory($package,$sdk)}
$dest=Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
foreach($entry in @('lib\net462\Microsoft.Web.WebView2.Core.dll','lib\net462\Microsoft.Web.WebView2.WinForms.dll','runtimes\win-x64\native\WebView2Loader.dll')){
 $source=Join-Path $sdk $entry
 $signature=Get-AuthenticodeSignature -LiteralPath $source
 if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation'){throw 'Assinatura Microsoft do WebView2 nao confirmada.'}
 Copy-Item -LiteralPath $source -Destination $dest -Force
}
Copy-Item -LiteralPath (Join-Path $sdk 'LICENSE.txt') -Destination (Join-Path $dest 'WebView2-LICENSE.txt') -Force
Copy-Item -LiteralPath (Join-Path $sdk 'NOTICE.txt') -Destination (Join-Path $dest 'WebView2-NOTICE.txt') -Force
