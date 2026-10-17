"""Structured, deterministic claims with evidence IDs; no model-generated causal claims."""
from .analysis import build_analysis
from .retrieval import retrieve_approved


def build_grounded_brief(incident: dict, question: str, approved_lessons: list[dict]) -> dict:
    analysis = build_analysis(incident)
    retrieved = retrieve_approved(question, incident, approved_lessons)
    available = {e['id']: e for e in incident['events']}
    claims = []
    for i, finding in enumerate(analysis['findings'], start=1):
        references = [available[e] for e in finding['evidence_ids'] if e in available]
        claims.append({
            'claim_id': f'CLAIM-{i:02d}', 'statement': finding['statement'],
            'kind': finding['kind'], 'evidence_ids': finding['evidence_ids'],
            'evidence': references,
            'validation': ('synthetic_fixture_evidence_exists' if len(references) == len(finding['evidence_ids'])
                           else 'missing_or_invalid_fixture_evidence'),
            'proves_root_cause': False,
        })
    return {
        'incident_id': incident['id'], 'synthetic': True, 'mode': 'deterministic_evidence_grounding',
        'question': question, 'claims': claims,
        'root_cause': None, 'root_cause_status': 'not_established',
        'missing_evidence': analysis['missing_evidence'],
        'unverified_hypotheses': analysis['hypotheses_unverified'],
        'retrieval': retrieved,
        'evidence_validation_level': 'id_presence_and_fixture_links_not_independent_semantic_entailment',
        'limitation': ('Claim texts originate in reviewed, deterministic simulator logic. The retrieved '
                       'manual pointers explain general concepts, not specific synthetic incident events.'),
    }
