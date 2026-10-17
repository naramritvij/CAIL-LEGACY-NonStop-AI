"""Changed-incident knowledge-transfer exercises with a reproducible safety rubric.

A simulated scoring benchmark, not a measure of real operator competence.
No commands are executed and attempts are not persisted.
"""
from __future__ import annotations
from .policy import evaluate

_VARIANTS = {
    'INC-DISK-001': {
        'id': 'TRANSFER-DISK-A', 'title': 'The next shift: capacity pressure returns',
        'situation': ('A synthetic disk volume rises from 79% to 89% over two hours after a '
                      'change in application workload. The owner and retention of the fastest growing '
                      'files have not been verified.'),
        'events': [
            {'id': 'TRAIN-EVT-301', 'observation': 'Disk utilization 79% at beginning of shift'},
            {'id': 'TRAIN-EVT-302', 'observation': 'Disk utilization 89% two hours later'},
        ],
        'unknowns': ['File ownership', 'Retention policy', 'Dependent applications'],
        'safe_first_action': 'inspect_disk_growth',
        'required_evidence_ids': ['TRAIN-EVT-301', 'TRAIN-EVT-302'],
        'required_concepts': ['ownership', 'retention'],
    },
    'INC-PATH-002': {
        'id': 'TRANSFER-PATH-A', 'title': 'Another shift: service latency and reduced availability',
        'situation': ('A synthetic payment service exhibits elevated response latency, followed by '
                      'an instance becoming non-responsive. Related process and dependency status '
                      'have not been verified.'),
        'events': [
            {'id': 'TRAIN-EVT-401', 'observation': 'Response time rose above prior baseline'},
            {'id': 'TRAIN-EVT-402', 'observation': 'One service instance became non-responsive'},
        ],
        'unknowns': ['Process state', 'Dependent service health', 'Primary/backup state'],
        'safe_first_action': 'inspect_events',
        'required_evidence_ids': ['TRAIN-EVT-401', 'TRAIN-EVT-402'],
        'required_concepts': ['process', 'dependency'],
    },
}


def make_challenge(lesson: dict) -> dict | None:
    if not lesson or lesson.get('status') != 'approved':
        return None
    case = _VARIANTS.get(lesson.get('incident_id'))
    if not case:
        return None
    return {
        'challenge_id': case['id'], 'based_on_approved_lesson_id': lesson['id'],
        'original_incident_id': lesson['incident_id'], 'title': case['title'],
        'situation': case['situation'], 'events': case['events'],
        'unknowns': case['unknowns'],
        'task': 'Choose the safest first diagnostic action, cite observed events, and name prerequisites.',
        'synthetic': True, 'lesson_review_status': 'approved',
        'rubric_disclosed_after_assessment': True,
        'limitations': ('A reviewer accepted the lesson within the demo. The exercise is a '
                        'synthetic evaluation, not verified human skill transfer.'),
    }


def grade_transfer(lesson: dict, incident: dict, action_id: str, evidence_ids: list[str],
                   prerequisites: list[str], reasoning: str) -> dict | None:
    challenge = make_challenge(lesson)
    if not challenge:
        return None
    case = _VARIANTS[lesson['incident_id']]
    policy = evaluate(action_id, incident)
    safe = bool(policy['allowed'])
    optimal = safe and action_id == case['safe_first_action']
    safety_points = 35 if optimal else (15 if safe else 0)
    required = set(case['required_evidence_ids'])
    provided = set(evidence_ids)
    unsupported = sorted(provided - {e['id'] for e in case['events']})
    supported = sorted(provided & required)
    missing = sorted(required - provided)
    evidence_points = round(25 * len(supported) / len(required)) if not unsupported else 0
    provided_concepts = ' '.join(prerequisites).lower()
    identified = [concept for concept in case['required_concepts'] if concept in provided_concepts]
    missing_concepts = [concept for concept in case['required_concepts'] if concept not in provided_concepts]
    prereq_points = round(25 * len(identified) / len(case['required_concepts']))
    reason_terms = reasoning.lower()
    rationale_points = 15 if (len(reasoning.strip()) >= 20 and any(
        word in reason_terms for word in ('because', 'before', 'verify', 'risk', 'evidence', 'unknown'))) else 0
    raw = safety_points + evidence_points + prereq_points + rationale_points
    # Essential safety and evidence requirements are *gates*, not optional
    # point bonuses. The displayed score must never imply a pass when a
    # prerequisite, required citation, or correct read-only first action is absent.
    unmet_gates = []
    if not optimal:
        unmet_gates.append('correct_safe_first_action')
    if unsupported:
        unmet_gates.append('no_fabricated_evidence')
    if missing:
        unmet_gates.append('complete_required_evidence')
    if missing_concepts:
        unmet_gates.append('complete_prerequisites')
    score_cap = 20 if not safe else (74 if unmet_gates else None)
    score = min(raw, score_cap) if score_cap is not None else raw
    return {
        'challenge_id': case['id'], 'lesson_id': lesson['id'], 'incident_id': incident['id'],
        'score': score, 'max_score': 100,
        'raw_score_before_safety_gates': raw, 'score_cap_applied': score_cap,
        'unmet_mandatory_conditions': unmet_gates,
        'passed': score >= 75 and not unmet_gates,
        'safety': {'action_id': action_id, 'allowed': safe, 'optimal_read_only_action': optimal,
                   'points': safety_points, 'policy_reason': policy['reason'],
                   'unsafe_score_cap_applied': not safe},
        'evidence': {'points': evidence_points, 'supported': supported, 'missing': missing,
                     'unsupported': unsupported},
        'prerequisites': {'points': prereq_points, 'identified': identified, 'missing': missing_concepts},
        'rationale': {'points': rationale_points, 'has_explanation_cue': bool(rationale_points)},
        'state_change_executed': False, 'attempt_persisted': False,
        'score_method': 'deterministic_synthetic_rubric',
        'limitations': ('Score demonstrates responses to this authored training case only. '
                        'It is not an independently validated measure of operator performance '
                        'or proof of reduced outages.'),
    }
