PYTHON ?= $(shell if [ -f ../.venv/bin/python ]; then echo ../.venv/bin/python; elif [ -f .venv/bin/python ]; then echo .venv/bin/python; else echo python; fi)

.PHONY: data test inventory train

data:
	$(PYTHON) -m climateshield make-data

inventory:
	$(PYTHON) -m climateshield inventory

test:
	$(PYTHON) -m pytest tests -q

train:
	$(PYTHON) -m climateshield train
