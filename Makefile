PYTHON ?= $(shell if [ -f .venv/bin/python ]; then echo .venv/bin/python; else echo python3; fi)

.PHONY: data test backend frontend ingest inventory train

data:
	PYTHONPATH=pipeline $(PYTHON) -m climateshield make-data

test:
	PYTHONPATH=backend:src $(PYTHON) -m pytest backend/tests

backend:
	PYTHONPATH=backend:src $(PYTHON) -m uvicorn main:app --port 8002 --host 127.0.0.1

frontend:
	cd frontend && npm run dev -- --port 5173

ingest:
	PYTHONPATH=pipeline $(PYTHON) -m climateshield ingest-hourly --once

inventory:
	PYTHONPATH=pipeline $(PYTHON) -m climateshield inventory

train:
	PYTHONPATH=pipeline $(PYTHON) -m climateshield train
