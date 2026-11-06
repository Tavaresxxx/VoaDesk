using System;
using System.Drawing;
using System.Diagnostics;
using System.Linq;
using System.Windows.Forms;
public static class UpdateUiSmoke {
 [System.Runtime.InteropServices.DllImport("user32.dll")]static extern bool SetProcessDpiAwarenessContext(IntPtr context);
 [STAThread]public static int Main(string[] a){try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);var form=new ClientWindow(a[0],a[2]);var timer=new Timer{Interval=200};var elapsed=Stopwatch.StartNew();int exit=1;
 timer.Tick+=delegate{var button=form.Controls.OfType<Button>().FirstOrDefault(b=>b.Text=="Atualizar agora");if(button!=null){timer.Stop();bool hidden=form.Controls.OfType<Label>().First(l=>l.Name=="AccessCode").Visible==false;bool copyHidden=form.Controls.OfType<Button>().First(b=>b.Text=="Copiar código").Visible==false;if(hidden&&copyHidden){using(var bmp=new Bitmap(form.Width,form.Height)){form.DrawToBitmap(bmp,new Rectangle(0,0,bmp.Width,bmp.Height));bmp.Save(a[1],System.Drawing.Imaging.ImageFormat.Png);}exit=0;}form.Close();}else if(elapsed.Elapsed.TotalSeconds>15){timer.Stop();form.Close();}};
 timer.Start();Application.Run(form);timer.Dispose();Console.WriteLine(exit==0?"{\"result\":\"passed\",\"codeHiddenUntilUpdate\":true,\"updateButtonVisible\":true,\"installerExecuted\":false}":"{\"result\":\"failed\"}");return exit;}
}
