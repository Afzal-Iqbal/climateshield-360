"""Print document titles next to PDF links on the Insight Agent source pages."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from climateshield.ingest.http import fetch_url

PAGES = [
    "https://pmd.gov.pk/",
    "https://www.ndma.gov.pk/public/guidelines",
    "https://www.ndma.gov.pk/public/guidelines?page=2",
    "https://www.ndma.gov.pk/public/plans_by_category/2",
    "https://www.who.int/publications/i/item/WHO-EURO-2011-2510-42266-58691",
    "https://www.who.int/news-room/fact-sheets/detail/climate-change-heat-and-health",
]


def cards(html: str, page_url: str) -> None:
    print("PAGE", page_url)
    # NDMA cards usually put a title in a heading near a storage PDF link.
    blocks = re.split(r"<a[^>]+href=", html, flags=re.I)
    for block in blocks:
        match = re.match(r"""["']([^"']+)["']""", block)
        if not match:
            continue
        href = urljoin(page_url, match.group(1))
        if ".pdf" not in href.lower() and "bitstream" not in href.lower() and "/iris.who.int/" not in href.lower():
            continue
        text = re.sub(r"<[^>]+>", " ", block[:800])
        text = " ".join(text.split())[:180]
        print(" PDF", href)
        print("  NEAR", text)
    print("---")


def dump_pdfish(url: str) -> None:
    response = fetch_url(url, timeout=45, retries=2)
    print("FETCH", response.status, response.url or url, len(response.body))
    found = set(re.findall(r"https?://[^\s\"']+?(?:\.pdf|bitstream)[^\s\"']*", response.text, re.I))
    for item in sorted(found):
        print(" ABS", item[:260])
    hrefs = re.findall(r"""href=["']([^"']+)["']""", response.text, re.I)
    print("HREF COUNT", len(hrefs))
    for href in hrefs:
        if any(token in href.lower() for token in ("pdf", "flood", "advisory", "bulletin", "download", "iris")):
            print(" HREF", href[:220])
    print("---")


def main() -> None:
    dump_pdfish("https://www.who.int/publications/i/item/WHO-EURO-2011-2510-42266-58691")
    dump_pdfish("https://pmd.gov.pk/")
    for url in PAGES:
        response = fetch_url(url, timeout=45, retries=2)
        print("STATUS", response.status, len(response.body), response.headers.get("content-type", ""))
        cards(response.text, response.url or url)


if __name__ == "__main__":
    main()
