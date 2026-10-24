@echo off
setlocal
set ARCH=%1
if "%ARCH%"=="" set ARCH=x64

for %%P in (
  "%ProgramFiles%\Microsoft Visual Studio\2022\Enterprise\Common7\Tools\VsDevCmd.bat"
  "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\Enterprise\Common7\Tools\VsDevCmd.bat"
  "%ProgramFiles%\Microsoft Visual Studio\2022\Professional\Common7\Tools\VsDevCmd.bat"
  "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\Professional\Common7\Tools\VsDevCmd.bat"
  "%ProgramFiles%\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat"
  "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat"
  "%ProgramFiles%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
  "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
) do (
  if exist %%P (
    call %%P
    goto :found_vs
  )
)
:found_vs

cd /d "%~dp0..\src\native\snap-overlay"
call npx --yes node-gyp rebuild --target=33.3.2 --arch=%ARCH% --dist-url=https://electronjs.org/headers
if errorlevel 1 exit /b %errorlevel%

if not exist "%~dp0..\build\Release" mkdir "%~dp0..\build\Release"
if exist "%~dp0..\build\Release\snap_overlay.node.old" del /f /q "%~dp0..\build\Release\snap_overlay.node.old" >nul 2>&1
if exist "%~dp0..\build\Release\snap_overlay.node" ren "%~dp0..\build\Release\snap_overlay.node" snap_overlay.node.old >nul 2>&1
copy /y "%~dp0..\src\native\snap-overlay\build\Release\snap_overlay.node" "%~dp0..\build\Release\snap_overlay.node"
