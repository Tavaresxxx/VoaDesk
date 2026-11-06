using System;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Threading;
using System.Windows.Forms;
public static class UpdateWorker {
 public static void ReplaceVerifiedFile(string staged,string target,string expectedHash) {
   string hash;using(var sha=SHA256.Create())using(var f=File.OpenRead(staged))hash=BitConverter.ToString(sha.ComputeHash(f)).Replace("-","").ToLowerInvariant();
   if(hash!=expectedHash)throw new Exception("A integridade do arquivo não foi confirmada.");
   File.Replace(staged,target,target+".previous",true);
 }
 [STAThread] public static int Main(string[] a) {
  try {
   if(a.Length!=4)throw new ArgumentException();
   string staged=Path.GetFullPath(a[0]),target=Path.GetFullPath(a[1]);
   if(System.Reflection.AssemblyName.GetAssemblyName(target).Name!="VoaDeskCliente"||!staged.StartsWith(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("Destino inválido.");
   try {var process=Process.GetProcessById(Int32.Parse(a[2]));if(!process.WaitForExit(20000))throw new Exception("Feche o cliente para atualizar.");}catch(ArgumentException){}
   ReplaceVerifiedFile(staged,target,a[3]);
   Process.Start(new ProcessStartInfo(target,"--background"){UseShellExecute=true});return 0;
  } catch {MessageBox.Show("A atualização não foi instalada. O aplicativo anterior foi preservado. Feche-o e tente novamente.","VoaDesk",MessageBoxButtons.OK,MessageBoxIcon.Information);return 1;}
 }
}
