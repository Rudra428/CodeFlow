#define AppName "CodeFlow Local Runner"
#define AppVersion "1.0.0"
#define AppPublisher "CodeFlow"
#define AppExeName "CodeFlowLocalRunner.exe"

[Setup]
AppId={{E49C4C01-35D1-47C5-8870-32C1955DB6B5}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\Programs\CodeFlow Local Runner
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename=CodeFlowLocalRunner-Setup
SetupIconFile=codeflow.ico
UninstallDisplayIcon={app}\{#AppExeName}
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "autostart"; Description: "Start CodeFlow Local Runner when I sign in to Windows"; GroupDescription: "Startup:"; Flags: unchecked
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\CodeFlow Local Runner"; Filename: "{app}\{#AppExeName}"
Name: "{group}\Uninstall CodeFlow Local Runner"; Filename: "{uninstallexe}"
Name: "{autodesktop}\CodeFlow Local Runner"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "CodeFlowLocalRunner"; ValueData: """{app}\{#AppExeName}"""; Tasks: autostart; Flags: uninsdeletevalue

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Launch CodeFlow Local Runner"; Flags: postinstall nowait skipifsilent

[Code]
function InitializeSetup(): Boolean;
begin
  Result := MsgBox(
    'The local runner executes code on this computer with your Windows account permissions. It is not a sandbox. Only continue if you understand this and will run code you trust.',
    mbConfirmation, MB_YESNO) = IDYES;
end;
