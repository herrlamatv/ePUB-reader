@echo off
chcp 850 >nul
setlocal
title ePUB-reader Installer

if /i "%~1"=="__nodesetup" goto :NODE_SETUP

cd /d "%~dp0.."

echo   ePUB-reader Installer
echo.

REM is nodejs alr there
echo [1/4] searching nodejs
call :ADD_NODE_PATH
where node >nul 2>&1
if not errorlevel 1 goto :NODE_FOUND

echo       nodejs not installed
echo.
echo       automaticly installing latest lts-version
echo       windows ll ask soon for admin perms
echo       please accept it with "yes"
echo       else you cannot install it
echo       if it seems suspicious, read the code or
echo       install it seperatly. (Bud, you need npm 2 btw)
echo.
pause

REM restart with admin perms
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Start-Process -FilePath '%~f0' -ArgumentList '__nodesetup' -Verb RunAs -Wait } catch { exit 1 }"

call :ADD_NODE_PATH
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo Error: nodejs could not be installed
    echo look at the error message, maybe restart the script
    echo or install it manually at:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo       nodejs sucessfully installed :)

:NODE_FOUND
for /f "tokens=*" %%v in ('node -v 2^>nul') do echo       Node.js: %%v
echo.

REM npm
echo [2/4] npm?.
where npm >nul 2>&1
if errorlevel 1 (
    echo.
    echo Error: npm not found
    echo Reinstall nodejs cuz npm is
    echo a part of it
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('npm -v 2^>nul') do echo       npm: %%v
echo.

REM install dependencies
echo [3/4] dependencies getting installed
call npm install
if errorlevel 1 (
    echo.
    echo Error while trying to run **npm install**
    echo check your internet connection
    echo (or turn of your proxyyyy)
    echo.
    pause
    exit /b 1
)
echo       sucessfully installed, Happy Reading -lama
echo.

REM Start srv + browser (start.bat)
echo [4/4] Starting...
echo.
call "%~dp0start.bat"
exit /b %errorlevel%


REM Subroutine: append the default Node.js install folders to the search
REM path of this session (needed right after installing, because a running
REM window does not know the newly set system PATH)
:ADD_NODE_PATH
set "PATH=%PATH%;%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\npm"
exit /b 0


REM nodejs installation, own window with admin perms
:NODE_SETUP
title ePUB-reader - nodejs installing...
echo   nodejs lts installing...
echo.
echo This can take up to a few mins (dependent from your internet connection)
echo.

REM 1: winget (from win 10 1809 or win11)
where winget >nul 2>&1
if errorlevel 1 goto :NODE_MSI
echo [winget] OpenJS.NodeJS.LTS installing ...
winget install --exact --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
if exist "%ProgramFiles%\nodejs\node.exe" goto :NODE_SETUP_DONE
echo [winget] Error: searching for the direct way to download.
echo.

REM 2: load msi packet directly from nodejs.org and install
:NODE_MSI
set "NODE_MSI=%TEMP%\epub-reader-node-lts.msi"
if exist "%NODE_MSI%" del "%NODE_MSI%" >nul 2>&1
set "EPUB_READER_MSI=%NODE_MSI%"
echo [Download] Latest LTS-Packet installing from nodejs.org
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $arch = switch ($env:PROCESSOR_ARCHITECTURE) { 'AMD64' { 'x64' } 'ARM64' { 'arm64' } default { 'x86' } }; $idx = Invoke-RestMethod 'https://nodejs.org/dist/index.json'; $ver = $null; foreach ($e in $idx) { if ($e.lts) { $ver = $e.version; break } }; $url = 'https://nodejs.org/dist/' + $ver + '/node-' + $ver + '-' + $arch + '.msi'; Write-Host ('           Version ' + $ver + ' (' + $arch + ')'); Invoke-WebRequest -Uri $url -OutFile $env:EPUB_READER_MSI -UseBasicParsing"
if not exist "%NODE_MSI%" (
    echo.
    echo Error while downloading
	echo check your internet connection or turn off your proxyyy
    echo try installing it directly from https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo [Setup] MSI getting installed ...
msiexec /i "%NODE_MSI%" /qn /norestart
set "MSI_CODE=%errorlevel%"
del "%NODE_MSI%" >nul 2>&1
if not "%MSI_CODE%"=="0" if not "%MSI_CODE%"=="3010" (
    echo.
    echo [Error] The installation got paused due to %MSI_CODE%.
    echo.
    pause
    exit /b 1
)

:NODE_SETUP_DONE
if not exist "%ProgramFiles%\nodejs\node.exe" (
    echo.
    echo [error] node.exe was not found after the installation.
    echo.
    pause
    exit /b 1
)
echo.
echo Node.js is installed. You can close this window.
echo Happy reading, fellow -lama
exit /b 0
