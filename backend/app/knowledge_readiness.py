"""Non-sensitive read-only readiness status for the local knowledge-transfer workflow."""
from __future__ import annotations

import hmac
import os
from datetime import datetime, timezone

from .storage import connect, list_lessons
from .corpus import corpus_status

SUPPORTED_TRAINING_INCIDENTS = frozenset(("INC-DISK-001", "INC-PATH-002"))


def readiness() -> dict:
    """Report prerequisites without creating lessons or exposing queue / secrets."""
    expert = os.getenv("LEGACY_EXPERT_KEY", "")
    reviewer = os.getenv("LEGACY_REVIEWER_KEY", "")
    expert_ready = len(expert) >= 20
    reviewer_ready = len(reviewer) >= 20
    distinct = not (expert and reviewer and hmac.compare_digest(expert, reviewer))
    storage_ready = False
    approved_sources = 0
    approved_lessons = 0
    supported_challenges = 0
    try:
        with connect() as db:
            db.execute("SELECT 1").fetchone()
        approved_sources = corpus_status()["document_counts"].get("approved", 0)
        lessons = list_lessons(status="approved")
        approved_lessons = len(lessons)
        supported_challenges = sum(item["incident_id"] in SUPPORTED_TRAINING_INCIDENTS for item in lessons)
        storage_ready = True
    except (OSError, ValueError, RuntimeError):
        storage_ready = False
    return {
        "mode": "local_training_only",
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "storage_ready": storage_ready,
        "expert_key_configured": expert_ready and distinct,
        "reviewer_key_configured": reviewer_ready and distinct,
        "independent_reviewer_configured": expert_ready and reviewer_ready and distinct,
        "approved_source_count": approved_sources,
        "approved_lesson_count": approved_lessons,
        "available_apprentice_challenges": supported_challenges,
        "ready_for_local_review": storage_ready and expert_ready and reviewer_ready and distinct,
        "real_mentor_identity_verified": False,
        "production_ready": False,
        "limitations": "A local key and SQLite do not provide production SSO, trusted human identities, source authentication, mentoring assignments, or operator certification.",
    }
