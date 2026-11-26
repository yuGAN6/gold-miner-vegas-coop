@echo off
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0Manage-Mod.ps1" -Mode Install -GameDirectory "%~1"
set "MOD_RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %MOD_RESULT%
