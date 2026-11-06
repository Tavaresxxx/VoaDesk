using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

// The WebView has no host objects, generic native proxy, remote navigation, or debugging port.
public sealed class TechnicianWindow : Form {
 public readonly WebView2 Browser=new WebView2();
 readonly string root,dataDir;readonly bool online;readonly Action<ProcessStartInfo> configure;
 readonly Label status=new Label{Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleCenter,Text="Preparando o VoaDesk…",ForeColor=Color.FromArgb(45,55,75)};
 readonly LinkLabel runtimeLink=new LinkLabel{Text="Instalar Microsoft Edge WebView2 Runtime",Dock=DockStyle.Bottom,Height=42,TextAlign=ContentAlignment.MiddleCenter,Visible=false};
 readonly JavaScriptSerializer json=new JavaScriptSerializer();
 Process host;Task stopping;bool closing,allowClose,full;Rectangle previousBounds;FormWindowState previousState;
 public string HostExecutable{get{return host==null?null:host.StartInfo.FileName;}}public bool HostRunning{get{try{return host!=null&&!host.HasExited;}catch{return false;}}}public long HostWindowHandle{get{return HostRunning?host.MainWindowHandle.ToInt64():0L;}}public string StatusText{get{return status.Text;}}public string HostOrigin{get;private set;}public string PairingOrigin{get;private set;}public bool Ready{get;private set;}public int HostProcessId{get{return host==null?0:host.Id;}}
 public TechnicianWindow(string root,bool online,string dataDir=null,Action<ProcessStartInfo> configure=null){
  this.root=Path.GetFullPath(root);this.online=online;this.dataDir=dataDir??Path.Combine(this.root,".runtime");this.configure=configure;
  Text="VoaDesk Técnico";StartPosition=FormStartPosition.CenterScreen;MinimumSize=new Size(760,560);ClientSize=new Size(1380,900);AutoScaleMode=AutoScaleMode.Dpi;AutoScaleDimensions=new SizeF(96,96);BackColor=Color.White;Font=new Font("Segoe UI",10);
  using(var icon=typeof(TechnicianWindow).Assembly.GetManifestResourceStream("VoaDesk.Icon"))if(icon!=null)Icon=new Icon(icon);
  Browser.Dock=DockStyle.Fill;Browser.Visible=false;Browser.AllowExternalDrop=false;Controls.Add(Browser);Controls.Add(status);Controls.Add(runtimeLink);
  runtimeLink.LinkClicked+=delegate{Process.Start(new ProcessStartInfo("https://developer.microsoft.com/microsoft-edge/webview2/#download-section"){UseShellExecute=true});};
  Shown+=async delegate{await Start();};FormClosing+=ClosingWindow;
 }
 public void Reveal(){if(IsDisposed)return;Show();if(WindowState==FormWindowState.Minimized)WindowState=FormWindowState.Normal;Activate();}
 public static bool IsLocalOrigin(string value){Uri uri;return Uri.TryCreate(value,UriKind.Absolute,out uri)&&uri.Scheme=="http"&&uri.Host=="127.0.0.1"&&String.IsNullOrEmpty(uri.UserInfo)&&uri.AbsolutePath=="/"&&String.IsNullOrEmpty(uri.Query)&&String.IsNullOrEmpty(uri.Fragment);}
 bool Trusted(string value){Uri uri;return HostOrigin!=null&&Uri.TryCreate(value,UriKind.Absolute,out uri)&&uri.GetLeftPart(UriPartial.Authority)==HostOrigin;}
 async Task Start(){
  bool failed=false;try{
   try{CoreWebView2Environment.GetAvailableBrowserVersionString();}catch(WebView2RuntimeNotFoundException){runtimeLink.Visible=true;throw new InvalidOperationException("O Microsoft Edge WebView2 Runtime não está instalado. Use o link abaixo e reabra o VoaDesk. Não é necessário instalar Node.js.");}
   string server=Path.Combine(root,"src","host","server.mjs");if(!File.Exists(server))throw new InvalidOperationException("Extraia a pasta completa do VoaDesk Técnico. Os arquivos de src precisam acompanhar o aplicativo.");
   string node=Path.Combine(root,"runtime","node.exe");if(!File.Exists(node))node=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"nodejs","node.exe");if(!File.Exists(node))throw new InvalidOperationException("Node.js portátil não encontrado. Extraia novamente o pacote completo do VoaDesk Técnico; não é necessário instalar ferramentas de desenvolvimento.");
   var start=new ProcessStartInfo(node,"\""+server+"\" --native-shell"+(online?" --online":"")){WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};
   start.EnvironmentVariables.Remove("VOADESK_PAIRING_URL");start.EnvironmentVariables.Remove("VOADESK_OPERATOR_TOKEN");start.EnvironmentVariables.Remove("VOADESK_TEST_DATA_DIR");start.EnvironmentVariables.Remove("VOADESK_LOCAL_PAIRING_PORT");start.EnvironmentVariables["VOADESK_MODE"]="desktop";
   if(online){string settings=Path.Combine(root,".runtime","operator-settings.json"),user=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"VoaDesk","operator-settings.json");if(!File.Exists(settings))settings=user;if(!File.Exists(settings))throw new InvalidOperationException("Este técnico ainda não está configurado nesta conta Windows. Solicite o provisionamento autorizado da credencial do operador.");var values=json.Deserialize<System.Collections.Generic.Dictionary<string,string>>(File.ReadAllText(settings));start.EnvironmentVariables["VOADESK_PAIRING_URL"]=values["server"];start.EnvironmentVariables["VOADESK_OPERATOR_TOKEN"]=OperatorSettings.ReadToken(settings);}
   if(configure!=null)configure(start);
   var ready=new TaskCompletionSource<System.Collections.Generic.Dictionary<string,object>>();
   host=new Process{StartInfo=start,EnableRaisingEvents=true};host.OutputDataReceived+=delegate(object sender,DataReceivedEventArgs e){if(e.Data==null||e.Data.Length>4096)return;try{var message=json.Deserialize<System.Collections.Generic.Dictionary<string,object>>(e.Data);if(message.ContainsKey("type")&&Convert.ToString(message["type"])=="ready")ready.TrySetResult(message);}catch{ready.TrySetException(new InvalidOperationException("Resposta inválida do componente local."));}};
   host.ErrorDataReceived+=delegate{};host.Exited+=delegate{ready.TrySetException(new InvalidOperationException("O componente local não iniciou. Confira o pacote e se a porta local 47832 já está em uso. Nenhum processo externo foi encerrado."));if(Ready&&!closing&&!IsDisposed)BeginInvoke(new Action(delegate{Ready=false;Browser.Visible=false;status.Visible=true;status.Text="O componente local foi interrompido. Feche e reabra o VoaDesk para solicitar uma nova autorização.";}));};
   host.Start();host.BeginOutputReadLine();host.BeginErrorReadLine();
   if(await Task.WhenAny(ready.Task,Task.Delay(20000))!=ready.Task)throw new InvalidOperationException("O componente local demorou para iniciar. Feche e reabra o aplicativo.");
   var handshake=await ready.Task;if(closing)return;HostOrigin=Convert.ToString(handshake["origin"]);PairingOrigin=Convert.ToString(handshake["pairingOrigin"]);string cookie=Convert.ToString(handshake["cookie"]);if(!IsLocalOrigin(HostOrigin)||!System.Text.RegularExpressions.Regex.IsMatch(cookie,"^[A-Za-z0-9_-]{43}$"))throw new InvalidOperationException("Inicialização local inválida.");
   var options=new CoreWebView2EnvironmentOptions("--disable-features=WebRtcHideLocalIpsWithMdns");
   var environment=await CoreWebView2Environment.CreateAsync(null,Path.Combine(dataDir,"voadesk-webview2-profile"),options);if(closing)return;await Browser.EnsureCoreWebView2Async(environment);if(closing)return;
   var core=Browser.CoreWebView2;var settingsView=core.Settings;settingsView.AreHostObjectsAllowed=false;settingsView.IsWebMessageEnabled=false;settingsView.AreDefaultContextMenusEnabled=false;settingsView.AreDevToolsEnabled=false;settingsView.AreBrowserAcceleratorKeysEnabled=false;settingsView.AreDefaultScriptDialogsEnabled=false;settingsView.IsStatusBarEnabled=false;settingsView.IsPasswordAutosaveEnabled=false;settingsView.IsGeneralAutofillEnabled=false;
   core.NavigationStarting+=delegate(object sender,CoreWebView2NavigationStartingEventArgs e){if(!Trusted(e.Uri))e.Cancel=true;};core.FrameNavigationStarting+=delegate(object sender,CoreWebView2NavigationStartingEventArgs e){if(!Trusted(e.Uri))e.Cancel=true;};core.NewWindowRequested+=delegate(object sender,CoreWebView2NewWindowRequestedEventArgs e){e.Handled=true;};
   core.PermissionRequested+=delegate(object sender,CoreWebView2PermissionRequestedEventArgs e){if(!Trusted(e.Uri)||e.PermissionKind!=CoreWebView2PermissionKind.FileReadWrite)e.State=CoreWebView2PermissionState.Deny;};
   core.ContainsFullScreenElementChanged+=delegate{SetFullScreen(core.ContainsFullScreenElement);};
   core.ProcessFailed+=delegate{if(!closing){Ready=false;Browser.Visible=false;status.Visible=true;status.Text="A janela de atendimento foi interrompida. Feche e reabra o VoaDesk; uma nova conexão exige autorização.";var stop=StopHost();}};
   core.DownloadStarting+=async delegate(object sender,CoreWebView2DownloadStartingEventArgs e){var deferral=e.GetDeferral();e.Handled=true;try{await Task.Yield();if(closing||!Trusted(core.Source)){e.Cancel=true;return;}using(var dialog=new SaveFileDialog{FileName=Path.GetFileName(e.ResultFilePath),Title="Salvar arquivo do VoaDesk",OverwritePrompt=true}){if(dialog.ShowDialog(this)==DialogResult.OK)e.ResultFilePath=dialog.FileName;else e.Cancel=true;}}finally{deferral.Complete();}};
   var auth=core.CookieManager.CreateCookie("farol",cookie,"127.0.0.1","/");auth.IsHttpOnly=true;auth.SameSite=CoreWebView2CookieSameSiteKind.Strict;core.CookieManager.AddOrUpdateCookie(auth);
   core.NavigationCompleted+=delegate(object sender,CoreWebView2NavigationCompletedEventArgs e){if(closing)return;if(e.IsSuccess){Ready=true;status.Visible=false;Browser.Visible=true;Browser.Focus();}else{status.Text="Não foi possível abrir a interface local. Feche e reabra o VoaDesk.";}};
   core.Navigate(HostOrigin+"/");
  }catch(Exception e){failed=true;if(!closing){status.Text=Launcher.DescribeError(e);status.Visible=true;Browser.Visible=false;}}if(failed)await StopHost();
 }
 public void SetFullScreen(bool value){if(full==value||closing)return;full=value;if(value){previousBounds=Bounds;previousState=WindowState;WindowState=FormWindowState.Normal;FormBorderStyle=FormBorderStyle.None;Bounds=Screen.FromControl(this).Bounds;}else{FormBorderStyle=FormBorderStyle.Sizable;WindowState=FormWindowState.Normal;Bounds=previousBounds;WindowState=previousState;}}
 public Task StopHost(){Ready=false;if(stopping!=null)return stopping;stopping=StopOwnedProcess();return stopping;}
 async Task StopOwnedProcess(){var process=host;if(process==null)return;try{if(!process.HasExited){try{process.StandardInput.WriteLine("shutdown");process.StandardInput.Flush();process.StandardInput.Close();}catch{}bool exited=await Task.Run(()=>process.WaitForExit(12000));if(!exited)process.Kill();}}catch(InvalidOperationException){} }
 async void ClosingWindow(object sender,FormClosingEventArgs e){if(allowClose)return;e.Cancel=true;if(closing)return;closing=true;Ready=false;try{if(Browser.CoreWebView2!=null&&Trusted(Browser.CoreWebView2.Source)){await Browser.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new Event('voadesk:closing'))");await Task.Delay(150);}}catch{}status.Text="Encerrando o atendimento e os componentes locais…";status.Visible=true;await StopHost();Browser.Dispose();allowClose=true;Close();}
 protected override void Dispose(bool disposing){if(disposing&&host!=null){host.Dispose();host=null;}base.Dispose(disposing);}
}
