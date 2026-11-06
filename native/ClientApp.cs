using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public sealed class ClientIdentity {
    public string DeviceId, Secret;
    public static ClientIdentity Load(string folder, Uri server) {
        Directory.CreateDirectory(folder);
        string name;
        using(var sha=SHA256.Create()) name=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(server.AbsoluteUri))).Replace("-","").ToLowerInvariant();
        string file=Path.Combine(folder,name+".json");
        var json=new JavaScriptSerializer();
        if(File.Exists(file)) {
            var data=json.Deserialize<Dictionary<string,string>>(File.ReadAllText(file));
            string secret=data.ContainsKey("protectedSecret")?Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(data["protectedSecret"]),null,DataProtectionScope.CurrentUser)):data["secret"];
            if(!Regex.IsMatch(data["deviceId"],"^[a-f0-9]{32}$")||!Regex.IsMatch(secret,"^[A-Za-z0-9_-]{43}$"))throw new InvalidDataException();
            return new ClientIdentity { DeviceId=data["deviceId"], Secret=secret };
        }
        byte[] bytes=new byte[32]; using(var rng=RandomNumberGenerator.Create())rng.GetBytes(bytes);
        var identity=new ClientIdentity { DeviceId=Guid.NewGuid().ToString("N"), Secret=Convert.ToBase64String(bytes).TrimEnd('=').Replace('+','-').Replace('/','_') };
        var payload=new Dictionary<string,string> { {"deviceId",identity.DeviceId} };
        try { payload["protectedSecret"]=Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(identity.Secret),null,DataProtectionScope.CurrentUser)); }
        catch(CryptographicException) { payload["secret"]=identity.Secret; payload["storage"]="windows-user-acl"; }
        var security=new FileSecurity(); security.SetAccessRuleProtection(true,false);
        security.AddAccessRule(new FileSystemAccessRule(WindowsIdentity.GetCurrent().User,FileSystemRights.FullControl,AccessControlType.Allow));
        security.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null),FileSystemRights.FullControl,AccessControlType.Allow));
        using(var output=new FileStream(file,FileMode.CreateNew,FileSystemRights.Write,FileShare.None,4096,FileOptions.None,security))
        using(var writer=new StreamWriter(output,new UTF8Encoding(false)))writer.Write(json.Serialize(payload));
        return identity;
    }
}
public sealed class ClientWindow : Form {
 readonly HttpClient http=new HttpClient(); readonly JavaScriptSerializer json=new JavaScriptSerializer();
 readonly Label code=new VoaCodeLabel(),status=new Label(),connection=new Label(),requester=new Label();readonly Button copy=new VoaButton(),reconnect=new VoaButton(),view=new VoaButton(),control=new VoaButton(),end=new VoaButton(),update=new VoaButton();
 Image watermark;readonly Label codeCaption=new Label(),versionLabel=new Label();
 bool layoutReady;
 readonly CheckBox startup=new CheckBox();readonly Timer timer=new Timer();readonly NotifyIcon tray=new NotifyIcon();readonly RemoteInput input;readonly GuideOverlay overlay=new GuideOverlay(); readonly bool testing; public string LastCaptureTicket {get;private set;} DateTime lastCommand=DateTime.UtcNow; readonly Timer watchdog=new Timer();
 string token,accessCode,sessionId,displayedId,consentSession,localPermission="none";long consentEpoch;int updateTicks;bool busy,closing,allowClose,exitRequested,background,initialized,updateRequired,checkingUpdate,decisionPending;Uri server;ClientIdentity identity;UpdatePackage package;
 readonly Color blue=VoaTheme.Blue,muted=VoaTheme.Muted;
 static Stream Resource(string name){return Assembly.GetExecutingAssembly().GetManifestResourceStream(name);}
 public ClientWindow(string endpoint):this(endpoint,null,false){}
 public ClientWindow(string endpoint,string identityFolder):this(endpoint,identityFolder,false){}
 public ClientWindow(string endpoint,string identityFolder,bool startInBackground,Action<RemoteInput.INPUT> testInputSink=null) {
  testing=identityFolder!=null;input=new RemoteInput(testing?(testInputSink??delegate(RemoteInput.INPUT ignored){}):null);background=startInBackground;Text="VoaDesk · Receber acesso";ClientSize=new Size(VoaTheme.Width,VoaTheme.CompactHeight);StartPosition=FormStartPosition.CenterScreen;FormBorderStyle=FormBorderStyle.FixedSingle;MaximizeBox=false;BackColor=Color.White;ForeColor=VoaTheme.Ink;Font=new Font("Segoe UI",9.5f);AutoScaleDimensions=new SizeF(96,96);AutoScaleMode=AutoScaleMode.Dpi;DoubleBuffered=true;
  using(var r=Resource("VoaDesk.Icon"))Icon=new Icon(r);
  var logo=new PictureBox{Location=new Point(24,24),Size=new Size(162,40),SizeMode=PictureBoxSizeMode.Zoom};using(var r=Resource("VoaDesk.Logo"))using(var img=Image.FromStream(r))logo.Image=new Bitmap(img);Controls.Add(logo);
  using(var r=Resource("VoaDesk.Symbol"))using(var img=Image.FromStream(r))watermark=new Bitmap(img);
  codeCaption.Text="SEU CÓDIGO DE ACESSO";codeCaption.Bounds=new Rectangle(24,104,392,20);codeCaption.ForeColor=muted;codeCaption.Font=new Font("Segoe UI",8,FontStyle.Bold);Controls.Add(codeCaption);
  code.Name="AccessCode";code.SetBounds(24,135,392,48);code.Text="Conferindo serviço…";code.BackColor=VoaTheme.Surface;code.Font=new Font("Consolas",20,FontStyle.Bold);code.TextAlign=ContentAlignment.MiddleCenter;code.Cursor=Cursors.Hand;code.TabIndex=0;Controls.Add(code);
  connection.SetBounds(24,190,392,22);connection.ForeColor=muted;connection.TextAlign=ContentAlignment.MiddleLeft;connection.Font=new Font("Segoe UI",8);Controls.Add(connection);
  Setup(copy,"Copiar código",Rectangle.Empty,true);copy.Visible=false;copy.Enabled=false;copy.Click+=delegate{CopyCode();};code.Click+=delegate{CopyCode();};
  Setup(reconnect,"Reconectar",Rectangle.Empty,false);reconnect.Visible=false;reconnect.Enabled=false;reconnect.Click+=async delegate{await Register();};
  requester.SetBounds(24,326,392,48);requester.Text="Aguardando atendimento";requester.Font=new Font("Segoe UI",10,FontStyle.Bold);requester.TextAlign=ContentAlignment.MiddleLeft;Controls.Add(requester);
  Setup(view,"Permitir visualizar",new Rectangle(24,384,190,40),true);Setup(control,"Permitir controle",new Rectangle(226,384,190,40),false);view.TabIndex=2;control.TabIndex=3;view.Enabled=control.Enabled=false;view.Click+=async delegate{await Decide("view");};control.Click+=async delegate{if(!testing&&Screen.AllScreens.Length!=1){status.Text="Para controlar, utilize um único monitor.";return;}await Decide("control");};
  Setup(end,"Encerrar / recusar atendimento",new Rectangle(24,436,392,34),false);end.TabIndex=4;end.Click+=async delegate{input.Enabled=false;overlay.Hide();await Decide("end");};
  startup.Text="Iniciar com Windows, somente na bandeja";startup.Visible=false;Controls.Add(startup);
  string executable=Assembly.GetExecutingAssembly().Location;
  if(!testing){using(var key=Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run"))startup.Checked=Convert.ToString(key==null?null:key.GetValue("VoaDeskCliente"))=="\""+executable+"\" --background";}
  startup.CheckedChanged+=delegate{if(testing)return;try{using(var key=Microsoft.Win32.Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run")){if(startup.Checked)key.SetValue("VoaDeskCliente","\""+executable+"\" --background");else key.DeleteValue("VoaDeskCliente",false);}status.Text=startup.Checked?"Inicialização ativada para esta conta Windows.":"Inicialização automática desativada.";}catch{status.Text="Não foi possível alterar a inicialização.";}}; 
  Setup(update,"Verificar atualização",new Rectangle(24,225,220,34),false);update.TabIndex=1;update.Click+=async delegate{if(updateRequired)await InstallUpdate();else await CheckUpdate(true);};
  versionLabel.Text="VoaDesk "+UpdatePackage.CurrentVersion;versionLabel.Bounds=new Rectangle(272,232,144,20);versionLabel.TextAlign=ContentAlignment.MiddleRight;versionLabel.ForeColor=muted;versionLabel.Font=new Font("Segoe UI",8);Controls.Add(versionLabel);
  status.SetBounds(24,268,392,30);status.Font=new Font("Segoe UI",8);status.TextAlign=ContentAlignment.MiddleLeft;status.ForeColor=muted;Controls.Add(status);
  ShowSessionControls(false);
  tray.Icon=Icon;tray.Text="VoaDesk · aguardando atendimento";tray.Visible=!testing;
  var menu=new ContextMenuStrip{BackColor=Color.White,ForeColor=VoaTheme.Ink,Font=new Font("Segoe UI",9),Renderer=new VoaMenuRenderer(),ShowImageMargin=false};menu.Items.Add("Mostrar meu código",null,delegate{Reveal();});menu.Items.Add("Reconectar",null,async delegate{await Register();});menu.Items.Add(new ToolStripSeparator());menu.Items.Add("Encerrar atendimento",null,async delegate{input.Enabled=false;await Decide("end");});var startItem=new ToolStripMenuItem(startup.Text){Checked=startup.Checked,CheckOnClick=true};startItem.CheckedChanged+=delegate{startup.Checked=startItem.Checked;};menu.Items.Add(startItem);menu.Items.Add(new ToolStripSeparator());menu.Items.Add("Sair do VoaDesk",null,delegate{exitRequested=true;Close();});tray.ContextMenuStrip=menu;tray.DoubleClick+=delegate{Reveal();};
  http.Timeout=TimeSpan.FromSeconds(5);http.DefaultRequestHeaders.UserAgent.ParseAdd("VoaDeskClient/0.4");
  try{server=ValidateEndpoint(endpoint);identity=ClientIdentity.Load(identityFolder??Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"VoaDesk","client"),server);package=new UpdatePackage(server);}catch{code.Text="Configuração indisponível";status.Text="Sua identidade foi preservada. Contate o suporte.";return;}
  Shown+=async delegate{if(!initialized){initialized=true;await Begin();}};
  watchdog.Interval=100;watchdog.Tick+=delegate{if((DateTime.UtcNow-lastCommand).TotalMilliseconds>1200){input.Enabled=false;if(localPermission=="control"){localPermission="none";consentEpoch++;}}};watchdog.Start();
  timer.Interval=5000;timer.Tick+=async delegate{if(closing||busy)return;if(++updateTicks%60==0)await CheckUpdate(false);if(token==null)await Register();else{try{var state=await Request("v2/clients/status",HttpMethod.Get,token);if(Convert.ToString(state["state"])=="offline")await Register();}catch{input.Enabled=false;connection.Text="Offline · tentando reconectar…";}}};
  FormClosing+=async delegate(object sender,FormClosingEventArgs e){
   input.Enabled=false;overlay.Hide();
   if(allowClose)return;e.Cancel=true;
   if(!testing&&!exitRequested){if(sessionId!=null)await Decide("end");Hide();return;}
   if(closing)return;closing=true;timer.Stop();await Decide("end");await Revoke();allowClose=true;Close();
  };
  FormClosed+=delegate{tray.Visible=false;tray.Dispose();input.Dispose();overlay.Dispose();http.Dispose();timer.Dispose();watchdog.Dispose();logo.Image.Dispose();watermark.Dispose();};
 }
 protected override void SetVisibleCore(bool value){if(background&&!initialized&&IsHandleCreated==false){initialized=true;CreateHandle();BeginInvoke(new Action(async delegate{await Begin();}));base.SetVisibleCore(false);return;}base.SetVisibleCore(value);}
 async Task Begin(){await CheckUpdate(false);await Register();if(!closing){timer.Start();var loop=PollLoop();}}
 void Reveal(){background=false;Show();WindowState=FormWindowState.Normal;Activate();}
 void CopyCode(){if(accessCode==null||updateRequired)return;try{Clipboard.SetText(accessCode);status.Text="Código copiado. Envie ao suporte.";}catch{status.Text="Anote o código acima.";}}
 protected override void OnLoad(EventArgs e){base.OnLoad(e);layoutReady=true;ShowSessionControls(sessionId!=null);}
 void LayoutBounds(Control element,int x,int y,int width,int height){float scale=layoutReady?CurrentAutoScaleDimensions.Width/96f:1f;element.Bounds=Rectangle.Round(new RectangleF(x*scale,y*scale,width*scale,height*scale));}
 void ShowSessionControls(bool visible){requester.Visible=view.Visible=control.Visible=end.Visible=visible;end.Enabled=visible;update.Enabled=!visible&&!checkingUpdate;float scale=layoutReady?CurrentAutoScaleDimensions.Width/96f:1f;var size=new Size((int)(VoaTheme.Width*scale),(int)((visible?VoaTheme.SessionHeight:VoaTheme.CompactHeight)*scale));if(ClientSize!=size)ClientSize=size;Invalidate();}
 protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);float scale=CurrentAutoScaleDimensions.Width/96f;if(watermark!=null)VoaTheme.Watermark(e.Graphics,watermark,new RectangleF(260*scale,-18*scale,210*scale,115*scale));using(var pen=new Pen(VoaTheme.Line)){e.Graphics.DrawLine(pen,24*scale,84*scale,416*scale,84*scale);if(requester.Visible)e.Graphics.DrawLine(pen,24*scale,316*scale,416*scale,316*scale);}}
 void Setup(Button b,string text,Rectangle bounds,bool primary){b.Text=text;b.Bounds=bounds;b.FlatStyle=FlatStyle.Flat;b.FlatAppearance.BorderSize=0;b.BackColor=primary?blue:Color.White;b.ForeColor=primary?Color.White:VoaTheme.Ink;b.Cursor=Cursors.Hand;Controls.Add(b);}
 void AddLabel(string text,Rectangle bounds,Color color,int size,FontStyle style){Controls.Add(new Label{Text=text,Bounds=bounds,ForeColor=color,Font=new Font("Segoe UI",size,style),TextAlign=ContentAlignment.MiddleCenter});}
 public static Uri ValidateEndpoint(string value){Uri uri;if(!Uri.TryCreate(value,UriKind.Absolute,out uri)||!String.IsNullOrEmpty(uri.UserInfo)||!String.IsNullOrEmpty(uri.Query)||!String.IsNullOrEmpty(uri.Fragment)||(uri.Scheme!="https"&&!(uri.Scheme=="http"&&(uri.Host=="127.0.0.1"||uri.Host=="localhost"))))throw new ArgumentException();return new Uri(uri.ToString().TrimEnd('/')+"/");}
 async Task<Dictionary<string,object>> Request(string route,HttpMethod method,string bearer,object payload=null){using(var req=new HttpRequestMessage(method,new Uri(server,route))){if(bearer!=null)req.Headers.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",bearer);if(method==HttpMethod.Post)req.Content=new StringContent(json.Serialize(payload??new{}),Encoding.UTF8,"application/json");using(var res=await http.SendAsync(req)){res.EnsureSuccessStatusCode();return json.Deserialize<Dictionary<string,object>>(await res.Content.ReadAsStringAsync());}}}
 async Task Revoke(){var old=token;token=null;consentEpoch++;decisionPending=false;localPermission="none";input.Enabled=false;if(old!=null)try{await Task.WhenAny(Request("v2/clients/revoke",HttpMethod.Post,old),Task.Delay(1500));}catch{}}
 async Task Register(){if(busy||closing||updateRequired)return;busy=true;reconnect.Enabled=false;try{await Revoke();var r=await Request("v2/clients",HttpMethod.Post,null,new{deviceId=identity.DeviceId,secret=identity.Secret});token=Convert.ToString(r["token"]);accessCode=Convert.ToString(r["code"]);code.Text=accessCode;copy.Enabled=true;connection.Text="Online · informe o código ao suporte";status.Text="Informe este código ao técnico.";}catch{input.Enabled=false;connection.Text=server.Scheme=="https"?"Servidor indisponível · tentando reconectar…":"Abra o VoaDesk principal neste computador.";status.Text="Reconexão automática · sua identidade foi mantida.";}finally{busy=false;reconnect.Enabled=true;}}
 async Task Decide(string permission){
  bool failed=false;long epoch=++consentEpoch;localPermission="none";string decidedSession=sessionId;
  input.Enabled=false;overlay.Hide();if(permission!="end"&&permission!="deny"&&!testing){var color=json.Deserialize<Dictionary<string,object>>(json.Serialize(DisplayProbe.Read()));if(Convert.ToString(color["status"])!="sdr"){status.Text="Captura indisponível: HDR/WCG ou cor não confirmada.";return;}}if(sessionId==null||token==null)return;
  decisionPending=true;
  try{var r=await Request("v3/client/decision",HttpMethod.Post,token,new{id=decidedSession,permission=permission});
   if(epoch!=consentEpoch)return;
   if(permission=="view"||permission=="control"){consentSession=decidedSession;localPermission=permission;}
   view.Enabled=control.Enabled=false;
   if(permission=="end"||permission=="deny"){sessionId=consentSession=null;ShowSessionControls(false);status.Text="Atendimento encerrado.";tray.Text="VoaDesk · aguardando atendimento";return;}
   requester.Text=permission=="control"?"Controle autorizado · selecione sua tela":"Visualização autorizada · selecione sua tela";
   if(r.ContainsKey("ticket")){LastCaptureTicket=Convert.ToString(r["ticket"]);if(testing)return;string url=new Uri(server,"support/bootstrap?ticket="+Convert.ToString(r["ticket"])).AbsoluteUri;string profile=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"VoaDesk","capture-profile");Process.Start(new ProcessStartInfo("msedge.exe","--app=\""+url+"\" --user-data-dir=\""+profile+"\" --disable-features=WebRtcHideLocalIpsWithMdns --disable-extensions --no-first-run --window-size=800,650"){UseShellExecute=true});}
  }catch{failed=true;}finally{if(epoch==consentEpoch)decisionPending=false;}
  if(epoch!=consentEpoch)return;
  if(failed){localPermission="none";input.Enabled=false;if(permission=="end"||permission=="deny"){status.Text="Falha ao encerrar. Tente novamente.";return;}try{await Request("v3/client/decision",HttpMethod.Post,token,new{id=decidedSession,permission="end"});}catch{}status.Text="Não foi possível iniciar. Controle desativado.";}
 }
 async Task PollLoop(){
  while(!closing){
   if(token!=null&&!updateRequired)try{
    long epoch=consentEpoch;string pollToken=token;DateTime pollStart=DateTime.UtcNow;
    var s=await Request("v3/client/commands",HttpMethod.Get,pollToken);if(closing)break;
    if(epoch!=consentEpoch||pollToken!=token||decisionPending){await Task.Delay(40);continue;}
    lastCommand=DateTime.UtcNow;string state=Convert.ToString(s["state"]),permission=Convert.ToString(s["permission"]);
    if(state=="pending"){input.Enabled=false;sessionId=Convert.ToString(s["id"]);ShowSessionControls(true);if(displayedId!=sessionId){displayedId=sessionId;Reveal();tray.ShowBalloonTip(5000,"VoaDesk",Convert.ToString(s["operatorName"])+" solicita atendimento.",ToolTipIcon.Info);}requester.Text=Convert.ToString(s["operatorName"])+" solicita acesso";view.Enabled=control.Enabled=true;control.Enabled=testing||Screen.AllScreens.Length==1;tray.Text="VoaDesk · autorização pendente";}
    else if(state=="approved"||state=="active"){sessionId=Convert.ToString(s["id"]);ShowSessionControls(true);if((DateTime.UtcNow-pollStart).TotalMilliseconds>1200){input.Enabled=false;await Task.Delay(40);continue;}input.Enabled=permission=="control"&&localPermission=="control"&&consentSession==sessionId&&(testing||Screen.AllScreens.Length==1);requester.Text=Convert.ToString(s["operatorName"])+(input.Enabled?" · controle autorizado":" · somente visualização");view.Enabled=permission=="control";control.Enabled=localPermission=="none"&&(testing||Screen.AllScreens.Length==1);tray.Text="VoaDesk · atendimento ativo";var events=s["commands"] as System.Collections.IEnumerable;if(events!=null)foreach(var raw in events){var item=raw as Dictionary<string,object>;if(item==null)continue;if(Convert.ToString(item["type"])=="guide"){if(consentSession==sessionId&&localPermission!="none"&&Screen.AllScreens.Length==1)overlay.PointAt(Convert.ToDouble(item["x"]),Convert.ToDouble(item["y"]));}else input.Apply(item);}}
    else{input.Enabled=false;overlay.Hide();if(sessionId!=null){status.Text="Atendimento encerrado.";sessionId=consentSession=null;localPermission="none";}ShowSessionControls(false);view.Enabled=control.Enabled=false;tray.Text="VoaDesk · aguardando atendimento";}
   }catch{input.Enabled=false;localPermission="none";consentEpoch++;overlay.Hide();connection.Text="Conexão interrompida · controle liberado";}
   await Task.Delay(sessionId==null?500:40);
  }
 }
 async Task CheckUpdate(bool showResult){
  if(checkingUpdate||sessionId!=null)return;checkingUpdate=true;update.Enabled=false;
  try{if(await package.Check(http)){updateRequired=true;input.Enabled=false;await Revoke();code.Visible=copy.Visible=reconnect.Visible=versionLabel.Visible=false;update.Text="Atualizar agora";ShowSessionControls(false);codeCaption.Text="UMA ATUALIZAÇÃO PARA VOCÊ";LayoutBounds(connection,24,135,392,44);connection.Text="Versão "+package.Version+" disponível. Atualize para receber suporte.";LayoutBounds(update,24,196,392,40);update.BackColor=blue;update.ForeColor=Color.White;LayoutBounds(status,24,252,392,44);tray.Text="VoaDesk · atualização necessária";if(showResult)Reveal();}else if(showResult)status.Text="Seu VoaDesk está atualizado.";}
  catch{if(showResult)status.Text="Não foi possível verificar a atualização com segurança.";}
  finally{update.Enabled=true;checkingUpdate=false;}
 }
 async Task InstallUpdate(){if(!updateRequired||sessionId!=null)return;update.Enabled=false;try{await package.Install(http);exitRequested=true;Close();}catch{status.Text="Atualização não instalada. Arquivo atual preservado.";update.Enabled=true;}}
 [DllImport("user32.dll")]static extern bool SetProcessDpiAwarenessContext(IntPtr context);
 [DllImport("shell32.dll")]static extern int SetCurrentProcessExplicitAppUserModelID(string id);
 [STAThread]public static int Main(string[] args){
  try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}SetCurrentProcessExplicitAppUserModelID("VoaDesk.Client");ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  bool acquired;using(var mutex=new System.Threading.Mutex(true,"Local\\VoaDesk.Client",out acquired)){if(!acquired){if(Array.IndexOf(args,"--background")<0)try{System.Threading.EventWaitHandle.OpenExisting("Local\\VoaDesk.Client.Show").Set();}catch{}return 0;}string endpoint;using(var r=new StreamReader(Resource("VoaDesk.Server")))endpoint=r.ReadToEnd().Trim();int serverArg=Array.IndexOf(args,"--server");if(serverArg>=0){if(serverArg+1>=args.Length)return 1;try{endpoint=ValidateEndpoint(args[serverArg+1]).AbsoluteUri;}catch{return 1;}}using(var show=new System.Threading.EventWaitHandle(false,System.Threading.EventResetMode.AutoReset,"Local\\VoaDesk.Client.Show")){var window=new ClientWindow(endpoint,null,Array.IndexOf(args,"--background")>=0);var registration=System.Threading.ThreadPool.RegisterWaitForSingleObject(show,delegate(object state,bool timeout){if(window.IsHandleCreated&&!window.IsDisposed)window.BeginInvoke(new Action(window.Reveal));},null,-1,false);Application.Run(window);registration.Unregister(null);}mutex.ReleaseMutex();}return 0;
 }
}
