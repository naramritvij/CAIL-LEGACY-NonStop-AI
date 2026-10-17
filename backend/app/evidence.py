"""Typed-like evidence pack combining independently verified synthetic facts and manual pointers."""
from .analysis import build_analysis
from .references import search_sources
from .templates import preview_template


def build_evidence_pack(incident: dict) -> dict:
    analysis = build_analysis(incident)
    subject = 'disk capacity volume utilization' if incident['id'] == 'INC-DISK-001' else 'pathway service latency'
    sources = search_sources(subject, limit=3)
    return {
        'incident_id': incident['id'],
        'synthetic': True, 'source_verification': 'official_general_reference_only',
        'root_cause_status': analysis['root_cause_status'],
        'verified_synthetic_observations': analysis['findings'],
        'hypotheses_unverified': analysis['hypotheses_unverified'],
        'missing_evidence': analysis['missing_evidence'] + [
            'Original subsystem identifier and operator message number',
            'NonStop software release and authorized diagnostic procedure',
        ],
        'sources': sources['hits'],
        'official_message_match': None,
        'official_message_match_status': 'not_possible_with_synthetic_event_ids',
        'operator_checks': preview_template('read_operator_message_header', incident),
        'release_verified': False,
        'evidence_limitations': (
            'SIM-EVT identifiers are invented; documentation pointers describe general mechanisms '
            'and do not establish a message-specific diagnosis or real system applicability.'),
    }
