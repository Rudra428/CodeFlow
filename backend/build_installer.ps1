$ErrorActionPreference = "Stop"

$backendDir = $PSScriptRoot
$installerScript = Join-Path $backendDir "installer\CodeFlowLocalRunner.iss"
$iconScript = Join-Path $backendDir "installer\create_icon.py"

Push-Location $backendDir
try {
    py -m pip install -r requirements-installer.txt
    if ($LASTEXITCODE -ne 0) { throw "Failed to install the local runner build requirements." }

    py $iconScript
    if ($LASTEXITCODE -ne 0) { throw "Failed to generate the Windows application icon." }

    py -m PyInstaller `
        --clean `
        --noconfirm `
        --onedir `
        --windowed `
        --name CodeFlowLocalRunner `
        --icon (Join-Path $backendDir "installer\codeflow.ico") `
        --distpath (Join-Path $backendDir "build\dist") `
        --workpath (Join-Path $backendDir "build\work") `
        --specpath (Join-Path $backendDir "build\spec") `
        runner_tray.py
    if ($LASTEXITCODE -ne 0) { throw "Failed to package the local runner executable." }

    $compiler = (Get-Command ISCC.exe -ErrorAction SilentlyContinue).Source
    if (-not $compiler) {
        $knownPaths = @(
            "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
            "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
            "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
        )
        $compiler = $knownPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
    }
    if (-not $compiler) {
        throw "Inno Setup 6 was not found. Install it, then run this build script again."
    }

    $packageDir = Join-Path $backendDir "build\dist\CodeFlowLocalRunner"
    $releaseDir = Join-Path $backendDir "build\release"
    New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null

    & $compiler "/DSourceDir=$packageDir" "/DOutputDir=$releaseDir" $installerScript
    if ($LASTEXITCODE -ne 0) { throw "Failed to create the Windows installer." }

    $output = Join-Path $backendDir "build\release\CodeFlowLocalRunner-Setup.exe"
    Write-Output "Installer created: $output"
} finally {
    Pop-Location
}
