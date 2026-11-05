@echo off
setlocal enabledelayedexpansion
title Miku Tool - Yonetim Paneli
cd /d "%~dp0"

:menu
cls
echo ==========================================
echo         MIKU TOOL YONETIM PANELI
echo ==========================================
echo  [1] Gelistirici Modunda Baslat (Vite + Electron Dev)
echo  [2] Sadece Backend Derle (miku-engine.exe)
echo  [3] Tum Projeyi Derle ve Paketle (Yukleyici Olustur)
echo  [4] Bagimliliklari Kur/Guncelle (Node + Python)
echo  [5] Projeyi Temizle (Gereksiz Dosyalari Sil)
echo  [6] Cikis
echo ==========================================
set /p secim="Seciminiz (1-6): "

if "%secim%"=="1" goto start_dev
if "%secim%"=="2" goto build_backend
if "%secim%"=="3" goto build_all
if "%secim%"=="4" goto install_deps
if "%secim%"=="5" goto clean_proj
if "%secim%"=="6" exit
goto menu

:install_deps
echo.
echo [!] Node.js bagimliliklari kuruluyor...
call npm install
echo.
echo [!] Python sanal ortami kontrol ediliyor...
if not exist "venv" (
    python -m venv venv
)
call venv\Scripts\pip install -r requirements.txt
echo [BASARILI] Tum bagimliliklar guncellendi!
pause
goto menu

:start_dev
echo.
if not exist "node_modules" (
    echo [!] Node modulleri eksik, kuruluyor...
    call npm install
)
if not exist "venv" (
    echo [!] Python sanal ortami eksik, olusturuluyor...
    python -m venv venv
    call venv\Scripts\pip install -r requirements.txt
)
if exist "%ProgramFiles%\nodejs" set "PATH=%PATH%;%ProgramFiles%\nodejs"
if exist "%ProgramFiles(x86)%\nodejs" set "PATH=%PATH%;%ProgramFiles(x86)%\nodejs"
echo [!] Uygulama baslatiliyor, lutfen bekleyin...
call npm run dev:all
pause
goto menu

:build_backend
echo.
echo [!] Python API Backend Derleniyor (PyInstaller)...
if not exist "venv" (
    echo [HATA] venv klasoru bulunamadi! Once bagimliliklari kurun (Secenek 4).
    pause
    goto menu
)
call venv\Scripts\pyinstaller --clean miku-engine.spec
if %ERRORLEVEL% NEQ 0 (
    echo [HATA] Derleme basarisiz oldu!
    pause
    goto menu
)
if exist "dist\miku-engine.exe" (
    copy /y "dist\miku-engine.exe" "miku-engine.exe"
    if exist "release\win-unpacked\resources" (
        copy /y "dist\miku-engine.exe" "release\win-unpacked\resources\miku-engine.exe"
    )
    if exist "release\Miku Tool Portable\resources" (
        copy /y "dist\miku-engine.exe" "release\Miku Tool Portable\resources\miku-engine.exe"
    )
)
if exist "build" rmdir /s /q build
if exist "dist" rmdir /s /q dist
echo [BASARILI] Backend derlendi ve release klasorune kopyalandi!
pause
goto menu

:build_all
echo.
echo [!] Python API Backend Derleniyor...
if not exist "venv" (
    echo [!] venv klasoru bulunamadi, olusturuluyor...
    python -m venv venv
    call venv\Scripts\pip install -r requirements.txt
)
call venv\Scripts\pyinstaller --clean miku-engine.spec
if %ERRORLEVEL% NEQ 0 (
    echo [HATA] Backend derleme basarisiz!
    pause
    goto menu
)
if exist "dist\miku-engine.exe" (
    copy /y "dist\miku-engine.exe" "miku-engine.exe"
)
if exist "build" rmdir /s /q build
if exist "dist" rmdir /s /q dist

echo.
echo [!] React Frontend Derleniyor (Vite)...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [HATA] React build basarisiz!
    pause
    goto menu
)

echo.
echo [!] Electron Yukleyicisi Paketleniyor...
call npm run dist:all
if %ERRORLEVEL% NEQ 0 (
    echo [HATA] Paketleme basarisiz!
    pause
    goto menu
)
echo [BASARILI] Yeni Miku Tool yukleyicisi release/ klasorunde olusturuldu!
pause
goto menu

:clean_proj
echo.
echo [!] Gereksiz dosyalar ve gecici klasorler temizleniyor...
taskkill /F /T /IM miku-engine.exe 2>nul
del /f /q .cache credentials.json debug.log 2>nul
if exist ".pytest_cache" rmdir /s /q .pytest_cache
if exist ".trash" rmdir /s /q .trash
if exist "build" rmdir /s /q build
if exist "dist" rmdir /s /q dist
echo [BASARILI] Temizlik tamamlandi.
pause
goto menu
