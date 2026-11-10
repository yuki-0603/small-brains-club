@echo off
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 "%~dp0serve.py" %*
  goto done
)
where python >nul 2>nul
if %errorlevel% equ 0 (
  python "%~dp0serve.py" %*
  goto done
)
echo Python 3.9 or newer is required. Install it from https://www.python.org/
:done
pause
