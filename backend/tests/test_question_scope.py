"""Regression for off-topic question routing and citation misuse."""
import json
from app import grounded_investigation as gi
from app.question_scope import classify_question, focus_terms
from app.scenarios import get_incident


def test_nonstop_meaning_is_not_disk_summary(monkeypatch):
    def forbidden(_):
        raise AssertionError('general concept must not call local model')
    monkeypatch.setattr(gi, '_call_local_model', forbidden)
    response = gi.investigate_with_corpus(
        'What do you mean by Nonstop?', get_incident('INC-DISK-001'), 'L23.08'
    )
    assert response['status'] == 'local_reference_explanation'
    assert response['model_attempts'] == 0
    assert response['question_scope'] == 'general_reference'
    assert 'fault-tolerant' in response['message'].lower()
    assert '$DATA03' not in response['message']
    assert response['claims'] == []
    assert response['state_change_executed'] is False


def test_glossary_asap_and_knowledge_tree(monkeypatch):
    monkeypatch.setattr(gi, '_call_local_model', lambda _: (_ for _ in ()).throw(
        AssertionError('glossary must not infer from disk metrics')))
    for term in ('What is ASAP?', 'Explain Knowledge Tree', 'Define EMS'):
        result = gi.investigate_with_corpus(
            term, get_incident('INC-PATH-002'), 'L23.08'
        )
        assert result['status'] == 'local_reference_explanation'
        assert 'unverified_training_glossary' in result['reference_origin']


def test_unknown_concept_does_not_hallucinate_from_fixture(monkeypatch):
    monkeypatch.setattr(gi, '_call_local_model', lambda _: (_ for _ in ()).throw(
        AssertionError('unknown concept must not call model')))
    result = gi.investigate_with_corpus(
        'What is imaginary HPE tool XYZ999?', get_incident('INC-DISK-001'), 'L23.08'
    )
    assert result['status'] == 'reference_required'
    assert result['claims'] == []
    assert result['model_attempts'] == 0


def test_unrelated_question_returns_no_incident_claims(monkeypatch):
    monkeypatch.setattr(gi, 'search_approved', lambda *args: {'matches': []})
    monkeypatch.setattr(gi, '_call_local_model', lambda _: (_ for _ in ()).throw(
        AssertionError('unrelated question must not call model')))
    result = gi.investigate_with_corpus(
        'Why is Kubernetes scheduler offline?',
        get_incident('INC-DISK-001'), 'L23.08'
    )
    assert result['status'] == 'insufficient_relevant_evidence'
    assert result['claims'] == []
    assert result['model_attempts'] == 0


def test_incident_questions_keep_incident_scope():
    for question in ('Why is disk growing?', 'What does the disk evidence show?',
                     'What happened?', 'Why did Pathway latency increase?',
                     'What is the current disk status?',
                     'What is wrong?', 'What is broken?', 'What is failing?',
                     'What are the symptoms?'):
        assert classify_question(question)[0] == 'incident'
    assert 'disk' in focus_terms('Why is disk growing?')


def test_incident_question_still_reaches_qwen_with_only_registered_ids(monkeypatch):
    monkeypatch.setattr(gi, 'search_approved', lambda *args: {'matches': []})
    calls = []
    def fake_model(payload):
        calls.append(payload)
        return json.dumps({'claims': [{
            'text': 'The synthetic disk event reports utilization reaching 81 percent.',
            'citations': ['SIM-EVT-103'],
        }]})
    monkeypatch.setattr(gi, '_call_local_model', fake_model)
    result = gi.investigate_with_corpus(
        'What does the disk evidence show?', get_incident('INC-DISK-001'), 'L23.08'
    )
    assert result['status'] == 'generated_unverified_citation_ids_checked'
    assert len(calls) == 1
    assert result['claims'][0]['citations'] == ['SIM-EVT-103']


def test_ambiguous_diagnostic_question_preserves_invalid_citation_retries(monkeypatch):
    """The incident route must invoke and reject fabricated citations twice."""
    monkeypatch.setattr(gi, 'search_approved', lambda *args: {'matches': []})
    calls = []
    def forged(_payload):
        calls.append(1)
        return json.dumps({'claims': [{
            'text': 'Synthetic evidence proves that all problems are resolved.',
            'citations': ['SIM-EVT-999'],
        }]})
    monkeypatch.setattr(gi, '_call_local_model', forged)
    result = gi.investigate_with_corpus(
        'What is wrong?', get_incident('INC-PATH-002'), 'L23.08'
    )
    assert len(calls) == 2
    assert result['status'] == 'model_output_rejected'
    assert result['validation_attempt_reasons'] == [
        'duplicate_or_unknown_citation', 'duplicate_or_unknown_citation'
    ]
    assert result['claims'] == []
    assert result['model_attempts'] == 2
    assert result['operational_action_authorized'] is False
    assert result['state_change_executed'] is False
