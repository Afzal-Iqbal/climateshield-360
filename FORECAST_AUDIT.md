# Forecast audit — 2026-10-20

The participant guide is not in the workspace. New forecast generators were not written. Existing screens that showed invented forecast numbers were changed to say so.

## Coverage

| Area | Status | What is real |
|---|---|---|
| Physical, heavy rain | Partial | Saved LightGBM quantile model, 1 hour ahead, one row per city. Declared baseline is 24-hour persistence. Holdout MAE 0.0685 mm vs 0.1055 mm. Inundation Brier score is worse than baseline. |
| Physical, heat | Unsupported as a forecast | Latest observed 2m temperature and 35/40/45°C thresholds. Not WBGT. |
| Environmental | Unsupported | Soil moisture and daily GloFAS are observations. Forecast hours from Open-Meteo are downloaded and then discarded. |
| Producers | Unsupported | No crop model. |
| Economic | Unsupported | No loss or price model. |
| Public health | Unsupported | No health-outcome or WBGT model. |
| Infrastructure | Unsupported | No disruption model. A zone map must not say a road is flooded. |
| Social | Unsupported | Census tables are not a harm forecast. |
| Emergency | Partial | Planner ranks stored exposure. Rain can show the 1-hour model probability. Heat has no model probability. This is not an official warning. |

`GET /api/forecast/coverage` returns this list. It does not create numbers.

## Repairs

- Overview no longer shows 43.8°C WBGT or 38 mm from GFS/ECMWF. Those cards use Karachi observations.
- The status bar no longer shows a fixed 43.8°C.
- Zone detail no longer computes WBGT as `26 + probability × 10` or a 6-hour burst as `15 + probability × 45`.
- The planner no longer fills 0.76 or 0.65 when a model row is missing. Rain intervals are labelled mm/h, not percent.
- `/api/forecast` reports issue time, a 1-hour horizon, and a stale flag when the forecast time is already past.
- The methodology horizon text no longer says 1 to 24 hours.

## Not done

A multi-day forecast, heat forecast, and impact translation for agriculture, money, health, roads, and communities were not implemented. Doing that would be a new model, and the request limits this pass to the existing system plus an explicit coverage declaration.

## Tests run

`python -m pytest tests/test_forecast.py tests/test_overview.py tests/test_planner.py tests/test_map.py tests/test_methodology.py` from `backend`. See the command result in this session. The manifest count test is included because hourly provenance is now listed with the collected-file manifest.
