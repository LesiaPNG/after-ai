// Copyright 2026 Ачкасова Олеся. SPDX-License-Identifier: GPL-3.0-only
using System;
using System.IO;
using System.IO.Compression;
using System.Drawing;
using System.Diagnostics;
using System.Reflection;
using System.Collections.Generic;
using System.Windows.Forms;
using Microsoft.Win32;
[assembly: AssemblyTitle("AI Flow Setup")]
[assembly: AssemblyCompany("Ачкасова Олеся")]
[assembly: AssemblyCopyright("Copyright 2026 Ачкасова Олеся")]
[assembly: AssemblyVersion("0.0.1.0")]
[assembly: AssemblyFileVersion("0.0.1.0")]

class Setup : Form {
 const string Version="0.0.1";
 const string RegistryPath=@"Software\Microsoft\Windows\CurrentVersion\Uninstall\AIFlowAE";
 readonly CheckBox consent=new CheckBox(); readonly Button install=new Button(); readonly Label status=new Label();
 readonly bool uninstall; bool completed;
 static string ExtensionRoot {get{return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),@"Adobe\CEP\extensions\studio.aiflow.ae");}}
 static string ProgramRoot {get{return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),@"Programs\AIFlowAE");}}
 static ZipArchive Payload(){var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("AIFlowPayload");if(stream==null)throw new Exception("PAYLOAD");return new ZipArchive(stream,ZipArchiveMode.Read);}
 static string Destination(string root,string relative){
  if(Path.IsPathRooted(relative)||relative.Contains(":"))throw new Exception("PATH");
  string result=Path.GetFullPath(Path.Combine(root,relative.Replace('/',Path.DirectorySeparatorChar)));
  if(!result.StartsWith(Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("PATH");return result;
 }
 static bool DebugEnabled(){return Convert.ToString(Registry.GetValue(@"HKEY_CURRENT_USER\Software\Adobe\CSXS.11","PlayerDebugMode",""))=="1"&&Convert.ToString(Registry.GetValue(@"HKEY_CURRENT_USER\Software\Adobe\CSXS.12","PlayerDebugMode",""))=="1";}
 Setup(bool removing){
  uninstall=removing;Text="AI Flow · "+Version+" · экспериментальная версия";ClientSize=new Size(580,460);FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;StartPosition=FormStartPosition.CenterScreen;BackColor=Color.FromArgb(247,245,255);Font=new Font("Segoe UI",10);
  Controls.Add(new Label{Text="✦ AI Flow",Font=new Font("Segoe UI",28,FontStyle.Bold),Location=new Point(28,24),AutoSize=true,ForeColor=Color.FromArgb(69,48,120)});
  Controls.Add(new Label{Text="Плагин нейрогенерации для After Effects 2024 / 2026\nВерсия 0.0.1 · эксперимент для своих, ещё не альфа\nАвтор: Ачкасова Олеся",Location=new Point(30,90),Size=new Size(525,85)});
  Controls.Add(new Label{Text=removing?"Будут удалены только файлы AI Flow. Проекты, результаты\nи сохранённый API-ключ останутся на компьютере.":"Установка для текущего пользователя Windows.\nПеред установкой закройте After Effects.\nПосле установки: Window → Extensions → AI Flow.",Location=new Point(30,185),Size=new Size(520,75)});
  consent.Text="Разрешить загрузку неподписанных панелей Adobe";consent.Location=new Point(30,270);consent.Size=new Size(520,30);consent.Checked=DebugEnabled();consent.Visible=!removing;
  Controls.Add(consent);Controls.Add(new Label{Text="Эта настройка разрешает AI Flow и другим неподписанным\nпанелям открываться в AE. Права администратора не нужны.",Location=new Point(50,305),Size=new Size(490,50),Visible=!removing,ForeColor=Color.DimGray});
  var license=new LinkLabel{Text="Свободное ПО · GNU GPLv3 · показать лицензию",Location=new Point(30,362),AutoSize=true};license.LinkClicked+=(s,e)=>{using(var zip=Payload()){var entry=zip.GetEntry("LICENSE");using(var reader=new StreamReader(entry.Open())){var f=new Form{Text="AI Flow · GNU GPLv3",Size=new Size(760,600),StartPosition=FormStartPosition.CenterParent};f.Controls.Add(new TextBox{Multiline=true,ReadOnly=true,ScrollBars=ScrollBars.Vertical,Dock=DockStyle.Fill,Text="Copyright 2026 Ачкасова Олеся\r\n\r\n"+reader.ReadToEnd()});f.ShowDialog(this);}}};Controls.Add(license);
  install.Text=removing?"Удалить AI Flow":"Установить AI Flow";install.Location=new Point(335,397);install.Size=new Size(215,40);install.BackColor=Color.FromArgb(112,83,204);install.ForeColor=Color.White;install.FlatStyle=FlatStyle.Flat;install.Click+=(s,e)=>Run();Controls.Add(install);
  status.Location=new Point(30,395);status.Size=new Size(285,48);status.Font=new Font("Segoe UI",9);Controls.Add(status);
 }
 void Run(){
  if(completed){Close();return;}
  if(Process.GetProcessesByName("AfterFX").Length>0){MessageBox.Show(this,"Сохраните проект и закройте After Effects. Затем снова нажмите кнопку установки.","After Effects открыт",MessageBoxButtons.OK,MessageBoxIcon.Information);return;}
  if(!uninstall&&!consent.Checked){MessageBox.Show(this,"Для экспериментальной неподписанной панели нужно разрешить её загрузку. Отметьте пункт выше.","Разрешение загрузки",MessageBoxButtons.OK,MessageBoxIcon.Information);return;}
  install.Enabled=false;status.Text=uninstall?"Удаление…":"Установка…";Application.DoEvents();
  try{if(uninstall)Remove();else Install();completed=true;status.Text=uninstall?"AI Flow удалён.":"Готово. Можно открыть AE.";install.Text="Закрыть";install.Enabled=true;}
  catch{status.Text="Операция не завершена.";install.Enabled=true;MessageBox.Show(this,"Не удалось обновить файлы. Предыдущая версия сохранена. Проверьте, что After Effects закрыт и папка расширений доступна.","AI Flow",MessageBoxButtons.OK,MessageBoxIcon.Error);}
 }
 void Install(){
  string root=Path.GetFullPath(ExtensionRoot),backup=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),@"AIFlowAE\extension-backups",DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fff"));
  var changed=new List<string>();var existed=new HashSet<string>();
  using(var zip=Payload()){
   try{
    foreach(var entry in zip.Entries){if(entry.FullName.EndsWith("/"))continue;string target=Destination(root,entry.FullName),saved=Destination(backup,entry.FullName);Directory.CreateDirectory(Path.GetDirectoryName(target));
     if(File.Exists(target)){Directory.CreateDirectory(Path.GetDirectoryName(saved));File.Copy(target,saved,false);existed.Add(entry.FullName);}changed.Add(entry.FullName);
     using(var input=entry.Open())using(var output=new FileStream(target,FileMode.Create,FileAccess.Write,FileShare.None))input.CopyTo(output);
    }
   }catch{foreach(string rel in changed){string target=Destination(root,rel);if(existed.Contains(rel))File.Copy(Destination(backup,rel),target,true);else if(File.Exists(target))File.Delete(target);}throw;}
  }
  Registry.SetValue(@"HKEY_CURRENT_USER\Software\Adobe\CSXS.11","PlayerDebugMode","1",RegistryValueKind.String);
  Registry.SetValue(@"HKEY_CURRENT_USER\Software\Adobe\CSXS.12","PlayerDebugMode","1",RegistryValueKind.String);
  Directory.CreateDirectory(ProgramRoot);string uninstaller=Path.Combine(ProgramRoot,"Uninstall.exe");File.Copy(Application.ExecutablePath,uninstaller,true);
  using(var key=Registry.CurrentUser.CreateSubKey(RegistryPath)){key.SetValue("DisplayName","AI Flow (экспериментальная версия)");key.SetValue("DisplayVersion",Version);key.SetValue("Publisher","Ачкасова Олеся");key.SetValue("UninstallString","\""+uninstaller+"\" --uninstall");key.SetValue("InstallLocation",root);key.SetValue("NoModify",1);key.SetValue("NoRepair",1);}
 }
 void Remove(){using(var zip=Payload()){foreach(var entry in zip.Entries){if(entry.FullName.EndsWith("/"))continue;string target=Destination(ExtensionRoot,entry.FullName);if(File.Exists(target))File.Delete(target);}}Registry.CurrentUser.DeleteSubKeyTree(RegistryPath,false);}
 [STAThread]static void Main(string[] args){
  if(args.Length==2&&args[0]=="--verify-payload"){
   int count=0;bool manifest=false,license=false,key=false;using(var zip=Payload()){foreach(var e in zip.Entries){if(e.FullName.EndsWith("/"))continue;Destination(Path.GetTempPath(),e.FullName);string name=e.FullName.Replace('\\','/');count++;if(name=="CSXS/manifest.xml")manifest=true;if(name=="LICENSE")license=true;if(name=="update-public-key.pem")key=true;}}
   bool ok=manifest&&license&&key;File.WriteAllText(args[1],"{\"ok\":"+(ok?"true":"false")+",\"version\":\""+Version+"\",\"files\":"+count+"}");Environment.ExitCode=ok?0:1;return;
  }
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new Setup(Array.IndexOf(args,"--uninstall")>=0));
 }
}
