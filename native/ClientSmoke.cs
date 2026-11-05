using System;
using System.Diagnostics;
using System.Drawing;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;
public static class ClientSmoke {
    [STAThread] public static int Main(string[] args) {
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        var form=new ClientWindow(args[0]); var timer=new Timer { Interval=200 }; var elapsed=Stopwatch.StartNew(); bool running=false; int exit=1;
        timer.Tick+=async delegate {
            if(running)return;
            var label=form.Controls.OfType<Label>().FirstOrDefault(l=>Regex.IsMatch(l.Text,@"^[A-Z2-9]{4} [A-Z2-9]{4} [A-Z2-9]{4}$"));
            if(label==null) { if(elapsed.Elapsed.TotalSeconds>20) { timer.Stop(); form.Close(); } return; }
            running=true; timer.Stop(); string value=label.Text;
            try {
                bool icon=form.Icon!=null, logo=form.Controls.OfType<PictureBox>().Any(p=>p.Image!=null), compact=form.ClientSize.Width<=700 && form.ClientSize.Height<=600;
                // Evidence image contains a placeholder, never the active access code.
                label.Text="XXXX XXXX XXXX";
                using(var bitmap=new Bitmap(form.Width,form.Height)) { form.DrawToBitmap(bitmap,new Rectangle(0,0,bitmap.Width,bitmap.Height)); bitmap.Save(args[1],System.Drawing.Imaging.ImageFormat.Png); }
                label.Text=value;
                using(var client=new HttpClient()) {
                    client.DefaultRequestHeaders.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",Environment.GetEnvironmentVariable("VOADESK_TEST_OPERATOR_TOKEN"));
                    var response=await client.PostAsync(new Uri(new Uri(args[0]),"v1/codes/verify"),new StringContent("{\"code\":\""+value+"\"}",Encoding.UTF8,"application/json"));
                    if(!response.IsSuccessStatusCode)throw new Exception("verify failed");
                }
                Console.WriteLine("{\"codeDisplayed\":true,\"verifiedByService\":true,\"logoEmbedded\":"+logo.ToString().ToLower()+",\"iconEmbedded\":"+icon.ToString().ToLower()+",\"compact\":"+compact.ToString().ToLower()+",\"codeRedactedInScreenshot\":true}");
                exit=icon&&logo&&compact?0:1;
            } catch { Console.WriteLine("{\"result\":\"failed\"}"); }
            form.Close();
        };
        timer.Start(); Application.Run(form); timer.Dispose(); return exit;
    }
}
