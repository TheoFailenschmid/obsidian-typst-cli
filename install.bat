@echo off
REM Installation script for Obsidian Typst Math Renderer Plugin (Windows)

echo.
echo ================================================
echo Obsidian Typst Math Renderer - Installation
echo ================================================
echo.

REM Check if Typst is installed
typst --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Typst CLI not found!
    echo.
    echo Please install Typst from: https://github.com/typst/typst
    echo Installation: winget install --id Typst.Typst
    echo.
    set /p continue="Continue anyway? (y/N): "
    if /i not "%continue%"=="y" exit /b 1
) else (
    echo [OK] Typst CLI found
    typst --version
)

echo.

REM Ask for vault location
set /p vault_path="Enter your Obsidian vault path: "

REM Remove quotes if present
set vault_path=%vault_path:"=%

REM Check if vault exists
if not exist "%vault_path%" (
    echo [ERROR] Vault directory not found: %vault_path%
    pause
    exit /b 1
)

REM Create plugin directory
set plugin_dir=%vault_path%\.obsidian\plugins\obsidian-typst-math
echo.
echo [INFO] Creating plugin directory: %plugin_dir%
if not exist "%plugin_dir%" mkdir "%plugin_dir%"

REM Copy plugin files
echo [INFO] Copying plugin files...
copy /Y main.js "%plugin_dir%\" >nul
copy /Y manifest.json "%plugin_dir%\" >nul
copy /Y styles.css "%plugin_dir%\" >nul

echo.
echo ================================================
echo Installation complete!
echo ================================================
echo.
echo Next steps:
echo 1. Open Obsidian
echo 2. Go to Settings - Community Plugins
echo 3. Disable 'Safe Mode' if enabled
echo 4. Click 'Reload plugins' or restart Obsidian
echo 5. Enable 'Typst Math Renderer'
echo 6. Configure the plugin in Settings
echo.
echo Read QUICKSTART.md for usage instructions
echo Check EXAMPLES.md for syntax examples
echo.
echo Happy typesetting!
echo.
pause
