"""
Insight Agent router.

Numbers come from gold-table facts. Wording is assembled in code from those
facts and from retrieved sections. Unsupported questions return "I don't know".
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from db import is_sample_database
from schemas import APIResponse, InsightAnswerData, InsightCitation

PIPELINE_ROOT = Path(__file__).resolve().parents[2] / "pipeline"
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

from climateshield.insight.answer import ask  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
from src.rag.agent import answer as rag_answer  # noqa: E402

router = APIRouter(prefix="/insight", tags=["Insight Agent"])


class InsightQuestionBody(BaseModel):
    question: str = Field(min_length=1, max_length=1000)


class RAGQuestionBody(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    zone_id: Optional[str] = None
    temperature: float = 0.0


@router.post("/rag", response_model=APIResponse[dict])
def ask_rag(body: RAGQuestionBody) -> APIResponse[dict]:
    """Answer via Hybrid RAG Agent with zero-hallucination slot filling and live Gemini."""
    reply = rag_answer(question=body.question, zone_id=body.zone_id, temperature=body.temperature)
    return APIResponse(
        data=reply,
        generated_at=datetime.now(timezone.utc),
        is_sample=is_sample_database(),
    )


@router.post("/ask", response_model=APIResponse[InsightAnswerData])
def ask_insight(body: InsightQuestionBody) -> APIResponse[InsightAnswerData]:
    """Answer one question from the local index and the read-only warehouse."""
    reply = ask(body.question)
    data = InsightAnswerData(
        knows=bool(reply["knows"]),
        question=body.question,
        answer=str(reply["answer"]),
        citations=[InsightCitation(**item) for item in reply.get("citations") or []],
        row_ids=list(reply.get("row_ids") or []),
        numbers=[str(item) for item in reply.get("numbers") or []],
        limits=str(reply["limits"]),
        retriever=str(reply.get("retriever") or "tfidf-cosine"),
        index_sections=int(reply.get("index_sections") or 0),
    )
    return APIResponse(
        data=data,
        generated_at=datetime.now(timezone.utc),
        is_sample=is_sample_database(),
    )
