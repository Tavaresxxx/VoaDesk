using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public sealed class ClientWindow : Form {
    readonly HttpClient http=new HttpClient(); readonly JavaScriptSerializer json=new JavaScriptSerializer();
    readonly Label code=new Label(), status=new Label(), expiry=new Label(); readonly Button copy=new Button(), renew=new Button();
    readonly Timer timer=new Timer(); readonly Stopwatch lifetime=new Stopwatch();
    string token, accessCode; int ttl; bool busy, closing, allowClose, consumed; Uri server;
    readonly Color blue=Color.FromArgb(0,91,255), muted=Color.FromArgb(106,113,126);
    static Stream Resource(string name) { return Assembly.GetExecutingAssembly().GetManifestResourceStream(name); }
    public ClientWindow(string endpoint) {
        Text="VoaDesk · Receber suporte"; ClientSize=new Size(420,338); StartPosition=FormStartPosition.CenterScreen;
        FormBorderStyle=FormBorderStyle.FixedSingle; MaximizeBox=false; BackColor=Color.White; Font=new Font("Segoe UI",10); AutoScaleMode=AutoScaleMode.Dpi;
        using(var stream=Resource("VoaDesk.Icon")) Icon=new Icon(stream);
        var logo=new PictureBox { Location=new Point(38,25), Size=new Size(344,82), SizeMode=PictureBoxSizeMode.Zoom, BackColor=Color.White };
        using(var stream=Resource("VoaDesk.Logo")) using(var image=Image.FromStream(stream)) logo.Image=new Bitmap(image);
        Controls.Add(logo);
        AddLabel("SEU CÓDIGO DE ACESSO",new Rectangle(20,122,380,20),muted,9,FontStyle.Bold);
        code.SetBounds(12,149,396,45); code.Text="Conectando…"; code.Font=new Font("Consolas",25,FontStyle.Bold); code.TextAlign=ContentAlignment.MiddleCenter; code.ForeColor=Color.FromArgb(13,18,28); Controls.Add(code);
        expiry.SetBounds(20,198,380,20); expiry.Font=new Font("Segoe UI",9); expiry.TextAlign=ContentAlignment.MiddleCenter; expiry.ForeColor=muted; Controls.Add(expiry);
        copy.SetBounds(61,233,180,36); copy.Text="Copiar código"; copy.BackColor=blue; copy.ForeColor=Color.White; copy.FlatStyle=FlatStyle.Flat; copy.FlatAppearance.BorderSize=0; copy.Enabled=false; copy.Cursor=Cursors.Hand;
        copy.Click+=delegate { try { Clipboard.SetText(accessCode); status.Text="Código copiado. Envie ao suporte."; } catch { status.Text="Não foi possível copiar. Selecione o código no painel."; } };
        renew.SetBounds(249,233,110,36); renew.Text="Novo código"; renew.BackColor=Color.FromArgb(241,245,255); renew.ForeColor=blue; renew.FlatStyle=FlatStyle.Flat; renew.FlatAppearance.BorderSize=0; renew.Enabled=false; renew.Cursor=Cursors.Hand;
        renew.Click+=async delegate { await Register(); }; Controls.Add(copy); Controls.Add(renew);
        status.SetBounds(16,280,388,20); status.Font=new Font("Segoe UI",9); status.ForeColor=muted; status.TextAlign=ContentAlignment.MiddleCenter; Controls.Add(status);
        AddLabel("Prévia · o código ainda não inicia acesso remoto",new Rectangle(12,310,396,18),muted,8,FontStyle.Regular);
        var stripe=new Panel { Dock=DockStyle.Bottom, Height=3, BackColor=blue }; Controls.Add(stripe);
        http.Timeout=TimeSpan.FromSeconds(10); http.DefaultRequestHeaders.UserAgent.ParseAdd("VoaDeskClient/0.2");
        try { server=ValidateEndpoint(endpoint); } catch { code.Font=new Font("Segoe UI",16,FontStyle.Bold); code.Text="Servidor não configurado"; status.Text="Solicite ao suporte um arquivo atualizado."; return; }
        Shown+=async delegate { await Register(); timer.Start(); };
        timer.Interval=1000; int ticks=0; timer.Tick+=async delegate {
            if (closing) return;
            if (token!=null) {
                int remaining=Math.Max(0,ttl-(int)lifetime.Elapsed.TotalSeconds); expiry.Text=consumed ? "Código já utilizado" : remaining>0 ? "Válido por " + TimeSpan.FromSeconds(remaining).ToString(@"mm\:ss") : "Código expirado. Gere um novo.";
                if (remaining==0 && !consumed) { copy.Enabled=false; code.Text="EXPIRADO"; }
                if (++ticks%5==0 && !busy) await Poll();
            }
        };
        FormClosing+=async delegate(object sender,FormClosingEventArgs e) {
            if (allowClose) return; e.Cancel=true; if(closing)return; closing=true; timer.Stop(); Enabled=false;
            await Revoke(); allowClose=true; Close();
        };
        FormClosed+=delegate { http.Dispose(); timer.Dispose(); logo.Image.Dispose(); };
    }
    void AddLabel(string text,Rectangle bounds,Color color,int size,FontStyle style) { var label=new Label { Text=text, Bounds=bounds, ForeColor=color, Font=new Font("Segoe UI",size,style), TextAlign=ContentAlignment.MiddleCenter }; Controls.Add(label); }
    public static Uri ValidateEndpoint(string value) {
        Uri uri;
        if(!Uri.TryCreate(value,UriKind.Absolute,out uri) || !String.IsNullOrEmpty(uri.UserInfo) || !String.IsNullOrEmpty(uri.Query) || !String.IsNullOrEmpty(uri.Fragment) || (uri.Scheme!="https" && !(uri.Scheme=="http" && (uri.Host=="127.0.0.1" || uri.Host=="localhost")))) throw new ArgumentException("Invalid server");
        return new Uri(uri.ToString().TrimEnd('/')+"/");
    }
    async Task<Dictionary<string,object>> Request(string path,HttpMethod method,string bearer) {
        using(var request=new HttpRequestMessage(method,new Uri(server,path))) {
            if(bearer!=null) request.Headers.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",bearer);
            if(method==HttpMethod.Post) request.Content=new StringContent("{}",System.Text.Encoding.UTF8,"application/json");
            using(var response=await http.SendAsync(request)) { response.EnsureSuccessStatusCode(); return json.Deserialize<Dictionary<string,object>>(await response.Content.ReadAsStringAsync()); }
        }
    }
    async Task Revoke() { var old=token; token=null; if(old==null)return; try { await Task.WhenAny(Request("v1/clients/revoke",HttpMethod.Post,old),Task.Delay(1500)); } catch { /* Server expiration bounds lifetime if offline. */ } }
    async Task Register() {
        if(busy||closing)return; busy=true; copy.Enabled=renew.Enabled=false; code.Font=new Font("Consolas",25,FontStyle.Bold); code.Text="Conectando…"; expiry.Text=""; status.Text="Gerando seu código com o suporte…";
        try {
            await Revoke(); var result=await Request("v1/clients",HttpMethod.Post,null);
            string nextToken=Convert.ToString(result["token"]);
            if(closing) { try { await Request("v1/clients/revoke",HttpMethod.Post,nextToken); } catch {} return; }
            token=nextToken; accessCode=Convert.ToString(result["code"]); consumed=false; ttl=Convert.ToInt32(result["ttlSeconds"]); lifetime.Restart(); code.Text=accessCode; expiry.Text="Válido por "+TimeSpan.FromSeconds(ttl).ToString(@"mm\:ss"); status.Text="Informe este código ao técnico."; copy.Enabled=true;
        } catch { if(!closing) { code.Font=new Font("Segoe UI",18,FontStyle.Bold); code.Text="Sem conexão"; status.Text="Serviço indisponível. Tente novamente em instantes."; expiry.Text=server.IsLoopback ? "Abra o VoaDesk principal para o teste local." : "O serviço gratuito pode levar cerca de 1 minuto para iniciar."; } }
        finally { busy=false; if(!closing)renew.Enabled=true; }
    }
    async Task Poll() {
        busy=true;
        try { var result=await Request("v1/clients/status",HttpMethod.Get,token); if(closing)return; var state=Convert.ToString(result["state"]);
            if(state=="verified") { consumed=true; copy.Enabled=false; expiry.Text="Código já utilizado"; status.Text="Código reconhecido no painel do técnico."; }
            else if(state=="expired") { consumed=false; ttl=0; copy.Enabled=false; code.Text="EXPIRADO"; status.Text="Solicite um novo código para continuar."; }
        } catch { if(!closing)status.Text="Verificando conexão com o suporte…"; } finally { busy=false; }
    }
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("shell32.dll")] static extern int SetCurrentProcessExplicitAppUserModelID(string id);
    [STAThread] public static int Main(string[] args) {
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch {}
        SetCurrentProcessExplicitAppUserModelID("VoaDesk.Client"); ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        string endpoint;
        using(var reader=new StreamReader(Resource("VoaDesk.Server"))) endpoint=reader.ReadToEnd().Trim();
        Application.Run(new ClientWindow(endpoint)); return 0;
    }
}
