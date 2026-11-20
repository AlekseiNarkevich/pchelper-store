@echo off
setlocal
chcp 65001 >nul

echo [1/4] Проверка зависимостей и сборка веб-клиента...
cd /d "%~dp0frontend"
if not exist node_modules call npm ci
if errorlevel 1 goto :fail
call npm run build
if errorlevel 1 goto :fail

echo [2/4] Проверка зависимостей backend...
cd /d "%~dp0backend"
if not exist node_modules call npm ci
if errorlevel 1 goto :fail

echo [3/4] Проверка зависимостей desktop...
cd /d "%~dp0desktop"
if not exist node_modules call npm install
if errorlevel 1 goto :fail

echo Очистка предыдущей сборки desktop\dist...
if exist "%~dp0desktop\dist" rmdir /s /q "%~dp0desktop\dist"

echo [4/4] Сборка Portable .exe...
call npm run build:win
if errorlevel 1 goto :fail

echo Копирование результата в release\ ...
if not exist "%~dp0release" mkdir "%~dp0release"
del /q "%~dp0release\PCHelper-Portable-*.exe" >nul 2>nul
for %%F in ("%~dp0desktop\dist\PCHelper-Portable-*.exe") do (
  copy /y "%%~fF" "%~dp0release\" >nul
)

echo.
echo Готово. Portable-файл:
echo   "%~dp0release\PCHelper-Portable-1.0.0-x64.exe"
echo.
echo Напоминание: файл backend\.env попадает внутрь сборки.
echo Не публикуйте .exe с рабочими ключами Supabase.
pause
exit /b 0

:fail
echo.
echo Ошибка сборки. Проверьте вывод выше.
pause
exit /b 1
