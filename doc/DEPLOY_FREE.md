# Free deploy — ClimateShield-360

## Target URL (free subdomain)

**https://climateshield-360.onrender.com**

Render’s free plan includes a named subdomain. A paid custom domain (e.g. `.com`) is not free; use this hostname as **ClimateShield-360**.

## One-click (recommended)

1. Sign up at [render.com](https://render.com) with GitHub (free).
2. Open **Blueprints** → **New Blueprint Instance**.
3. Select repo `Afzal-Iqbal/climateshield-360` (branch `main`).
4. Apply `render.yaml` — service name is `climateshield-360`.
5. Wait for the Docker build (~10–15 min first time).

Or use Render’s “New Web Service” → connect this repo → **Docker** → name `climateshield-360` → plan **Free**.

## What you get

| Piece | Behavior on free tier |
| --- | --- |
| React UI + FastAPI | Same URL (`/api` + SPA) |
| DuckDB warehouse | Baked into the image |
| Hourly ingest | Off by default (`CLIMATESHIELD_AUTO_INGEST=0`) — free instances sleep when idle |
| Cold start | First request after idle can take ~30–60s |

## Local Docker check

```bash
docker build -t climateshield-360 .
docker run --rm -p 8000:8000 climateshield-360
```

Open http://127.0.0.1:8000

## Notes

- Map tiles: set `VITE_CARTO_API_KEY` as a Docker build-arg / Render build env if you want Carto basemap in production.
- Re-enable ingest only if you accept ephemeral disk writes: `CLIMATESHIELD_AUTO_INGEST=1`.
