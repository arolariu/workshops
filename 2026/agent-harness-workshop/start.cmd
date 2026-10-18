@echo off
rem Build Your Agent Harness: start the lab companion on Windows.
rem   start.cmd                      prepare what is missing (privately), then start the lab app
rem   start.cmd --check              only check: never downloads, installs, writes or starts anything
rem   start.cmd --offline            never use the network (uses Node.js 22+ or a verified cached download)
rem   start.cmd --full               also prepare the tools every lab needs
rem   start.cmd -- open lab-01 easy  everything after -- goes to the lab app as-is
rem Nothing is installed globally: missing tools go to a private folder (.workshop\ next to this file, or
rem WORKSHOP_TOOLS_DIR). PATH, execution policy and other installations are not changed. See SETUP.md.
setlocal EnableExtensions DisableDelayedExpansion

rem Reviewed pin: Node.js 24 LTS. Digests copied from https://nodejs.org/dist/v24.22.0/SHASUMS256.txt.
rem Update NODE_VERSION and every digest together (setup-tools.mjs carries the same values; a test compares them).
set "NODE_VERSION=v24.22.0"
set "NODE_SHA256_win_x64=f9683a19877e12a9b167305c8db71040d812876359de21f0d2e97c3f321f80c3"
set "NODE_SHA256_win_arm64=3a5c209a5bc59e65b3bc0fa13ed5e166a26bd3d55332847f498b76b037408d61"

set "HERE=%~dp0"
if "%HERE:~-1%"=="\" set "HERE=%HERE:~0,-1%"
set "TOOLS=%HERE%\.workshop"
if defined WORKSHOP_TOOLS_DIR set "TOOLS=%WORKSHOP_TOOLS_DIR%"
set "CACHE=%TOOLS%\cache"
if defined WORKSHOP_CACHE_DIR set "CACHE=%WORKSHOP_CACHE_DIR%"
set "MIRROR=https://nodejs.org/dist"
if defined WORKSHOP_NODE_MIRROR set "MIRROR=%WORKSHOP_NODE_MIRROR%"

set "CHECK=0"
set "OFFLINE=0"
set "HELP=0"
call :scan %*
if "%HELP%"=="1" goto :usage

set "NODE="
if defined WORKSHOP_NODE goto :explicit_node
for /f "delims=" %%N in ('where node.exe 2^>nul') do call :try_node "%%N"
if defined NODE goto :run

set "ARCH=%PROCESSOR_ARCHITECTURE%"
if defined PROCESSOR_ARCHITEW6432 set "ARCH=%PROCESSOR_ARCHITEW6432%"
set "PLAT="
if /i "%ARCH%"=="AMD64" set "PLAT=win-x64"
if /i "%ARCH%"=="ARM64" set "PLAT=win-arm64"
if not defined PLAT goto :unsupported_arch
ver | findstr /r /c:"Version 1[0-9]\." >nul || goto :unsupported_os
set "NAME=node-%NODE_VERSION%-%PLAT%"
set "FINAL=%TOOLS%\node\%NAME%"
if exist "%FINAL%\node.exe" call :try_node "%FINAL%\node.exe"
if defined NODE goto :run
if "%CHECK%"=="1" goto :check_missing
goto :acquire

:explicit_node
call :try_node "%WORKSHOP_NODE%"
if defined NODE goto :run
echo.
echo   WORKSHOP_NODE=%WORKSHOP_NODE% is not Node.js 22 or newer.
echo.
exit /b 3

:run
"%NODE%" "%HERE%\setup.mjs" %*
exit /b %ERRORLEVEL%

