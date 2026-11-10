"""Run checked-in answer cases through isolated, authenticated workspace HTTP."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import re
from statistics import median
import subprocess
import tempfile
import time
from urllib.parse import quote, urlsplit
from urllib.request import urlopen
from uuid import uuid4

from verify_knowledge_transfer import ROOT, fixture_users, workspace_api
from app.transfer_demo import OperatorSession, require, review_document

SCORING_VERSION = 3
MODEL = 'qwen3:4b-instruct'
PLANS = {
    'INC-DISK-001': [('sample_disk', (101,)), ('verify_retention', (101, 102)), ('disk_handoff', (101, 103))],
    'INC-PATH-002': [('compare_latency', (201,)), ('verify_pathway', (201, 202)), ('dependency_handoff', (202, 203))],
    'INC-FIN-HW-003': [('compare_capacity', (301,)), ('preserve_sequence', (301, 303)), ('payment_handoff', (304, 305))],
    'INC-TMF-004': [('sample_audit', (401,)), ('third_audit_sample', (401, 402)), ('audit_handoff', (401, 402, 403))],
}
GUIDANCE = {
    'tmf': ('TMFCOM STATUS TMF', 'For this synthetic audit timestamp check, confirm the system identity and record the timestamp. '
           'Compare a fresh authorized read-only sample before escalating. A single observation leaves the cause uncertain.'),
    'pathway': ('PATHCOM STATUS PATHWAY', 'For this synthetic Pathway check, compare the primary and backup service state and '
                'dependency availability. Record the affected scope and escalate through the owner when service state is unclear.'),
    'disk': ('SCF STATUS DISK', 'For this synthetic $DATA03 storage ownership check, verify ownership, dependencies and retention policy '
             'before escalating an observed utilization breach. Keep the reading and its timestamp with the handoff.'),
}


MODEL_GUIDANCE = {
    'freshness': ('MEASCOM STATUS', 'This synthetic evidence procedure accepts samples up to 90 seconds old. '
                  'Keep the original timestamp, report an expired sample as stale, and request a new read. '
                  'If a record has no timestamp, report freshness as unknown.'),
    'scope': ('SCF STATUS DISK', 'This synthetic scope procedure records both the system identifier and volume name. '
              'A matching volume name on another system has separate evidence. Use same-unit samples for comparison. '
              'If the scope cannot be confirmed, ask the source owner for clarification.'),
    'handoff': ('PATHCOM STATUS SERVER', 'This synthetic shift handoff includes the impacted service, first observation time and evidence IDs. '
                'Label inferred causes as hypotheses. Include the last known authorized check and the owner for the next read. '
                'A report of recovery needs a fresh confirming observation.'),
    'edition': ('TACL SHOW DEFINE', 'This synthetic document procedure records the manual edition and exact excerpt. '
                'A superseding source triggers review of dependent guidance. The retained historical edition documents earlier reasoning. '
                'For an unknown target release, state that applicability requires verification.'),
}


def fixture(session, reviewer, key, command, text, *, approve=True):
    source = session.call('/documents', {
        'title': 'Evaluation source ' + key,
        'topic': 'Synthetic evaluation', 'content': command + '. ' + text,
    }, status=201)
    review_document(session, reviewer, source['id'])
    catalog = session.call('/knowledge/catalog?q=' + quote(command))
    concept = next(item['id'] for item in catalog['concepts'] if item['label'] == command)
    citation = next(item['id'] for item in catalog['citations'] if item['document_id'] == source['id'])
    note = session.call('/knowledge/notes', {
        'title': 'Evaluation guidance ' + key, 'category': 'procedure',
        'content': command + '. ' + text, 'topic': 'Synthetic evaluation',
        'concept_ids': [concept], 'citations': [{'citation_id': citation, 'relation': 'cites'}],
        'sign_as_current_user': True,
    }, status=201)
    if approve:
        review_document(session, reviewer, note['id'])
    return note['id'], source['id']


def seed_guidance(expert, reviewer, *, include_model_fixtures=False):
    fixtures = GUIDANCE | MODEL_GUIDANCE if include_model_fixtures else GUIDANCE
    notes = {key: fixture(expert, reviewer, key, command, text)[0] for key, (command, text) in fixtures.items()}
    draft, _ = fixture(expert, reviewer, 'draft', 'TMFCOM STATUS TMF',
                       'Synthetic unpublished obsidian-only-draft and ember-draft-marker procedures.', approve=False)
    stale, previous = fixture(expert, reviewer, 'retired', 'TMFCOM STATUS TMF',
                              'Synthetic deprecated sunflower-retired-edition and copper-legacy-marker instructions.')
    replacement = expert.call('/documents', {
        'title': 'Evaluation replacement edition', 'topic': 'Synthetic evaluation',
        'content': 'TMFCOM STATUS TMF. This newer synthetic reference calls for checking the timestamp and source identity.',
    }, status=201)
    expert.call('/knowledge/editions', {'newer_id': replacement['id'], 'previous_id': previous}, status=201)
    review_document(expert, reviewer, replacement['id'])
    return notes, draft, stale


def ask(session, conversation, question, request_id=None):
    return session.call('/conversations/' + conversation + '/messages',
                        {'question': question, 'request_id': request_id or uuid4().hex})


def prepare_rehearsals(learner, outsider):
    threads, completed = {}, {}
    for case_id, plan in PLANS.items():
        start = {'case_id': case_id, 'request_id': uuid4().hex}
        run = learner.call('/rehearsals', start, status=201)
        path = '/rehearsals/' + run['run_id']
        require(learner.call('/rehearsals', start, status=201)['run_id'] == run['run_id'],
                'Duplicate start created another rehearsal.')
        outsider.call(path, status=404)
        outsider.call(path + '/conversation', {'checkpoint': 1}, status=404)
        learner.call(path + '/conversation', {'checkpoint': 2}, status=409)
        learner.call(path + '/debrief', status=409)
        for stage, (action, event_numbers) in enumerate(plan, 1):
            require(run['checkpoint'] == stage, 'Unexpected rehearsal checkpoint.')
            thread = learner.call(path + '/conversation', {'checkpoint': stage}, status=201)['id']
            threads[(case_id, stage)] = thread
            require(learner.call(path + '/conversation', {'checkpoint': stage}, status=201)['id'] == thread,
                    'Opening the same checkpoint again should resume its conversation.')
            outsider.call('/conversations/' + thread, status=404)
            outsider.call('/conversations/' + thread + '/messages',
                          {'question': 'Read the evidence.', 'request_id': uuid4().hex}, status=404)
            evidence_ids = [f'SIM-EVT-{number}' for number in event_numbers]
            body = {'checkpoint': stage, 'action_id': action, 'evidence_ids': evidence_ids}
            learner.call(path + '/decision', {**body, 'evidence_ids': [*evidence_ids, 'SIM-EVT-999']}, status=422)
            missing = learner.call(path + '/decision', {**body, 'evidence_ids': []})
            require(not missing['passed'] and missing['run']['checkpoint'] == stage,
                    'An uncited decision passed or advanced the rehearsal.')
            wrong = next(item['id'] for item in run['options'] if item['id'] in ('restart_service', 'delete_files'))
            blocked = learner.call(path + '/decision', {**body, 'action_id': wrong})
            require(not blocked['passed'] and 'blocked' in blocked['feedback'], 'A rehearsal accepted a state change.')
            accepted = learner.call(path + '/decision', body)
            repeated = learner.call(path + '/decision', body)
            require(accepted == repeated and accepted['passed'], 'A valid decision did not commit idempotently.')
            learner.call(path + '/decision', {**body, 'action_id': wrong}, status=409)
            run = accepted['run']
        receipt = learner.call(path + '/debrief')
        outsider.call(path + '/debrief', status=404)
        require(run['complete'] and len(receipt['decisions']) == 3 and len(receipt['case_sha256']) == 64
                and receipt['synthetic'] and receipt['execution_allowed'] is False
                and receipt['state_change_executed'] is False and receipt['unresolved'],
                'Rehearsal debrief is missing its evidence or scope.')
        if case_id == 'INC-TMF-004':
            require(receipt['trend']['minutes_remaining'] == 20 and receipt['trend']['threshold'] == 80,
                    'Unexpected conditional audit projection.')
        completed[run['run_id']] = receipt
    require(not outsider.call('/rehearsals')['runs'], 'Another user can see these rehearsal records.')
    return threads, completed


def read_cases(path):
    data = path.read_bytes()
    cases = [json.loads(line) for line in data.splitlines() if line.strip()]
    if not cases or len({item['id'] for item in cases}) != len(cases):
        raise ValueError('The suite must contain unique case IDs.')
    return cases, hashlib.sha256(data).hexdigest()


def grade(case, turn, notes, hidden, mode):
    result = turn['metadata']
    text = result.get('answer', '')
    sources = {source['id']: source for source in result.get('sources', [])}
    citations = set(result.get('citations', []))
    checks = {
        'expected_status': result.get('status') == case['status'],
        'saved_answer': turn['status'] == 'complete' and turn['content'] == text and bool(text.strip()),
        'read_only': result.get('execution_allowed') is False and result.get('state_change_executed') is False,
        'registered_citations': citations <= sources.keys(),
        'facts': all(fact.casefold() in text.casefold() for fact in case.get('contains', []))
                 and all(re.search(pattern, text, re.I) for pattern in case.get('patterns', [])),
        'exclusions': all(phrase.casefold() not in text.casefold() for phrase in case.get('exclude', [])),
        'private_and_retired': not any(source.get('document_id') in hidden for source in sources.values()),
    }
    if 'case' in case:
        expected = set(case['citations'])
        checks['exact_checkpoint'] = (result.get('rehearsal', {}).get('case_id') == case['case']
                                       and result['rehearsal']['checkpoint'] == case['checkpoint'])
        checks['exact_evidence'] = (sources.keys() == citations == expected
                                    and set(re.findall(r'\bSIM-EVT-\d+\b', text)) == expected
                                    and all(source['synthetic'] for source in sources.values()))
    elif case.get('fixture'):
        matching = {key for key, item in sources.items() if item.get('document_id') == notes[case['fixture']]}
        checks['right_guidance'] = bool(citations & matching) and citations <= matching
        if mode == 'offline':
            checks['exact_quote'] = len(citations) == 1 and all(sources[key]['text'] in text for key in citations)
    else:
        checks['no_invented_citations'] = not citations
    if mode == 'model':
        checks['route'] = result.get('route') == case['route']
        if case['status'] == 'needs_clarification':
            checks['clarifies_before_sources'] = not sources
        else:
            checks['generated'] = bool(result.get('model'))
    return checks


def evaluate(cases, learner, threads, notes, hidden, mode):
    results = []
    for case in cases:
        try:
            conversation = (threads[(case['case'], case['checkpoint'])] if 'case' in case
                            else learner.call('/conversations', {}, status=201)['id'])
            prelude = [ask(learner, conversation, prompt) for prompt in case.get('prelude', [])]
            start = time.perf_counter()
            turn = ask(learner, conversation, case['question'])
            elapsed = round(1000 * (time.perf_counter() - start), 2)
            checks = grade(case, turn, notes, hidden, mode)
            if prelude:
                clarification_turn = case.get('clarification_turn')
                checks['prelude_generated'] = all(item['metadata'].get('model') for index, item in enumerate(prelude, 1)
                                                  if index != clarification_turn)
                if clarification_turn:
                    clarification = prelude[clarification_turn - 1]['metadata']
                    checks['prelude_clarified'] = (clarification['status'] == 'needs_clarification'
                                                  and not clarification['sources'])
            if case.get('first_reply_contains'):
                checks['earlier_answer_verified'] = case['first_reply_contains'] in prelude[0]['content']
            record = {'id': case['id'], 'bucket': case['bucket'], 'checks': checks, 'passed': all(checks.values()),
                      'latency_ms': elapsed, 'expected_status': case['status'],
                      'actual_status': turn['metadata'].get('status'), 'model': turn['metadata'].get('model'),
                      'question': case['question'], 'answer': turn['content'],
                      'route': turn['metadata'].get('route'),
                      'trace': turn['metadata'].get('trace', []),
                      'citations': turn['metadata'].get('citations', []),
                      'prelude': [{'question': prompt, 'answer': reply['content']}
                                  for prompt, reply in zip(case.get('prelude', []), prelude)]}
        except (ValueError, KeyError, OSError, RuntimeError) as error:
            record = {'id': case['id'], 'bucket': case['bucket'], 'passed': False, 'error': str(error)}
        results.append(record)
        if not record['passed']:
            failed = [key for key, value in record.get('checks', {}).items() if not value]
            print(f'FAIL {case["id"]} · {record.get("actual_status") or record.get("error")} · {", ".join(failed)}', flush=True)
        if mode == 'model' or len(results) % 30 == 0:
            print(f'Scored {len(results)}/{len(cases)} cases.', flush=True)
    return results


def assert_model(url, model):
    parts = urlsplit(url)
    if parts.scheme != 'http' or parts.hostname not in ('127.0.0.1', 'localhost') or parts.username or parts.password or parts.path not in ('', '/') or parts.query or parts.fragment:
        raise ValueError('Use the local Ollama HTTP address, for example http://127.0.0.1:11434.')
    try:
        with urlopen(url.rstrip('/') + '/api/tags', timeout=5) as response:
            model_info = next((item for item in json.load(response)['models'] if item['name'] == model), None)
    except (OSError, KeyError, ValueError):
        raise SystemExit('Ollama is unavailable. Start your local Ollama server before running the model suite.') from None
    if model_info is None:
        raise SystemExit(f'Local Ollama model is missing. Run ollama pull {model}.')
    return model_info.get('digest')


def head():
    result = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True, capture_output=True)
    return result.stdout.strip() if result.returncode == 0 else None


def summarize(results):
    total, passed = Counter(row['bucket'] for row in results), Counter(row['bucket'] for row in results if row['passed'])
    checks = defaultdict(Counter)
    for row in results:
        for name, result in row.get('checks', {}).items():
            checks[name]['total'] += 1
            checks[name]['passed'] += int(result)
    return {
        'total': len(results), 'passed': sum(passed.values()),
        'buckets': {key: {'total': total[key], 'passed': passed[key]} for key in sorted(total)},
        'check_totals': dict(checks),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--suite', choices=('offline', 'model'), default='offline')
    parser.add_argument('--model-url', default='http://127.0.0.1:11434')
    parser.add_argument('--model', default=MODEL)
    parser.add_argument('--report', type=Path, help='Optional JSON report including answers and individual checks')
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument('--case', action='append', help='Run only the specified case ID, repeatable')
    selection.add_argument('--shard', help='Run a numbered share of the suite as INDEX/COUNT')
    args = parser.parse_args()
    started = time.monotonic()
    model_hash = assert_model(args.model_url, args.model) if args.suite == 'model' else None
    suite_file = ROOT / 'eval' / ('model.jsonl' if args.suite == 'model' else 'workspace.jsonl')
    cases, suite_hash = read_cases(suite_file)
    if args.case:
        if set(args.case) - {case['id'] for case in cases}:
            parser.error('Unknown case ID for this suite.')
        cases = [case for case in cases if case['id'] in args.case]
    if args.shard:
        match = re.fullmatch(r'([1-9][0-9]*)/([1-9][0-9]*)', args.shard)
        if not match:
            parser.error('Use INDEX/COUNT for --shard, for example 1/10.')
        index, count = map(int, match.groups())
        if not 1 <= index <= count <= len(cases):
            parser.error('The shard number and count must fit the suite.')
        cases = cases[index - 1::count]

    completed = {}
    with tempfile.TemporaryDirectory(prefix='cail-evaluation-') as temp:
        users = fixture_users()
        env = {**os.environ, 'LEGACY_DATABASE_PATH': str(Path(temp) / 'evaluation.sqlite3'),
               'CAIL_WORKSPACE_USERS': json.dumps(users), 'CAIL_WORKSPACE_LOCAL_DEMO': 'false',
               'CAIL_TRANSFER_DEMO': 'true', 'CAIL_TRANSFER_DEMO_ROLES': 'false',
               'CAIL_LIVE_ENABLED': 'false', 'CAIL_COOKIE_SECURE': 'false',
               'OLLAMA_URL': args.model_url if args.suite == 'model' else 'http://127.0.0.1:9',
               'OLLAMA_MODEL': args.model}
        with workspace_api(env) as address:
            expert, reviewer, learner = [OperatorSession(address, user['key'], timeout=240) for user in users]
            notes, draft, stale = seed_guidance(expert, reviewer, include_model_fixtures=args.suite == 'model')
            threads, completed = prepare_rehearsals(learner, expert) if args.suite == 'offline' else ({}, {})
            if args.suite == 'offline':
                thread = learner.call('/conversations', {}, status=201)['id']
                named = ask(learner, thread, 'Use the reviewed note Evaluation guidance disk. What is its scope?')['metadata']
                require(named['route'] == 'knowledge' and named['sources']
                        and all(item['document_id'] == notes['disk'] for item in named['sources']),
                        'A request naming reviewed guidance must use that exact current note.')
                for hidden in ('draft', 'retired'):
                    denied = ask(learner, thread, f'Use the reviewed note Evaluation guidance {hidden}. What does it say?')['metadata']
                    require(denied['status'] == 'guidance_unavailable' and not denied['sources'],
                            'A draft or superseded note entered named guidance retrieval.')
                print('PASS: named guidance is scoped to the exact current approved note.')

            if completed:
                print('PASS: four private rehearsals, 12 evidence decisions, blocked writes, idempotent retry and frozen checkpoints.')
            results = evaluate(cases, learner, threads, notes, {draft, stale}, args.suite)
        if completed:
            with workspace_api(env) as address:
                learner = OperatorSession(address, users[-1]['key'])
                for run_id, receipt in completed.items():
                    require(learner.call('/rehearsals/' + run_id + '/debrief') == receipt,
                            'Rehearsal debrief changed after process restart.')
                print('PASS: all four debriefs survived an API restart.')
    summary = summarize(results)
    times = sorted(row['latency_ms'] for row in results if 'latency_ms' in row)
    if times:
        summary['http_latency_ms'] = {'samples': len(times), 'p50': median(times),
                                      'p95': times[(95 * len(times) + 99) // 100 - 1]}
    for name, counts in summary['buckets'].items():
        print(f'{name}: {counts["passed"]}/{counts["total"]}')
    print(f'{summary["passed"]}/{summary["total"]} {args.suite} answer cases passed.')
    if 'http_latency_ms' in summary:
        print('Answer request latency (ms): ' + json.dumps(summary['http_latency_ms']))
    if args.report:
        report = {'suite': args.suite, 'suite_sha256': suite_hash, 'scoring_version': SCORING_VERSION,
                  'git_head': head(), 'generated_at': datetime.now(timezone.utc).isoformat(),
                  'platform': platform.platform(), 'python': platform.python_version(),
                  'model': args.model if args.suite == 'model' else None, 'model_digest': model_hash,
                  'elapsed_seconds': round(time.monotonic() - started, 2),
                  'verified_rehearsals': len(completed), 'summary': summary, 'cases': results}
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        print(f'Report written to {args.report}.')
    raise SystemExit(0 if summary['passed'] == summary['total'] else 1)


if __name__ == '__main__':
    main()
