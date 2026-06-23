@echo off
title Miku Tool - Yonetim Paneli
:menu
cls
echo ==========================================
echo         MIKU TOOL YONETIM PANELI
echo ==========================================
echo  [1] Gelistirici Modunda Baslat (Vite + Electron Dev)
echo  [2] Sadece Backend Derle (miku-engine.exe)
echo  [3] Tum Projeyi Derle ve Paketle (Yükleyici Oluştur)
echo  [4] Projeyi Temizle (Gereksiz Dosyalari Sil)
echo  [5] Cikis
echo ==========================================
set /p secim="Seciminiz (1-5): "

if "%secim%"=="1" goto start_dev
if "%secim%"=="2" goto build_backend
if "%secim%"=="3" goto build_all
if "%secim%"=="4" goto clean_proj
if "%secim%"=="5" exit
goto menu

:start_dev
echo.
echo [!] Uygulama baslatiliyor, lutfen bekleyin...
set PATH=%PATH%;C:\Program Files\nodejs\
call npm run dev:all
pause
goto menu

:build_backend
echo.
echo [!] Python API Backend Derleniyor (PyInstaller)...
call venv\Scripts\pyinstaller --onefile --name miku-engine --icon=public\miku-icon.ico --hidden-import=uvicorn.logging --hidden-import=uvicorn.loops.auto --hidden-import=uvicorn.protocols.http.auto --hidden-import=uvicorn.protocols.websockets.auto --hidden-import=engineio.async_drivers.threading engine\api.py
if %ERRORLEVEL% NEQ 0 (
    echo [HATA] Derleme basarisiz oldu!
    pause
    goto menu
)
copy /y dist\miku-engine.exe miku-engine.exe
copy /y dist\miku-engine.exe release\win-unpacked\resources\miku-engine.exe
rmdir /s /q build
rmdir /s /q dist
echo [BASARILI] Backend derlendi ve release klasorune kopyalandi!
pause
goto menu

:build_all
echo.
echo [!] Python API Backend Derleniyor...
call venv\Scripts\pyinstaller --onefile --name miku-engine --icon=public\miku-icon.ico --hidden-import=uvicorn.logging --hidden-import=uvicorn.loops.auto --hidden-import=uvicorn.protocols.http.auto --hidden-import=uvicorn.protocols.websockets.auto --hidden-import=engineio.async_drivers.threading engine\api.py
if %ERRORLEVEL% NEQ 0 (
    echo [HATA] Backend derleme basarisiz!
    pause
    goto menu
)
copy /y dist\miku-engine.exe miku-engine.exe
copy /y dist\miku-engine.exe release\win-unpacked\resources\miku-engine.exe
rmdir /s /q build
rmdir /s /q dist

echo.
echo [!] React Frontend Derleniyor (Vite)...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [HATA] React build basarisiz!
    pause
    goto menu
)
xcopy dist\* release\win-unpacked\resources\app\dist\ /e /y /i

echo.
echo [!] Electron Setup Yukleyicisi Paketleniyor...
call npm run dist:setup
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
taskkill /F /T /IM engine.exe 2>nul
taskkill /F /T /IM miku-engine.exe 2>nul
del /f /q .cache credentials.json debug.log 2>nul
rmdir /s /q .pytest_cache 2>nul
rmdir /s /q .trash 2>nul
rmdir /s /q build 2>nul
rmdir /s /q dist 2>nul
echo [BASARILI] Temizlik tamamlandi.
pause
goto menu
