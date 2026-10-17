"""Read-only consolidated workspace for Maggie's LEGACY incident UI.

Assembles existing independently tested simulator, safety, review and training
contracts. This is a SYNTHETIC read model: it never calls Ollama, writes lessons,
approves actions or executes commands. AI investigation remains a distinct POST.
"""
from __future__ import annotations

from .analysis import build_analysis
from .grounding import build_grounded_brief
from .legacy_tree import build_legacy_tree
from .policy import ACTIONS, evaluate
from .retrieval import retrieve_approved
from .storage import list_lessons
from .training import make_challenge


def build_workspace(incident: dict, question: str) -> dict:
    """Return a bounded, consistent read-only representation of one incident."""
    approved = list_lessons(incident_id=incident['id'], status='approved')
    analysis = build_analysis(incident)
    brief = build_grounded_brief(incident, question, approved)
    retrieved = retrieve_approved(question, incident, approved, max_lessons=3, max_sources=3)
    tree = build_legacy_tree(incident_id=incident['id'])

    # Authorization in this response is permission to PREVIEW locally simulated
    # evidence only. It does NOT authorize command execution.
    previews = [
        evaluate(action_id, incident)
        for action_id in ACTIONS
    ]
    # Gate training links on BOTH reviewer approval and event-provenance validity.
    # An approved SQLite row with tampered event IDs must not unlock training.
    valid_tree_ids = {node['id'] for node in tree['nodes']}
    challenges = []
    for lesson in approved:
        if lesson['id'] not in valid_tree_ids:
            continue
        challenge = make_challenge(lesson)
        if challenge is not None:
            challenges.append({
                'lesson_id': lesson['id'],
                'challenge_id': challenge['challenge_id'],
                'synthetic': True,
                'assessment_persisted': False,
                'endpoint': '/api/v1/training/challenges/' + lesson['id'],
            })

    return {
        'mode': 'synthetic_read_only_incident_workspace',
        'synthetic': True,
        'incident_id': incident['id'],
        'incident': incident,
        'analysis': analysis,
        'grounded_brief': brief,
        'root_cause_status': 'not_established',
        'missing_evidence': list(incident['unknowns']),
        'sentinel_previews': previews,
        'sentinel_independent_of_ai': True,
        'reviewed_knowledge': {
            'review_scope': 'approved_only',
            'relevant_approved_lessons': retrieved['approved_lessons'],
            'official_document_pointers': retrieved['official_document_pointers'],
            'source_authenticity_verified': False,
        },
        'legacy_tree': tree,
        'training_challenges': challenges,
        'shift_handover_excerpt': {
            'incident_id': incident['id'],
            'unresolved': True,
            'missing_evidence': list(incident['unknowns']),
            'synthetic': True,
            'operator_signed': False,
        },
        'ai_investigation': {
            'endpoint': '/api/v1/investigate/grounded',
            'method': 'POST',
            'status': 'not_requested',
            'needs_separate_model_call': True,
            'claims_semantically_verified': False,
        },
        'operational_action_authorized': False,
        'state_change_executed': False,
        'limitations': (
            'Synthetic educational data only. Preview allowance is not execution '
            'authorization. Citation IDs do not establish claim truth, approved '
            'demo lessons do not verify expert identity, and the Legacy Tree '
            'does not measure real-world reuse or skill transfer.'
        ),
    }
