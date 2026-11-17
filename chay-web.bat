@echo off
chcp 65001 >nul
title Chùa Từ Quang Online
cd /d "%~dp0"

echo ========================================================
echo         ĐANG KHỞI ĐỘNG CHÙA TỪ QUANG ONLINE
echo ========================================================
echo.
echo Đang mở trình duyệt web...
echo Địa chỉ: http://127.0.0.1:5173
echo.

start "" " "
call npm.cmd run dev

if errorlevel 1 (
    echo.
    echo Đang mở bản tĩnh chua-online.html...
    start "" "%~dp0chua-online.html"
)

pause
