"""
Insight Agent router.

Numbers come from gold-table facts. Wording is assembled in code from those
facts and from retrieved sections. Unsupported questions return "I don't know".
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel, Field

from db import is_sample_database
from schemas import APIResponse, InsightAnswerData, InsightCitation

PIPELINE_ROOT = Path(__file__).resolve().parents[2] / "pipeline"
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

from climateshield.insight.answer import ask  # noqa: E402

router = APIRouter(prefix="/insight", tags=["Insight Agent"])


class InsightQuestionBody(BaseModel):
    question: str = Field(min_length=1, max_length=1000)


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
