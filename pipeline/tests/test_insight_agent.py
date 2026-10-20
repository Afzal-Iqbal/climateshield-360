"""Insight Agent honesty checks. These do not call a language model."""

from __future__ import annotations

import re

from climateshield.insight.answer import compose_answer
from climateshield.insight.retrieve import build_vectors, search

NUMBER = re.compile(r"\d+(?:\.\d+)?")


def _sections():
    sections = [
        {
            "section_id": "stats|city_stats|Karachi",
            "title": "Karachi weather statistics",
            "publisher": "Open-Meteo",
            "text": "Karachi weather statistics cover maximum temperature and total rainfall.",
            "row_ids": ["city_stats|Karachi"],
            "parsed": True,
        },
        {
            "section_id": "doc|ndma.pdf",
            "title": "NDMA weather advisory",
            "publisher": "NDMA",
            "text": "The PDF text was not parsed, so this agent cannot quote the document.",
            "row_ids": ["doc|ndma.pdf"],
            "parsed": False,
        },
    ]
    index = build_vectors(sections)
    return sections, index


def _karachi_fact():
    return {
        "table": "weather_city_stats",
        "row_id": "city_stats|Karachi",
        "label": "Karachi weather statistics",
        "fields": {
            "maximum_temperature_c": "46.9",
            "total_rainfall_mm": "2776",
            "rainy_hours": "1799",
            "hours_at_or_above_40c": "12",
        },
    }


def test_supported_answer_uses_only_fact_numbers():
    sections, index = _sections()
    retrieved = search("Karachi heat temperature", sections, index)
    reply = compose_answer("How hot has Karachi been?", retrieved, [_karachi_fact()])
    assert reply["knows"] is True
    assert "city_stats|Karachi" in reply["row_ids"]
    assert "46.9" in reply["answer"]
    leaked = [token for token in NUMBER.findall(reply["answer"]) if token not in set(reply["numbers"])]
    assert leaked == []


def test_unknown_question_refuses():
    reply = compose_answer("Who won the cricket world cup?", [], [])
    assert reply["knows"] is False
    assert reply["answer"].startswith("I don't know")
    assert reply["numbers"] == []


def test_mortality_question_refuses_even_with_a_city():
    reply = compose_answer("How many people died in Karachi floods?", [], [_karachi_fact()])
    assert reply["knows"] is False
    assert "46.9" not in reply["answer"]


def test_misleading_number_is_not_repeated():
    sections, index = _sections()
    retrieved = search("Karachi temperature", sections, index)
    reply = compose_answer("Is Karachi maximum temperature 5000 C?", retrieved, [_karachi_fact()])
    assert "5000" not in reply["answer"]
    assert "46.9" in reply["answer"]


def test_official_document_is_quoted_without_new_numbers():
    section = {
        "section_id": "official|who_heat|1",
        "title": "Heat and health",
        "publisher": "WHO",
        "text": "Heat stress can cause exhaustion. Drink water and rest in the shade. Seek medical care if someone is confused.",
        "row_ids": [],
        "parsed": True,
        "kind": "official_document",
        "score": 0.4,
    }
    reply = compose_answer("What does WHO say about heat illness?", [section], [])
    assert reply["knows"] is True
    assert "Drink water" in reply["answer"]
    assert reply["numbers"] == []
    assert NUMBER.findall(reply["answer"]) == []
    assert reply["citations"][0]["publisher"] == "WHO"


def test_unparsed_pdf_question_says_it_does_not_know():
    sections, index = _sections()
    retrieved = search("NDMA weather advisory pdf", sections, index)
    reply = compose_answer("What did the NDMA advisory PDF say about rain?", retrieved, [])
    assert reply["knows"] is False
    assert "not parsed" in reply["answer"]
