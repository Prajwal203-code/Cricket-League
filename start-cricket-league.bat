@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   Starting Cricket League (MariaDB + Node.js)
echo ===================================================

:: Resolve everything relative to this script so the project works from any
:: checkout location. This file lives in <xampp>/htdocs/Cricket League/.
set "PROJECT_DIR=%~dp0"
for %%I in ("%PROJECT_DIR%..\..") do set "XAMPP_DIR=%%~fI"
set "MYSQL_BIN=%XAMPP_DIR%\mysql\bin"

:: Read PORT and DB_PORT from backend\.env, falling back to defaults.
set "PORT=3005"
set "DB_PORT=3307"
if exist "%PROJECT_DIR%backend\.env" (
    for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%PROJECT_DIR%backend\.env") do (
        if /i "%%A"=="PORT" set "PORT=%%B"
        if /i "%%A"=="DB_PORT" set "DB_PORT=%%B"
    )
) else (
    echo [WARN] backend\.env not found. Copy backend\.env.example to backend\.env first.
    echo        Using defaults: PORT=%PORT%, DB_PORT=%DB_PORT%
    echo.
)

:: Strip stray whitespace picked up from the .env file.
for /f "tokens=* delims= " %%A in ("!PORT!") do set "PORT=%%A"
for /f "tokens=* delims= " %%A in ("!DB_PORT!") do set "DB_PORT=%%A"

if not exist "%MYSQL_BIN%\mysqld.exe" (
    echo [ERROR] Could not find mysqld.exe at:
    echo         %MYSQL_BIN%
    echo         Expected this project to live in ^<xampp^>\htdocs\Cricket League.
    pause
    exit /b 1
)

:: Start MariaDB only if nothing is already listening on its port.
netstat -ano | findstr ":!DB_PORT!" | findstr LISTENING >nul
if !errorlevel! neq 0 (
    echo Starting XAMPP MariaDB on port !DB_PORT!...
    start /b "" "%MYSQL_BIN%\mysqld.exe" --defaults-file="%MYSQL_BIN%\my.ini" --port=!DB_PORT! --console
    timeout /t 3 /nobreak >nul
) else (
    echo [OK] MariaDB is already running on port !DB_PORT!.
)

cd /d "%PROJECT_DIR%backend"

if not exist "node_modules" (
    echo Installing backend dependencies...
    call npm install
    if !errorlevel! neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo Starting Node.js server at http://localhost:!PORT! ...
start "" "http://localhost:!PORT!"
node src/server.js

endlocal
