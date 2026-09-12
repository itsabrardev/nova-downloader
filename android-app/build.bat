@echo off
REM ============================================================
REM  Nova Downloader - One-Click Android Build
REM  Builds the web bundle (mobile-ui) and packages the APK.
REM ============================================================
setlocal

set PROJECT_ROOT=%~dp0..
set MOBILE_UI=%PROJECT_ROOT%\mobile-ui

echo.
echo === [1/2] Building Web Bundle (Vite) ===
cd /d "%MOBILE_UI%" || goto :error
call npm run build || goto :error

echo.
echo === [2/2] Building Android APK ===
cd /d "%~dp0" || goto :error
powershell.exe -ExecutionPolicy Bypass -File build-apk.ps1 || goto :error

echo.
echo ============================================================
echo  BUILD COMPLETE: %PROJECT_ROOT%\Nova-Downloader.apk
echo ============================================================
endlocal
exit /b 0

:error
echo.
echo BUILD FAILED - see messages above.
endlocal
exit /b 1