rem ---------- Download (or reuse a verified cached copy of) the pinned official build, privately ----------
:acquire
set "SHA="
if "%PLAT%"=="win-x64" set "SHA=%NODE_SHA256_win_x64%"
if "%PLAT%"=="win-arm64" set "SHA=%NODE_SHA256_win_arm64%"
set "FILE=%NAME%.zip"
set "ARCHIVE=%CACHE%\%FILE%"
where tar.exe >nul 2>&1 || goto :no_tar
where certutil.exe >nul 2>&1 || goto :no_certutil
if not exist "%ARCHIVE%" goto :download
call :sha256 "%ARCHIVE%"
if /i "%HASH%"=="%SHA%" goto :cached
:download
if "%OFFLINE%"=="1" goto :offline_miss
mkdir "%CACHE%" >nul 2>&1
if not exist "%CACHE%\" goto :no_write
set "PART=%ARCHIVE%.%RANDOM%%RANDOM%.part"
echo   Downloading the official Node.js %NODE_VERSION% for %PLAT% ...
call :fetch "%MIRROR%/%NODE_VERSION%/%FILE%" "%PART%"
if errorlevel 1 goto :download_failed
call :sha256 "%PART%"
if /i not "%HASH%"=="%SHA%" goto :hash_mismatch
move /y "%PART%" "%ARCHIVE%" >nul || goto :no_write
goto :unpack
:cached
echo   Using the cached %FILE% (SHA-256 verified).
:unpack
mkdir "%TOOLS%\node" >nul 2>&1
if not exist "%TOOLS%\node\" goto :no_write
set "STAGE=%TOOLS%\node\.staging-%RANDOM%%RANDOM%"
set "LIST=%STAGE%.list"
tar -tf "%ARCHIVE%" > "%LIST%" 2>nul || goto :bad_archive
findstr /v /b /l /c:"%NAME%/" "%LIST%" >nul && goto :bad_archive
findstr /l /c:"/../" /c:"../" /c:"..\\" "%LIST%" >nul && goto :bad_archive
del /q "%LIST%" >nul 2>&1
mkdir "%STAGE%" || goto :no_write
tar -xf "%ARCHIVE%" -C "%STAGE%" || goto :unpack_failed
call :node_ok "%STAGE%\%NAME%\node.exe" || goto :does_not_run
if not exist "%FINAL%\node.exe" move "%STAGE%\%NAME%" "%FINAL%" >nul 2>&1
rmdir /s /q "%STAGE%" >nul 2>&1
if not exist "%FINAL%\node.exe" goto :no_write
set "NODE=%FINAL%\node.exe"
echo   Node.js %NODE_VERSION% is ready in %FINAL%
goto :run

rem ---------- helpers ----------
:scan
if "%~1"=="" exit /b 0
if "%~1"=="--" exit /b 0
if /i "%~1"=="--check" set "CHECK=1"
if /i "%~1"=="--offline" set "OFFLINE=1"
if /i "%~1"=="--help" set "HELP=1"
if /i "%~1"=="-h" set "HELP=1"
if "%~1"=="/?" set "HELP=1"
shift
goto :scan

:try_node
if defined NODE exit /b 0
call :node_ok "%~1" && set "NODE=%~1"
exit /b 0

:node_ok
"%~1" -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)" >nul 2>&1
exit /b %ERRORLEVEL%

:sha256
set "HASH="
for /f "skip=1 delims=" %%H in ('certutil -hashfile "%~1" SHA256 2^>nul') do if not defined HASH set "HASH=%%H"
if defined HASH set "HASH=%HASH: =%"
exit /b 0

:fetch
set "WS_URL=%~1"
set "WS_OUT=%~2"
set "WS_PROTO="
if /i "%WS_URL:~0,8%"=="https://" set "WS_PROTO==https"
if /i "%WS_URL:~0,17%"=="http://127.0.0.1:" set "WS_PROTO==http,https"
if /i "%WS_URL:~0,17%"=="http://localhost:" set "WS_PROTO==http,https"
if not defined WS_PROTO exit /b 1
where curl.exe >nul 2>&1 || goto :fetch_powershell
curl.exe -fsSL --proto "%WS_PROTO%" --proto-redir "%WS_PROTO%" --retry 2 --connect-timeout 20 --max-time 900 --max-filesize 314572800 -o "%WS_OUT%" "%WS_URL%"
exit /b %ERRORLEVEL%
:fetch_powershell
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$ProgressPreference = 'SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri $env:WS_URL -OutFile $env:WS_OUT"
exit /b %ERRORLEVEL%

