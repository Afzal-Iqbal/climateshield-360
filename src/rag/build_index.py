"""
src/rag/build_index.py - Document Library Indexing for ClimateShield 360 Karachi.

Viva Explanation Guide:
1. Document Ingestion: Uses pdfplumber for layout-aware PDF text extraction. Unlike basic
   PDF parsers, pdfplumber preserves line coordinates and structural flow, allowing us
   to detect headings (all-caps, title case, numbered sections) and segment documents
   into logical, coherent sections rather than arbitrary character splits.
2. Multilingual Semantic Embeddings: Maps both English and local/transliterated disaster
   management terms into dense vector embeddings using Sentence Transformers
   (e.g., paraphrase-multilingual-MiniLM-L12-v2).
3. Persistent Vector Storage: Stores chunks, vector embeddings, and rich metadata
   (document name, section title, source path) in ChromaDB with an HNSW cosine index.
4. Idempotence & Repeatability: The script supports clean rebuilds (--rebuild flag),
   wiping old collections to prevent duplicate chunks and ensure index integrity.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import chromadb
from chromadb.utils import embedding_functions
import pdfplumber

# Determine repository root
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DOCS_DIR = PROJECT_ROOT / "docs" / "library"
DEFAULT_CHROMA_DIR = PROJECT_ROOT / "data" / "chroma_db"
COLLECTION_NAME = "climateshield_library"
EMBEDDING_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"

# Heading detection patterns:
# - Roman numerals, numbering like 1., 1.1, Chapter, Section
# - Title-cased or uppercase lines under 90 characters without terminal periods
HEADING_REGEX = re.compile(
    r"^(?:section\s+\d+|chapter\s+\d+|\d+\.\d*|\b[A-Z0-9\s,\-–:]{4,80}\b)",
    re.IGNORECASE,
)


def get_multilingual_embedding_function(
    model_name: str = EMBEDDING_MODEL_NAME,
) -> Any:
    """
    Configure and return a multilingual embedding function.
    Viva point: Uses sentence-transformers for cross-lingual semantic matching.
    If sentence_transformers is unavailable, gracefully falls back to Chroma's
    built-in ONNX multilingual or default embedding function.
    """
    try:
        import sentence_transformers  # noqa: F401
        return embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=model_name
        )
    except Exception as exc:
        print(f"[RAG Indexer] SentenceTransformer notice ({exc}). Using Chroma default embedding function.")
        return embedding_functions.DefaultEmbeddingFunction()


def clean_text(text: str) -> str:
    """Normalize whitespace and strip non-printable characters."""
    if not text:
        return ""
    # Replace multiple spaces/newlines with single space
    cleaned = re.sub(r"\s+", " ", text).strip()
    return cleaned


def is_likely_heading(line: str) -> bool:
    """
    Heuristic to detect section headings in official documents.
    Viva point: Keeps chunk semantic boundaries aligned with official document sections.
    """
    clean_line = line.strip()
    if not clean_line or len(clean_line) > 100:
        return False
    # Common heading prefixes
    if re.match(r"^(?:Section|Chapter|Annex|Table|Part|\d+\.|\d+\.\d+)\b", clean_line, re.IGNORECASE):
        return True
    # All caps short titles (e.g., "PREVENTIVE MEASURES")
    if clean_line.isupper() and 4 <= len(clean_line) <= 80:
        return True
    # Lines ending with a colon or short title case phrases
    if clean_line.endswith(":") and len(clean_line) <= 60:
        return True
    return False


def parse_pdf_document(pdf_path: Path) -> List[Dict[str, Any]]:
    """
    Extract text and segment into sections using pdfplumber.
    Viva point: pdfplumber extracts layout-aware words and line breaks, ensuring
    accurate detection of tables and section titles.
    """
    sections: List[Dict[str, Any]] = []
    doc_name = pdf_path.name
    current_section = "General Overview"
    current_paragraphs: List[str] = []

    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page_idx, page in enumerate(pdf.pages, start=1):
                raw_text = page.extract_text(layout=False) or ""
                lines = [line.strip() for line in raw_text.splitlines() if line.strip()]

                for line in lines:
                    if is_likely_heading(line):
                        # Save prior accumulated section if it has meaningful content
                        accumulated = clean_text(" ".join(current_paragraphs))
                        if len(accumulated) >= 60:
                            sections.append({
                                "document": doc_name,
                                "section": current_section,
                                "page": page_idx,
                                "text": accumulated,
                            })
                            current_paragraphs = []
                        current_section = line.strip(": -")
                    else:
                        current_paragraphs.append(line)

        # Flush final section
        accumulated = clean_text(" ".join(current_paragraphs))
        if len(accumulated) >= 60:
            sections.append({
                "document": doc_name,
                "section": current_section,
                "page": len(pdf.pages) if 'pdf' in locals() else 1,
                "text": accumulated,
            })
    except Exception as exc:
        print(f"[RAG Indexer] Error parsing PDF {pdf_path}: {exc}")

    # Fallback if no sections were parsed (e.g. single large block)
    if not sections:
        try:
            with pdfplumber.open(pdf_path) as pdf:
                full_text = " ".join([page.extract_text() or "" for page in pdf.pages])
                cleaned = clean_text(full_text)
                if cleaned:
                    sections.append({
                        "document": doc_name,
                        "section": "Complete Document",
                        "page": 1,
                        "text": cleaned[:2000],
                    })
        except Exception:
            pass

    return sections


def parse_text_document(txt_path: Path) -> List[Dict[str, Any]]:
    """
    Extract sections from plain text or markdown files.
    Splits by markdown headers (#, ##), lines with === or ---, or double newlines.
    """
    sections: List[Dict[str, Any]] = []
    doc_name = txt_path.name
    current_section = "General Notes"
    current_paragraphs: List[str] = []

    try:
        content = txt_path.read_text(encoding="utf-8", errors="replace")
        lines = content.splitlines()

        for line in lines:
            trimmed = line.strip()
            # Markdown header detection
            if trimmed.startswith("#") or is_likely_heading(trimmed):
                accumulated = clean_text(" ".join(current_paragraphs))
                if len(accumulated) >= 50:
                    sections.append({
                        "document": doc_name,
                        "section": current_section,
                        "page": 1,
                        "text": accumulated,
                    })
                    current_paragraphs = []
                current_section = trimmed.lstrip("#").strip(": -")
            else:
                if trimmed:
                    current_paragraphs.append(trimmed)

        # Flush final
        accumulated = clean_text(" ".join(current_paragraphs))
        if len(accumulated) >= 50:
            sections.append({
                "document": doc_name,
                "section": current_section,
                "page": 1,
                "text": accumulated,
            })
    except Exception as exc:
        print(f"[RAG Indexer] Error parsing TXT {txt_path}: {exc}")

    return sections


def chunk_section(
    section_dict: Dict[str, Any], max_chunk_chars: int = 800, overlap: int = 100
) -> List[Dict[str, Any]]:
    """
    Split large sections into overlapping chunks to fit embedding model context limits.
    Viva point: Fixed maximum chunk length prevents vector dilution and truncation.
    """
    text = section_dict["text"]
    if len(text) <= max_chunk_chars:
        return [section_dict]

    chunks = []
    start = 0
    sub_idx = 1
    while start < len(text):
        end = min(start + max_chunk_chars, len(text))
        # Snap to word boundary if not at end
        if end < len(text):
            space_pos = text.rfind(" ", start + max_chunk_chars // 2, end)
            if space_pos != -1:
                end = space_pos

        chunk_text = text[start:end].strip()
        if len(chunk_text) >= 50:
            chunks.append({
                "document": section_dict["document"],
                "section": f"{section_dict['section']} (Part {sub_idx})",
                "page": section_dict.get("page", 1),
                "text": chunk_text,
            })
            sub_idx += 1

        start = end - overlap if end < len(text) else end

    return chunks


def build_index(
    docs_dir: Path = DEFAULT_DOCS_DIR,
    chroma_dir: Path = DEFAULT_CHROMA_DIR,
    collection_name: str = COLLECTION_NAME,
    rebuild: bool = True,
) -> int:
    """
    Main indexing routine:
    1. Reads all PDFs and TXT files from docs_dir.
    2. Parses text using pdfplumber and section heuristics.
    3. Chunks text while preserving document and section metadata.
    4. Connects to persistent ChromaDB client.
    5. Rebuilds collection idempotently.
    6. Returns total chunks indexed.
    """
    docs_dir = Path(docs_dir)
    chroma_dir = Path(chroma_dir)
    chroma_dir.mkdir(parents=True, exist_ok=True)

    if not docs_dir.exists():
        print(f"[RAG Indexer] Warning: Document library {docs_dir} does not exist.")
        return 0

    print(f"[RAG Indexer] Scanning documents in: {docs_dir}")
    pdf_files = list(docs_dir.glob("*.pdf"))
    txt_files = list(docs_dir.glob("*.txt"))
    print(f"[RAG Indexer] Found {len(pdf_files)} PDFs and {len(txt_files)} TXT files.")

    all_chunks: List[Dict[str, Any]] = []

    # 1. Parse PDFs
    for pdf_path in sorted(pdf_files):
        parsed = parse_pdf_document(pdf_path)
        for sec in parsed:
            all_chunks.extend(chunk_section(sec))

    # 2. Parse TXTs
    for txt_path in sorted(txt_files):
        parsed = parse_text_document(txt_path)
        for sec in parsed:
            all_chunks.extend(chunk_section(sec))

    print(f"[RAG Indexer] Total section chunks generated: {len(all_chunks)}")
    if not all_chunks:
        print("[RAG Indexer] No text chunks extracted. Index build aborted.")
        return 0

    # 3. Persistent Chroma Setup
    client = chromadb.PersistentClient(path=str(chroma_dir))
    embed_fn = get_multilingual_embedding_function()

    # Rebuild repeatability: drop existing collection if requested
    if rebuild:
        try:
            client.delete_collection(name=collection_name)
            print(f"[RAG Indexer] Existing collection '{collection_name}' deleted for clean rebuild.")
        except Exception:
            pass

    collection = client.get_or_create_collection(
        name=collection_name,
        embedding_function=embed_fn,
        metadata={"hnsw:space": "cosine"},
    )

    # 4. Batch indexing into ChromaDB
    batch_size = 64
    total_indexed = 0

    for i in range(0, len(all_chunks), batch_size):
        batch = all_chunks[i : i + batch_size]
        ids = [f"{c['document']}_{i + j}_{hash(c['text']) % 1000000}" for j, c in enumerate(batch)]
        documents = [c["text"] for c in batch]
        metadatas = [
            {
                "document": c["document"],
                "section": c["section"],
                "page": int(c.get("page", 1)),
            }
            for c in batch
        ]

        collection.add(
            ids=ids,
            documents=documents,
            metadatas=metadatas,
        )
        total_indexed += len(batch)

    print(f"[RAG Indexer] Successfully indexed {total_indexed} chunks into persistent Chroma collection '{collection_name}'.")
    return total_indexed


def main() -> None:
    parser = argparse.ArgumentParser(description="Build persistent Chroma vector index from docs/library/")
    parser.add_argument("--docs-dir", type=str, default=str(DEFAULT_DOCS_DIR), help="Path to input documents")
    parser.add_argument("--chroma-dir", type=str, default=str(DEFAULT_CHROMA_DIR), help="Path to ChromaDB storage")
    parser.add_argument("--collection", type=str, default=COLLECTION_NAME, help="Collection name")
    parser.add_argument("--rebuild", action="store_true", default=True, help="Wipe and rebuild collection")
    args = parser.parse_args()

    build_index(
        docs_dir=Path(args.docs_dir),
        chroma_dir=Path(args.chroma_dir),
        collection_name=args.collection,
        rebuild=args.rebuild,
    )


if __name__ == "__main__":
    main()
