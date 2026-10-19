@echo off
setlocal
if "%1"=="" goto data
if "%1"=="data" goto data
if "%1"=="test" goto test
if "%1"=="inventory" goto inventory
if "%1"=="ingest" goto ingest
if "%1"=="train" goto train
echo Usage: make.bat [data^|test^|inventory^|ingest^|train]
exit /b 1

:data
python -m climateshield make-data
exit /b %ERRORLEVEL%

:test
python -m pytest tests -q
exit /b %ERRORLEVEL%

:inventory
python -m climateshield inventory
exit /b %ERRORLEVEL%

:ingest
python -m climateshield ingest-hourly --once
exit /b %ERRORLEVEL%

:train
python -m climateshield train
exit /b %ERRORLEVEL%
