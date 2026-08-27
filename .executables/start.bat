@echo off
chcp 850 >nul
setlocal
title ePUB-reader - Server

REM change into the project directory (one level above .executables)
cd /d "%~dp0.."

REM the port can be set from outside, otherwise it defaults to 8420
if "%PORT%"=="" set "PORT=8420"
set "URL=http://localhost:%PORT%"

echo   starting ePUB-reader
echo.

REM add def installation folder of nodejs to the path
REM so node can be found directly after installation
set "PATH=%PATH%;%ProgramFiles%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\npm"

REM check, if nodejs available
where node >nul 2>&1
if errorlevel 1 (
    echo Error: Nodejs not found
    echo Please run install.bat first or from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo The browser (Brave, Chrome, Firefox, Vivaldi,..) opens automaticly sooon: %URL%
start /b "" cmd /c "ping -n 3 127.0.0.1 >nul & start %URL%"

echo server is running - to stop it, close THIS window, or press control c (to interup any script in a cmd)
echo.


call npm start

REM if the server gets suddenly interrupdted/closed, keep the window opened
echo.
echo Server got closed
pause
endlocal