rem ---------- messages ----------
:usage
echo.
echo   Build Your Agent Harness: workshop launcher for Windows
echo.
echo   start.cmd                      prepare what is missing, then start the lab app
echo   start.cmd --check              only check what is installed; changes nothing
echo   start.cmd --offline            never use the network
echo   start.cmd --full               also prepare the tools of every lab: APM and GitHub CLI
echo   start.cmd --install=apm,gh     prepare these optional tools too
echo   start.cmd -- open lab-01 easy  everything after -- goes to the lab app
echo.
echo   Missing tools go to %TOOLS%
echo   Set WORKSHOP_TOOLS_DIR to use another folder. Nothing is installed globally, and PATH,
echo   execution policy and other installations are not changed. Exit code 3 means a
echo   prerequisite could not be prepared. Details: SETUP.md
echo.
exit /b 0

:check_missing
echo   Node.js 22 or newer was not found.
echo   Without --check this launcher downloads the official Node.js %NODE_VERSION% for %PLAT%
echo   SHA-256 verified, into %TOOLS%\node. Or install Node.js 22+ from https://nodejs.org.
exit /b 3

:unsupported_arch
echo.
echo   There is no official Node.js build for this processor: %ARCH%. Install Node.js 22+ yourself, then run start.cmd again.
echo.
exit /b 3

:unsupported_os
echo.
echo   Node.js %NODE_VERSION% needs Windows 10 or newer. Install Node.js 22+ that supports your Windows, then run start.cmd again.
echo.
exit /b 3

:no_tar
echo.
echo   tar.exe is missing: it ships with Windows 10 version 1803 and newer. Install Node.js 22+ yourself from https://nodejs.org.
echo.
exit /b 3

:no_certutil
echo.
echo   certutil.exe is missing, so the download cannot be verified. Install Node.js 22+ yourself from https://nodejs.org.
echo.
exit /b 3

:offline_miss
echo.
echo   Offline: Node.js 22+ was not found and no verified %FILE% is cached.
echo   Put %FILE% from %MIRROR%/%NODE_VERSION%/ into %CACHE%, or install Node.js 22+, then run start.cmd again.
echo.
exit /b 3

:no_write
echo.
echo   Cannot write to %TOOLS%. Set WORKSHOP_TOOLS_DIR to a folder you can write to.
echo.
exit /b 3

:download_failed
del /q "%PART%" >nul 2>&1
echo.
echo   The download failed: %MIRROR%/%NODE_VERSION%/%FILE%
echo   Check your connection or proxy, or install Node.js 22+ yourself from https://nodejs.org.
echo.
exit /b 3

:hash_mismatch
del /q "%PART%" >nul 2>&1
echo.
echo   The download does not match its pinned SHA-256 checksum, so it was deleted and nothing was run.
echo   Expected %SHA%, got %HASH%.
echo.
exit /b 3

:bad_archive
del /q "%LIST%" >nul 2>&1
echo.
echo   %ARCHIVE% is not a valid Node.js archive or contains unexpected paths, so it was not unpacked.
echo   Delete it and run start.cmd again.
echo.
exit /b 3

:unpack_failed
rmdir /s /q "%STAGE%" >nul 2>&1
echo.
echo   Could not unpack %FILE%.
echo.
exit /b 3

:does_not_run
rmdir /s /q "%STAGE%" >nul 2>&1
echo.
echo   The unpacked Node.js does not run on this system. Install Node.js 22+ yourself from https://nodejs.org.
echo.
exit /b 3
