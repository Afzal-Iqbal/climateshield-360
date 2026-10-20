"""Download the public PDFs and pages the Insight Agent is allowed to cite.

Sources are the pages named by the team: PMD, NDMA guidelines, NDMA contingency
plans, and the two WHO heat pages. robots.txt is checked before each GET.
Figures are removed from the indexed text so a citation cannot introduce a
number that is not in a gold table.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

from climateshield.config import INSIGHT_DOCS_DIR
from climateshield.ingest.http import fetch_url, robots_allows
from climateshield.insight.corpus import strip_figures

MAX_BYTES = 25_000_000

# Heat, flood, and response documents linked from the named listing pages.
# Titles are the labels printed on those pages, not names invented here.
DOCUMENTS = [
    {
        "doc_id": "ndma_heatwave_guidelines_2026",
        "title": "NDMA Heatwave Guidelines 2026",
        "publisher": "NDMA",
        "url": "https://www.ndma.gov.pk/storage/guidelines/April2026/3fHNPy1RTFwucFyYmM0W.pdf",
        "listing_url": "https://www.ndma.gov.pk/public/guidelines",
    },
    {
        "doc_id": "ndma_heatwave_pictorial_2026",
        "title": "NDMA Pictorial Heatwave Guidelines 2026",
        "publisher": "NDMA",
        "url": "https://www.ndma.gov.pk/storage/guidelines/April2026/QsrPjecvtH1Q11uMbQBb.pdf",
        "listing_url": "https://www.ndma.gov.pk/public/guidelines",
    },
    {
        "doc_id": "ndma_hajj_heatwave_advisory_2026",
        "title": "NDMA Heatwave Advisory for Hajj Pilgrims 2026",
        "publisher": "NDMA",
        "url": "https://www.ndma.gov.pk/storage/guidelines/April2026/l6rniczGF4FfCG8E201a.pdf",
        "listing_url": "https://www.ndma.gov.pk/public/guidelines",
    },
    {
        "doc_id": "ndma_flood_guideline_english_2026",
        "title": "Pictorial Flood Guideline (English)",
        "publisher": "NDMA",
        "url": "https://www.ndma.gov.pk/storage/guidelines/June2026/6a3b898658a8a.pdf",
        "listing_url": "https://www.ndma.gov.pk/public/guidelines",
    },
    {
        "doc_id": "pdma_sindh_heatwave_sop_2025",
        "title": "Heatwave Management SOP 2025 (PDMA Sindh)",
        "publisher": "PDMA Sindh",
        "url": "https://www.ndma.gov.pk/storage/guidelines/March2025/tlhzTl9tvzQvvkrSjFnj.pdf",
        "listing_url": "https://www.ndma.gov.pk/public/guidelines?page=2",
    },
    {
        "doc_id": "ndma_monsoon_contingency_plan_2026",
        "title": "Monsoon Contingency Plan 2026",
        "publisher": "NDMA",
        "url": "https://www.ndma.gov.pk/storage/plans/June2026/6a27bf8ac0ab0.pdf",
        "listing_url": "https://www.ndma.gov.pk/public/plans_by_category/2",
    },
    {
        "doc_id": "ndma_summer_hazards_contingency_plan_2026",
        "title": "NDMA Summer Hazards Contingency Plan 2026",
        "publisher": "NDMA",
        "url": "https://www.ndma.gov.pk/storage/plans/April2026/des1YHpOOZYMDB3W7rHH.pdf",
        "listing_url": "https://www.ndma.gov.pk/public/plans_by_category/2",
    },
    {
        "doc_id": "pmd_seasonal_outlook_ond_2026",
        "title": "PMD seasonal outlook October to December 2026",
        "publisher": "PMD",
        "url": "https://weather.gov.pk/storage/files/91/OND_2026_outlook.pdf",
        "listing_url": "https://weather.gov.pk/",
    },
    {
        "doc_id": "pmd_october_2026_outlook",
        "title": "PMD outlook for October 2026",
        "publisher": "PMD",
        "url": "https://weather.gov.pk/storage/files/91/Oct_2026_outlook.pdf",
        "listing_url": "https://weather.gov.pk/",
    },
    {
        "doc_id": "who_signs_of_heat_stroke",
        "title": "Signs of heat stroke",
        "publisher": "WHO",
        "url": "https://cdn.who.int/media/docs/default-source/environment-climate-change-and-health/signs-of-heat-stroke.pdf",
        "listing_url": "https://www.who.int/news-room/fact-sheets/detail/climate-change-heat-and-health",
    },
]

HTML_PAGES = [
    {
        "doc_id": "who_heat_and_health_factsheet",
        "title": "Heat and health",
        "publisher": "WHO",
        "url": "https://www.who.int/news-room/fact-sheets/detail/climate-change-heat-and-health",
    },
    {
        "doc_id": "pmd_homepage",
        "title": "Pakistan Meteorological Department",
        "publisher": "PMD",
        "url": "https://pmd.gov.pk/",
    },
    {
        "doc_id": "who_public_health_advice_heat_page",
        "title": "Public health advice on preventing health effects of heat",
        "publisher": "WHO",
        "url": "https://www.who.int/publications/i/item/WHO-EURO-2011-2510-42266-58691",
    },
    {
        "doc_id": "pmd_weather_homepage",
        "title": "PMD live forecasts and warnings",
        "publisher": "PMD",
        "url": "https://weather.gov.pk/",
    },
    {
        "doc_id": "pmd_flood_bulletin_page",
        "title": "PMD Flood Forecasting Division bulletin",
        "publisher": "PMD",
        "url": "https://ffd.pmd.gov.pk/bulletin/bulletin",
    },
]


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
        if tag in {"p", "li", "h1", "h2", "h3", "br"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._skip:
            self.parts.append(data)


def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _write_provenance(folder: Path, doc_id: str, record: dict) -> None:
    (folder / f"{doc_id}.provenance.json").write_text(
        json.dumps(record, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def extract_pdf_text(payload: bytes) -> str:
    from io import BytesIO

    from pypdf import PdfReader

    reader = PdfReader(BytesIO(payload))
    pages = []
    for index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if text.strip():
            pages.append(f"\n\n[page {index}]\n{text}")
    return "\n".join(pages).strip()


def extract_html_text(html: str) -> str:
    parser = _VisibleText()
    parser.feed(html)
    return "\n".join(" ".join(part.split()) for part in "".join(parser.parts).splitlines())


def _save_text(folder: Path, doc_id: str, text: str) -> int:
    cleaned = strip_figures(text)
    destination = folder / f"{doc_id}.txt"
    destination.write_text(cleaned, encoding="utf-8")
    return len(cleaned)


def download_documents(folder: Path | None = None) -> list[dict]:
    """Fetch the named documents. Skips a URL robots.txt disallows."""
    destination = folder or INSIGHT_DOCS_DIR
    destination.mkdir(parents=True, exist_ok=True)
    saved: list[dict] = []
    for document in [*DOCUMENTS, *HTML_PAGES]:
        url = document["url"]
        existing = destination / f"{document['doc_id']}.provenance.json"
        text_file = destination / f"{document['doc_id']}.txt"
        if existing.is_file() and text_file.is_file():
            previous = json.loads(existing.read_text(encoding="utf-8"))
            if previous.get("status") == "parsed":
                saved.append(previous)
                print(f"KEEP {document['doc_id']}")
                continue
        allowed, robots_note = robots_allows(url)
        if not allowed:
            saved.append({**document, "status": "blocked", "robots": robots_note})
            print(f"BLOCKED {document['doc_id']}: {robots_note}")
            continue
        response = fetch_url(url, timeout=60, retries=2)
        record = {
            **document,
            "fetched_at_utc": datetime.now(timezone.utc).isoformat(),
            "http_status": response.status,
            "content_type": response.headers.get("content-type", ""),
            "robots": robots_note,
            "bytes": len(response.body),
            "sha256": _sha256(response.body) if response.body else "",
            "error": response.error,
        }
        if response.status != 200 or not response.body:
            record["status"] = "failed"
            _write_provenance(destination, document["doc_id"], record)
            saved.append(record)
            print(f"FAILED {document['doc_id']} status {response.status} {response.error}")
            continue
        if len(response.body) > MAX_BYTES:
            record["status"] = "too_large"
            _write_provenance(destination, document["doc_id"], record)
            saved.append(record)
            print(f"SKIP {document['doc_id']} larger than {MAX_BYTES} bytes")
            continue
        is_pdf = response.body.startswith(b"%PDF") or "pdf" in record["content_type"].lower() or url.lower().endswith(".pdf")
        if is_pdf and not response.body.startswith(b"%PDF"):
            record["status"] = "not_a_pdf"
            _write_provenance(destination, document["doc_id"], record)
            saved.append(record)
            print(f"SKIP {document['doc_id']} response was not a PDF")
            continue
        if is_pdf:
            (destination / f"{document['doc_id']}.pdf").write_bytes(response.body)
            try:
                text = extract_pdf_text(response.body)
            except Exception as exc:  # noqa: BLE001
                record["status"] = "extract_failed"
                record["extract_error"] = str(exc)
                _write_provenance(destination, document["doc_id"], record)
                saved.append(record)
                print(f"EXTRACT FAILED {document['doc_id']}: {exc}")
                continue
        else:
            (destination / f"{document['doc_id']}.html").write_bytes(response.body)
            text = extract_html_text(response.text)
        record["text_chars"] = _save_text(destination, document["doc_id"], text)
        record["status"] = "parsed" if record["text_chars"] >= 200 else "little_text"
        _write_provenance(destination, document["doc_id"], record)
        saved.append(record)
        print(f"SAVED {document['doc_id']} bytes={record['bytes']} text_chars={record['text_chars']} {record['status']}")
    (destination / "fetch_log.json").write_text(json.dumps(saved, indent=2, ensure_ascii=False), encoding="utf-8")
    return saved


def find_pmd_pdfs() -> list[str]:
    """Follow same-site links from pmd.gov.pk one step, looking for PDFs."""
    home = fetch_url("https://pmd.gov.pk/", timeout=45, retries=2)
    hrefs = re.findall(r"""href=["']([^"']+)["']""", home.text, re.I)
    found: list[str] = []
    pages = ["https://pmd.gov.pk/"]
    for href in hrefs:
        full = urljoin("https://pmd.gov.pk/", href)
        host = urlparse(full).netloc
        if host.endswith("pmd.gov.pk") and full not in pages and not full.lower().endswith(".pdf"):
            pages.append(full)
    for page in pages[:12]:
        allowed, _note = robots_allows(page)
        if not allowed:
            continue
        response = fetch_url(page, timeout=45, retries=1)
        for href in re.findall(r"""href=["']([^"']+)["']""", response.text, re.I):
            full = urljoin(page, href)
            if ".pdf" in full.lower() and "certificate.pdf" not in full.lower():
                found.append(full)
    return sorted(set(found))
