"""Build the Insight Agent section library from files already in the repo.

PDF advisories are catalogued only. Their bytes are not in the workspace, so
this builder does not invent their wording. Homepage snapshots, PMD stage
limits, city-stat labels, and quality-log reasons are real local records.
"""

from __future__ import annotations

import csv
import json
import re
from html.parser import HTMLParser
from pathlib import Path

from climateshield.config import INSIGHT_DOCS_DIR, PROCESSED_DIR, RAW_DATASETS, RAW_HOURLY_DIR, REPORTS_DIR
from climateshield.insight.retrieve import build_vectors

INDEX_PATH = PROCESSED_DIR / "insight_index.json"
FIGURES = re.compile(r"\d+(?:[.,]\d+)?")


class _VisibleText(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in {"script", "style", "noscript"}:
            self._skip += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self._skip:
            self._skip -= 1

    def handle_data(self, data: str) -> None:
        if self._skip:
            return
        text = " ".join(data.split())
        if len(text) >= 40:
            self.parts.append(text)


def strip_figures(text: str) -> str:
    """Drop digits so a retrieved excerpt cannot smuggle an unverified number."""
    cleaned = FIGURES.sub(" ", text)
    return " ".join(cleaned.split())


def _html_sections(path: Path, publisher: str, source_url: str) -> list[dict]:
    parser = _VisibleText()
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    seen: set[str] = set()
    sections = []
    for paragraph in parser.parts:
        text = strip_figures(paragraph)
        if len(text) < 40 or text in seen:
            continue
        seen.add(text)
        sections.append(
            {
                "section_id": f"snapshot|{path.name}|{len(sections) + 1}",
                "title": f"{publisher} homepage snapshot",
                "publisher": publisher,
                "source_url": source_url,
                "text": text[:700],
                "row_ids": [],
                "parsed": True,
            }
        )
        if len(sections) >= 8:
            break
    return sections


def _latest_snapshots() -> list[Path]:
    files = sorted(RAW_HOURLY_DIR.glob("*/snapshots/*.html"))
    if not files:
        return []
    newest = max(path.parent for path in files).as_posix()
    return [path for path in files if path.parent.as_posix() == newest]


def _pmd_sections() -> list[dict]:
    path = RAW_DATASETS / "03_ndma_pmd_hazards_warnings" / "pmd_river_danger_levels_thresholds.csv"
    if not path.is_file():
        return []
    sections = []
    with path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            station = row["station_name"].strip()
            basin = row["river_basin"].strip()
            row_id = f"river|{basin}|{station}"
            sections.append(
                {
                    "section_id": f"pmd|{row_id}",
                    "title": f"PMD flood stage limits for {station}",
                    "publisher": "PMD Flood Forecasting Division",
                    "source_url": "https://ffd.pmd.gov.pk",
                    "text": (
                        f"PMD publishes flood stage limits for {station} on the {basin} river in "
                        f"{row.get('province', '')}. The stages are low, medium, high, very high, and "
                        "exceptionally high. They are thresholds, not observed discharge. "
                        f"Numeric stages are read from gold row {row_id}."
                    ),
                    "row_ids": [row_id],
                    "parsed": True,
                }
            )
    return sections


def _city_sections() -> list[dict]:
    path = PROCESSED_DIR / "weather_city_stats.csv"
    if not path.is_file():
        return []
    sections = []
    with path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            city = row["city"].strip()
            row_id = row.get("row_id") or f"city_stats|{city}"
            sections.append(
                {
                    "section_id": f"stats|{row_id}",
                    "title": f"{city} weather statistics",
                    "publisher": "Open-Meteo archive, aggregated in weather_city_stats",
                    "source_url": "https://open-meteo.com/",
                    "text": (
                        f"{city} weather statistics cover maximum temperature, total rainfall, rainy hours, "
                        f"and extreme-heat hours. Figures are inserted from the matching gold row."
                    ),
                    "row_ids": [row_id],
                    "parsed": True,
                }
            )
    return sections


def _quality_sections() -> list[dict]:
    path = REPORTS_DIR / "quality_logs.csv"
    if not path.is_file():
        return []
    sections = []
    with path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            rule = row.get("rule_id") or "rule"
            reason = strip_figures(row.get("reason") or "")
            details = strip_figures(row.get("details") or "")
            action = row.get("action") or "flag"
            sections.append(
                {
                    "section_id": f"quality|{rule}",
                    "title": f"Data Quality Agent decision {rule}",
                    "publisher": "ClimateShield Data Quality Agent",
                    "source_url": "",
                    "text": (
                        f"Rule {rule} on dataset {row.get('dataset', '')} chose action {action}. "
                        f"{reason} {details}"
                    ).strip(),
                    "row_ids": [f"quality_log|{rule}"],
                    "parsed": True,
                }
            )
    return sections


def _catalog_sections() -> list[dict]:
    path = PROCESSED_DIR / "document_catalog.csv"
    if not path.is_file():
        return []
    sections = []
    with path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            title = row.get("title") or row.get("filename") or "official document"
            sections.append(
                {
                    "section_id": row.get("row_id") or f"doc|{row.get('filename')}",
                    "title": title,
                    "publisher": row.get("publisher") or "official publisher",
                    "source_url": "",
                    "text": (
                        f"{title} from {row.get('publisher', '')} is listed in the document catalog. "
                        "The PDF text was not parsed, so this agent cannot quote the document or any figure inside it."
                    ),
                    "row_ids": [row.get("row_id") or ""],
                    "parsed": False,
                }
            )
    return sections


def _drop_site_chrome(text: str) -> str:
    """Start at the document body when a page saved its navigation first."""
    markers = (
        "GOVERNMENT OF PAKISTAN",
        "Subject:",
        "Current Meteorological Conditions",
        "WHAT TO DO IF YOU SEE",
        "Key facts",
        "The most important actions",
    )
    positions = [text.find(marker) for marker in markers if marker in text]
    if not positions:
        return text
    start = min(positions)
    return text[start:] if start > 0 else text


def _chunks(text: str) -> list[str]:
    """Cut extracted text into windows and keep the ones that read like advice."""
    compact = " ".join(_drop_site_chrome(text).split())
    if len(compact) < 80:
        return []
    size, step = 650, 450
    windows = [compact[index:index + size] for index in range(0, max(len(compact) - 80, 1), step)]
    keywords = ("heat", "flood", "rain", "monsoon", "warning", "water", "shelter", "health", "temperature")
    markers = (
        "stay well-hydrated",
        "avoid direct exposure",
        "heatstroke",
        "hydrological",
        "meteorological outlook",
        "rivers at a glance",
        "subject:",
        "individual preventive",
        "call for emergency",
        "below normal",
        "above normal",
        "major rivers",
        "normal flow",
        "drink plenty",
    )

    def useful(part: str) -> bool:
        words = part.lower().split()
        return len(words) >= 40 and len(set(words)) / len(words) > 0.45

    def rank(part: str) -> int:
        lowered = part.lower()
        return sum(word in lowered for word in keywords) + 6 * sum(marker in lowered for marker in markers)

    candidates = [part for part in windows if useful(part)] or windows
    ranked = sorted(candidates, key=rank, reverse=True)
    chosen: list[str] = []
    for part in ranked:
        if rank(part) <= 0 and chosen:
            continue
        if any(part[:60] == existing[:60] for existing in chosen):
            continue
        chosen.append(part)
        if len(chosen) >= 8:
            break
    return chosen


def _official_document_sections() -> list[dict]:
    if not INSIGHT_DOCS_DIR.is_dir():
        return []
    sections: list[dict] = []
    for provenance_path in sorted(INSIGHT_DOCS_DIR.glob("*.provenance.json")):
        record = json.loads(provenance_path.read_text(encoding="utf-8"))
        doc_id = record.get("doc_id") or provenance_path.stem.replace(".provenance", "")
        text_path = INSIGHT_DOCS_DIR / f"{doc_id}.txt"
        title = record.get("title") or doc_id
        publisher = record.get("publisher") or "official publisher"
        source_url = record.get("url") or record.get("listing_url") or ""
        text = text_path.read_text(encoding="utf-8") if text_path.is_file() else ""
        if record.get("status") != "parsed" or len(text) < 200:
            sections.append(
                {
                    "section_id": f"official|{doc_id}|unparsed",
                    "title": title,
                    "publisher": publisher,
                    "source_url": source_url,
                    "text": (
                        f"{title} from {publisher} was fetched from the public listing. "
                        "Usable wording was not extracted, so this agent does not quote advice from it."
                    ),
                    "row_ids": [],
                    "parsed": False,
                    "kind": "official_document",
                }
            )
            continue
        for index, chunk in enumerate(_chunks(text), start=1):
            sections.append(
                {
                    "section_id": f"official|{doc_id}|{index}",
                    "title": title,
                    "publisher": publisher,
                    "source_url": source_url,
                    "text": f"{title}. {chunk}",
                    "row_ids": [],
                    "parsed": True,
                    "kind": "official_document",
                }
            )
    return sections


def _limits_section() -> dict:
    return {
        "section_id": "limits|project",
        "title": "What this assistant will not claim",
        "publisher": "ClimateShield 360 project limits",
        "source_url": "",
        "text": (
            "Outputs are information, not professional advice. In an emergency contact official services. "
            "The assistant refuses questions about deaths, hospital admissions, crop losses, and money damages "
            "because those tables are not in the warehouse. Missing weather is not treated as zero."
        ),
        "row_ids": [],
        "parsed": True,
    }


def collect_sections() -> list[dict]:
    publishers = {
        "ndma_homepage.html": ("NDMA", "https://ndma.gov.pk"),
        "pmd_ffd_homepage.html": ("PMD Flood Forecasting Division", "https://ffd.pmd.gov.pk"),
        "pbs_homepage.html": ("Pakistan Bureau of Statistics", "https://www.pbs.gov.pk"),
    }
    sections: list[dict] = [_limits_section()]
    for path in _latest_snapshots():
        publisher, url = publishers.get(path.name, (path.stem, ""))
        sections.extend(_html_sections(path, publisher, url))
    sections.extend(_pmd_sections())
    sections.extend(_city_sections())
    sections.extend(_quality_sections())
    sections.extend(_catalog_sections())
    sections.extend(_official_document_sections())
    return sections


def build_index(path: Path | None = None) -> Path:
    destination = path or INDEX_PATH
    sections = collect_sections()
    payload = {"sections": sections, **build_vectors(sections)}
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return destination
