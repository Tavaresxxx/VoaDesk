using System;
using System.Diagnostics;
using System.Drawing;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
public static class SupportClientSmoke {
 [STAThread]public static int Main(string[] a){
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  var form=new ClientWindow(a[0],a[2],true);var timer=new Timer{Interval=250};var elapsed=Stopwatch.StartNew();bool running=false;int result=1;
  timer.Tick+=async delegate {
   if(running)return;var code=form.Controls.OfType<Label>().FirstOrDefault(l=>System.Text.RegularExpressions.Regex.IsMatch(l.Text,@"^[A-Z2-9]{4} [A-Z2-9]{4} [A-Z2-9]{4} [A-Z2-9]{4}$"));
   if(code==null){if(elapsed.Elapsed.TotalSeconds>20){timer.Stop();form.Close();}return;}running=true;timer.Stop();
   try{
    if(form.Visible)throw new Exception("Background startup displayed the window.");
    using(var http=new HttpClient()){
     http.DefaultRequestHeaders.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",Environment.GetEnvironmentVariable("VOADESK_TEST_OPERATOR_TOKEN"));
     var response=await http.PostAsync(new Uri(new Uri(a[0]),"v3/operator/request"),new StringContent("{\"code\":\""+code.Text+"\"}",Encoding.UTF8,"application/json"));response.EnsureSuccessStatusCode();
     var deadline=Stopwatch.StartNew();while(!form.Controls.OfType<Button>().Any(b=>b.Text=="Permitir visualizar"&&b.Enabled)&&deadline.Elapsed.TotalSeconds<6)await Task.Delay(100);
     if(!form.Visible||!form.Controls.OfType<Label>().Any(l=>l.Text.Contains("Técnico de teste local")))throw new Exception("Consent request not shown.");
     form.Controls.OfType<Button>().First(b=>b.Text=="Permitir visualizar").PerformClick();
     deadline.Restart();while(form.LastCaptureTicket==null&&deadline.Elapsed.TotalSeconds<6)await Task.Delay(100);if(form.LastCaptureTicket==null)throw new Exception("No capture ticket.");
     code.Text="XXXX XXXX XXXX XXXX";
     using(var bitmap=new Bitmap(form.Width,form.Height)){form.DrawToBitmap(bitmap,new Rectangle(0,0,bitmap.Width,bitmap.Height));bitmap.Save(a[1],System.Drawing.Imaging.ImageFormat.Png);}
     form.Controls.OfType<Button>().First(b=>b.Text=="Encerrar / recusar atendimento").PerformClick();
     await Task.Delay(500);if(form.ClientSize.Height>250||form.Controls.OfType<Button>().Any(b=>b.Visible&&b.Text.Contains("Permitir")))throw new Exception("Client did not return to compact mode.");
     var request=new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string,object>>(await response.Content.ReadAsStringAsync());
     http.DefaultRequestHeaders.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",Convert.ToString(request["token"]));
     var ended=await http.PostAsync(new Uri(new Uri(a[0]),"v3/operator/state"),new StringContent("{}",Encoding.UTF8,"application/json"));
     var final=new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string,object>>(await ended.Content.ReadAsStringAsync());if(Convert.ToString(final["state"])!="ended"||Convert.ToString(final["permission"])!="none")throw new Exception("End not confirmed by server.");result=0;
    }
   }catch(Exception e){Console.WriteLine("{\"error\":\""+e.GetType().Name+"\"}");}
   form.Close();
  };
  timer.Start();Application.Run(form);timer.Dispose();if(result==0)Console.WriteLine("{\"result\":\"passed\",\"backgroundWindowHidden\":true,\"requestRevealedWindow\":true,\"technicianNamed\":true,\"explicitViewConsent\":true,\"endButtonUsed\":true,\"osInputInjected\":false}");return result;
 }
}
