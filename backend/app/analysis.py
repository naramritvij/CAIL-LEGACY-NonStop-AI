"""Deterministic observed relationships; never claim correlation proves a cause."""

def build_analysis(incident):
    evidence = incident['events']
    nodes = [{'id': e['id'], 'type': 'observation', 'label': e['message'],
              'time': e['time'], 'source': e['source']} for e in evidence]
    nodes.append({'id': incident['id'], 'type': 'incident', 'label': incident['title']})
    edges = [{'from': e['id'], 'to': incident['id'], 'type': 'supports_context',
              'causal': False} for e in evidence]
    if incident['id'] == 'INC-DISK-001':
        findings = [
            {'statement': 'Utilization rose from 72% to 81%',
             'kind': 'observed_trend', 'evidence_ids': ['SIM-EVT-101', 'SIM-EVT-103']},
            {'statement': 'The synthetic 80% warning threshold was crossed',
             'kind': 'observed_threshold', 'evidence_ids': ['SIM-EVT-103']},
        ]
        recommended = ['inspect_disk_growth', 'inspect_events']
    else:
        findings = [
            {'statement': 'A synthetic service instance stopped responding after elevated latency',
             'kind': 'temporal_correlation', 'evidence_ids': ['SIM-EVT-201', 'SIM-EVT-202']},
        ]
        recommended = ['inspect_events']
    assert all(set(f['evidence_ids']).issubset({e['id'] for e in evidence}) for f in findings)
    return {
        'incident_id': incident['id'], 'synthetic': True,
        'root_cause': None, 'root_cause_status': 'not_established',
        'findings': findings, 'hypotheses_unverified': incident['hypotheses'],
        'missing_evidence': incident['unknowns'], 'nodes': nodes, 'edges': edges,
        'recommended_read_only_actions': recommended,
        'limitations': 'This graph records scenario facts and relationships, not proven causation.'
    }
