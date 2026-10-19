Project: ClimateShield 360, an extreme-weather (heat and heavy rain) impact and decision-support dashboard for Karachi, Pakistan. Hackathon project.

STACK
- Frontend: Vite + React + TypeScript, Tailwind CSS, React Router, TanStack Query, Recharts, MapLibre GL (or Leaflet), i18next for English/Urdu.
- Backend: FastAPI (Python), read-only DuckDB access, pydantic response models.
- Deployment: a Hugging Face Gradio-SDK Space whose app.py mounts the FastAPI app, a minimal Gradio status panel at /status, and the built React app at /.

NON-NEGOTIABLE RULES
1. Never hard-code outputs. Every number, chart and table comes from the API, which comes from DuckDB. If data is missing, show an explicit empty state.
2. No synthetic data presented as real. Sample data comes only from scripts/seed_sample_db.py, stored in a separate file; the API reports is_sample=true and the UI shows a visible "SAMPLE DATA" banner.
3. Store time in UTC; display in PKT (UTC+5).
4. Risk colours: Low green, Moderate yellow, High orange, Severe red, always with text labels. Accessible contrast, keyboard navigation.
5. Always show uncertainty intervals and the baseline comparison where predictions appear.
6. Footer on every page: "Information only, not professional advice. In an emergency contact official services."
7. Secrets only via environment variables, never in code or committed files.
8. Match the visual design in frontend/design/ as closely as possible.
9. Keep code simple, typed and commented so every team member can explain it in a viva. Small components, no unnecessary libraries.
10. Work one module at a time. Each module delivers: backend endpoint(s) + frontend page + tests. After each module, list files changed, how to run, and what I should verify visually.
11. The API is read-only. Never write to the warehouse.

TABLE CONTRACT
- run_status(run_id, started_at, finished_at, status, notes)
- source_freshness(source_name, publisher, licence, last_fetched_at, expected_every_minutes, status)
- quality_log(logged_at, source_name, rule, action[fix|fill|flag], rows_affected, explanation)
- predictions(zone_id, forecast_time, hazard_type, probability, interval_low, interval_high, baseline_value)
- model_eval(group_type, group_value, metric, baseline_score, model_score)
- exposure_index(zone_id, hazard_type, exposed_population, facilities_count, vulnerability_score, risk_level, evidence_strength)
- facilities(facility_id, type, name, zone_id, lat, lon)
- impact_indicators(zone_id, impact_area, indicator, value, evidence_strength, source, row_ids)
- zones(zone_id, name, geometry_geojson)

API CONVENTION
All endpoints under /api, JSON, snake_case. Every response includes {data, generated_at, is_sample}. Errors return {error, detail}. Add CORS for the local dev origin.