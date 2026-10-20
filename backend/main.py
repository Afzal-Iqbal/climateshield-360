"""
Main FastAPI Application for ClimateShield 360 Karachi.
Follows all conventions specified in AGENT_RULES.md:
- Read-only DuckDB access
- Timestamps in UTC, display in PKT (UTC+5)
- Standard envelope: {data, generated_at, is_sample}
- Standard errors: {error, detail}
- CORS for local dev origin
- Near-real-time ETag / 304 support
- Server-Sent Events (SSE) live stream at /api/stream
"""

import asyncio
from datetime import datetime, timezone
import email.utils
import json
import os
import duckdb
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from db import (
    get_connection,
    get_data_as_of,
    get_db_mtime,
    get_db_path,
    get_last_run_summary,
    get_next_run_time,
    get_sources_freshness_meta,
    is_sample_database,
    safe_query,
)
from schemas import (
    APIResponse,
    HealthData,
    LastRunSummary,
    MetaData,
    SourceMetaInfo,
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
from routers.rag import router as rag_router

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
    expose_headers=["ETag", "Last-Modified"],
)


# -------------------------------------------------------------------------
# Stage 3 Middleware: ETag / Last-Modified / 304 Not Modified support
# -------------------------------------------------------------------------
@app.middleware("http")
async def etag_cache_middleware(request: Request, call_next):
    # Only cache GET/HEAD requests under /api (excluding /api/stream and /api/health)
    path = request.url.path
    if request.method not in ("GET", "HEAD") or not path.startswith("/api") or path in ("/api/stream", "/api/health"):
        return await call_next(request)

    mtime = get_db_mtime()
    etag = f'W/"db-{int(mtime)}"'
    last_mod_str = email.utils.formatdate(mtime, usegmt=True)

    # Check If-None-Match header
    if_none_match = request.headers.get("if-none-match")
    if if_none_match and (if_none_match.strip() == etag or if_none_match.strip() == "*"):
        return Response(status_code=304, headers={"ETag": etag, "Last-Modified": last_mod_str})

    # Check If-Modified-Since header
    if_modified_since = request.headers.get("if-modified-since")
    if if_modified_since:
        try:
            ims_dt = email.utils.parsedate_to_datetime(if_modified_since)
            if ims_dt.timestamp() >= int(mtime):
                return Response(status_code=304, headers={"ETag": etag, "Last-Modified": last_mod_str})
        except Exception:
            pass

    response: Response = await call_next(request)

    # Attach ETag and Last-Modified to 200 responses
    if response.status_code == 200:
        response.headers["ETag"] = etag
        response.headers["Last-Modified"] = last_mod_str
        response.headers["Cache-Control"] = "public, max-age=30"

    return response


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
    Metadata endpoint returning app info, sample state, latest pipeline run,
    data_as_of timestamp, next scheduled run, per-source freshness, and is_live flag.
    Stage 3 Requirement 13.
    """
    now_utc = datetime.now(timezone.utc)
    is_sample = is_sample_database()
    last_run_raw = get_last_run_summary()

    last_run = None
    last_run_at = None
    last_run_status = None
    if last_run_raw:
        s_at = last_run_raw.get("started_at")
        f_at = last_run_raw.get("finished_at")
        last_run_at = f_at or s_at
        last_run_status = last_run_raw.get("status")
        last_run = LastRunSummary(
            run_id=last_run_raw.get("run_id"),
            started_at=s_at,
            finished_at=f_at,
            status=last_run_status,
            notes=last_run_raw.get("notes"),
        )

    # Near-Real-Time attributes
    data_as_of = get_data_as_of()
    next_run_at = get_next_run_time()
    raw_sources, is_live = get_sources_freshness_meta()

    source_meta_items = [
        SourceMetaInfo(
            source_name=s["source_name"],
            age_minutes=s["age_minutes"],
            status=s["status"],
            expected_every_minutes=s["expected_every_minutes"],
            publisher=s.get("publisher"),
            licence=s.get("licence"),
            last_fetched_at=s.get("last_fetched_at"),
            last_data_timestamp=s.get("last_data_timestamp"),
        )
        for s in raw_sources
    ]

    meta = MetaData(
        app_name="ClimateShield 360 Karachi",
        version="0.1.0",
        is_sample=is_sample,
        timezone_stored="UTC",
        timezone_display="PKT (UTC+5)",
        db_path=str(get_db_path()),
        last_run=last_run,
        data_as_of=data_as_of,
        last_run_at=last_run_at,
        last_run_status=last_run_status,
        next_run_at=next_run_at,
        sources=source_meta_items,
        is_live=is_live,
    )

    return APIResponse(
        data=meta,
        generated_at=now_utc,
        is_sample=is_sample,
    )


# -------------------------------------------------------------------------
# Stage 3 Requirement 15: Server-Sent Events (SSE) Live Stream
# -------------------------------------------------------------------------
@app.get("/api/stream")
async def sse_event_stream(request: Request):
    """
    Server-Sent Events endpoint emitting an event whenever the database file mtime changes.
    Sends periodic keep-alive pings and handles client disconnection gracefully.
    """
    async def event_generator():
        last_seen_mtime = get_db_mtime()
        # Emit initial state
        initial_data = {
            "type": "connected",
            "mtime": last_seen_mtime,
            "connected_at": datetime.now(timezone.utc).isoformat(),
        }
        yield f"event: connect\ndata: {json.dumps(initial_data)}\n\n"

        while True:
            if await request.is_disconnected():
                break

            current_mtime = get_db_mtime()
            if current_mtime != last_seen_mtime:
                last_seen_mtime = current_mtime
                data_as_of = get_data_as_of()
                payload = {
                    "type": "db_update",
                    "mtime": current_mtime,
                    "data_as_of": data_as_of.isoformat() if data_as_of else None,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                yield f"event: data_update\ndata: {json.dumps(payload)}\n\n"

            # Keep-alive heartbeat comment every 15 seconds
            yield ": keep-alive\n\n"
            await asyncio.sleep(2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
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
app.include_router(rag_router, prefix="/api")
