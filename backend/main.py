"""
Main FastAPI Application for ClimateShield 360 Karachi.
Follows all conventions specified in AGENT_RULES.md:
- Read-only DuckDB access
- Timestamps in UTC, display in PKT (UTC+5)
- Standard envelope: {data, generated_at, is_sample}
- Standard errors: {error, detail}
- CORS for local dev origin
"""

from datetime import datetime, timezone
import duckdb
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from db import (
    get_connection,
    get_db_path,
    get_last_run_summary,
    is_sample_database,
    safe_query,
)
from schemas import (
    APIResponse,
    HealthData,
    LastRunSummary,
    MetaData,
)

# Import routers
from routers.overview import router as overview_router
from routers.freshness import router as freshness_router
from routers.quality import router as quality_router
from routers.predictions import router as predictions_router
from routers.map import router as map_router
from routers.impacts import router as impacts_router
from routers.insight import router as insight_router
from routers.forecast import router as forecast_router
from routers.model import router as model_router
from routers.planner import router as planner_router
from routers.methodology import router as methodology_router

app = FastAPI(
    title="ClimateShield 360 API",
    description="Extreme-weather decision support API for Karachi, Pakistan (Sindh PDMA / KMC)",
    version="0.1.0",
)

# Configure CORS for local development frontend
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Ensure all unhandled exceptions adhere to {error, detail} convention."""
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "detail": str(exc),
        },
    )


# --- Core System Endpoints ---

@app.get("/api/health", response_model=APIResponse[HealthData])
def health_check() -> APIResponse[HealthData]:
    """
    Health check endpoint returning system and database connectivity status.
    Envelope: {data, generated_at, is_sample}
    """
    now_utc = datetime.now(timezone.utc)
    is_sample = is_sample_database()
    tables: list[str] = []
    db_connected = False

    try:
        conn = get_connection()
        try:
            res = conn.execute("SHOW TABLES;").fetchall()
            tables = [r[0] for r in res]
            db_connected = True
        finally:
            conn.close()
    except Exception as e:
        print(f"[health_check error] {e}")
        db_connected = False

    health_data = HealthData(
        status="ok" if db_connected else "degraded",
        db_connected=db_connected,
        duckdb_version=duckdb.__version__,
        tables_found=tables,
    )

    return APIResponse(
        data=health_data,
        generated_at=now_utc,
        is_sample=is_sample,
    )


@app.get("/api/meta", response_model=APIResponse[MetaData])
def get_meta() -> APIResponse[MetaData]:
    """
    Metadata endpoint returning app info, sample state, and latest pipeline run summary.
    Envelope: {data, generated_at, is_sample}
    """
    now_utc = datetime.now(timezone.utc)
    is_sample = is_sample_database()
    last_run_raw = get_last_run_summary()

    last_run = None
    if last_run_raw:
        last_run = LastRunSummary(
            run_id=last_run_raw.get("run_id"),
            started_at=last_run_raw.get("started_at"),
            finished_at=last_run_raw.get("finished_at"),
            status=last_run_raw.get("status"),
            notes=last_run_raw.get("notes"),
        )

    meta = MetaData(
        app_name="ClimateShield 360 Karachi",
        version="0.1.0",
        is_sample=is_sample,
        timezone_stored="UTC",
        timezone_display="PKT (UTC+5)",
        db_path=str(get_db_path()),
        last_run=last_run,
    )

    return APIResponse(
        data=meta,
        generated_at=now_utc,
        is_sample=is_sample,
    )


# Mount feature routers under /api
app.include_router(overview_router, prefix="/api")
app.include_router(freshness_router, prefix="/api")
app.include_router(quality_router, prefix="/api")
app.include_router(predictions_router, prefix="/api")
app.include_router(map_router, prefix="/api")
app.include_router(impacts_router, prefix="/api")
app.include_router(insight_router, prefix="/api")
app.include_router(forecast_router, prefix="/api")
app.include_router(model_router, prefix="/api")
app.include_router(planner_router, prefix="/api")
app.include_router(methodology_router, prefix="/api")
