@echo off
REM Starts the API. Hourly ingest catch-up + loop starts automatically with the API
REM (see backend/hourly_supervisor.py). Closing the laptop stops it; reopening and
REM running this bat resumes fetch if data is stale.
cd /d "%~dp0..\backend"
set CLIMATESHIELD_DB=pipeline/data/processed/climateshield.duckdb
set CLIMATESHIELD_AUTO_INGEST=1
python -m uvicorn main:app --host 127.0.0.1 --port 8002 --reload
