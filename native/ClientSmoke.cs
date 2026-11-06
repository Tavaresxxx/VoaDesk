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
    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [STAThread] public static int Main(string[] args) {
        try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        string previous=null; bool all=true;
        for(int attempt=0;attempt<2;attempt++) {
            var form=new ClientWindow(args[0],args[2]); var timer=new Timer { Interval=200 }; var elapsed=Stopwatch.StartNew(); bool running=false, passed=false;
            timer.Tick+=async delegate {
                if(running)return;
                var label=form.Controls.OfType<Label>().FirstOrDefault(l=>Regex.IsMatch(l.Text,@"^[A-Z2-9]{4} [A-Z2-9]{4} [A-Z2-9]{4} [A-Z2-9]{4}$"));
                if(label==null) { if(elapsed.Elapsed.TotalSeconds>20) { timer.Stop(); form.Close(); } return; }
                running=true; timer.Stop(); string value=label.Text;
                try {
                    if(previous!=null&&value!=previous)throw new Exception();
                    float scale=form.CurrentAutoScaleDimensions.Width/96f;
                    bool icon=form.Icon!=null, logo=form.Controls.OfType<PictureBox>().Any(p=>p.Image!=null), compact=form.ClientSize.Width<=440*scale+1&&form.ClientSize.Height<=308*scale+1&&form.Controls.OfType<Button>().Count(b=>b.Visible)==1&&label.TabStop&&label.AccessibleRole==AccessibleRole.PushButton&&form.Controls.Cast<Control>().Where(c=>c.Visible).All(c=>c.Right<=form.ClientSize.Width&&c.Bottom<=form.ClientSize.Height);
                    label.Text="XXXX XXXX XXXX XXXX";
                    using(var bitmap=new Bitmap(form.Width,form.Height)) { form.DrawToBitmap(bitmap,new Rectangle(0,0,bitmap.Width,bitmap.Height)); bitmap.Save(args[1],System.Drawing.Imaging.ImageFormat.Png); }
                    label.Text=value;
                    using(var client=new HttpClient()) {
                        client.DefaultRequestHeaders.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",Environment.GetEnvironmentVariable("VOADESK_TEST_OPERATOR_TOKEN"));
                        for(int i=0;i<2;i++) {
                            var response=await client.PostAsync(new Uri(new Uri(args[0]),"v2/codes/verify"),new StringContent("{\"code\":\""+value+"\"}",Encoding.UTF8,"application/json"));
                            if(!response.IsSuccessStatusCode)throw new Exception();
                        }
                    }
                    if(label.Text!=value)throw new Exception();
                    previous=value; passed=icon&&logo&&compact;
                } catch { passed=false; }
                form.Close();
            };
            timer.Start(); Application.Run(form); timer.Dispose(); all=all&&passed;
        }
        Console.WriteLine(all?"{\"result\":\"passed\",\"codeDisplayed\":true,\"verifiedByService\":true,\"sameCodeAfterReopen\":true,\"repeatIdentification\":true,\"logoEmbedded\":true,\"iconEmbedded\":true,\"compact\":true,\"codeRedactedInScreenshot\":true}":"{\"result\":\"failed\"}");
        return all?0:1;
    }
}
