@echo off
echo ===================================================
echo   Starting Cricket League (MariaDB + Node.js)
echo ===================================================

:: Check if MariaDB on port 3307 is already listening
netstat -ano | findstr :3307 | findstr LISTENING >nul
if %errorlevel% neq 0 (
    echo Starting XAMPP MariaDB on port 3307...
    start /b "" "C:\Users\gowda\OneDrive\Desktop\xampp\mysql\bin\mysqld.exe" --defaults-file="C:\Users\gowda\OneDrive\Desktop\xampp\mysql\bin\my.ini" --port=3307 --console
    timeout /t 2 /nobreak >nul
) else (
    echo [OK] MariaDB is already running on port 3307.
)

:: Start Node.js Cricket League Server
cd /d "%~dp0backend"
echo Starting Node.js Server at http://localhost:3005...
start http://localhost:3005
node src/server.js
