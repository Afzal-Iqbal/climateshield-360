"""Sparse TF-IDF retrieval over trusted sections.

The index is local JSON. It does not call an embedding API. Urdu and English
tokens are both kept because the tokenizer keeps Unicode letters.
"""

from __future__ import annotations

import math
import re
from typing import Iterable

TOKEN = re.compile(r"[^\W\d_]+", re.UNICODE)


def tokenize(text: str) -> list[str]:
    return [tok.lower() for tok in TOKEN.findall(text or "")]


def build_vectors(sections: list[dict]) -> dict:
    """Return idf weights and one sparse vector per section."""
    docs = [tokenize(section.get("text", "") + " " + section.get("title", "")) for section in sections]
    document_count = len(docs) or 1
    document_frequency: dict[str, int] = {}
    for tokens in docs:
        for token in set(tokens):
            document_frequency[token] = document_frequency.get(token, 0) + 1
    idf = {
        token: math.log((1.0 + document_count) / (1.0 + freq)) + 1.0
        for token, freq in document_frequency.items()
    }
    vectors = []
    for section, tokens in zip(sections, docs):
        counts: dict[str, int] = {}
        for token in tokens:
            counts[token] = counts.get(token, 0) + 1
        length = float(len(tokens) or 1)
        weights = {token: (count / length) * idf[token] for token, count in counts.items() if token in idf}
        norm = math.sqrt(sum(value * value for value in weights.values())) or 1.0
        vectors.append({"section_id": section["section_id"], "weights": weights, "norm": norm})
    return {"idf": idf, "vectors": vectors}


def _query_weights(question: str, idf: dict[str, float]) -> tuple[dict[str, float], float]:
    tokens = tokenize(question)
    counts: dict[str, int] = {}
    for token in tokens:
        if token in idf:
            counts[token] = counts.get(token, 0) + 1
    length = float(len(tokens) or 1)
    weights = {token: (count / length) * idf[token] for token, count in counts.items()}
    norm = math.sqrt(sum(value * value for value in weights.values())) or 1.0
    return weights, norm


def search(question: str, sections: list[dict], index: dict, limit: int = 4) -> list[dict]:
    """Return sections with a cosine score, highest first."""
    idf = index.get("idf") or {}
    by_id = {section["section_id"]: section for section in sections}
    query, query_norm = _query_weights(question, idf)
    if not query:
        return []
    scored = []
    for vector in index.get("vectors") or []:
        weights = vector.get("weights") or {}
        dot = sum(query[token] * weights[token] for token in query if token in weights)
        score = dot / (query_norm * float(vector.get("norm") or 1.0))
        section = by_id.get(vector.get("section_id"))
        if section is None or score <= 0:
            continue
        scored.append({**section, "score": round(float(score), 4)})
    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:limit]


def section_ids(sections: Iterable[dict]) -> list[str]:
    return [str(section["section_id"]) for section in sections]
