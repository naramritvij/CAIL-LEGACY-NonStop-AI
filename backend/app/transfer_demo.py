"""Run a synthetic expert, reviewer and learner journey against an isolated app."""
from __future__ import annotations

import argparse
from http.cookiejar import CookieJar
import json
import os
from urllib.error import HTTPError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import HTTPCookieProcessor, Request, build_opener
from uuid import uuid4

from .workspace_identity import configured_users

EXPERT = 'transfer-expert'
REVIEWER = 'transfer-reviewer'
LEARNER = 'transfer-learner'
SOURCE_TITLE = 'Synthetic TMF training source'
GUIDANCE_TITLE = 'Synthetic training: interpret TMF status before escalation'
SOURCE = (
    'Synthetic training reference for an isolated demonstration. '
    'TMFCOM STATUS TMF is the documented reference used to inspect TMF status in this exercise. '
    'A single observation does not establish root cause. Confirm system identity and observation time, '
    'compare current authorized observations, and escalate if evidence is stale or contradictory.'
)
GUIDANCE = (
    'In this synthetic exercise, begin with the reviewed reference TMFCOM STATUS TMF. '
    'Confirm the system identity and timestamp before interpreting the observation. '
    'One status observation cannot establish root cause or authorize a restart. '
    'Compare a fresh read-only observation and escalate to the responsible operator if evidence is missing or contradictory.'
)
CRITERIA = ['decision', 'evidence', 'limits', 'safe_next_step']


class OperatorSession:
    def __init__(self, root, key, *, demo_only=True):
        self.root = root.rstrip('/') + '/api/v1/workspace'
        self.opener = build_opener(HTTPCookieProcessor(CookieJar()))
        self.identity = self.call('/session', {'access_key': key})
        if demo_only:
            require(self.identity.get('transfer_demo'), 'The server must be an isolated transfer demonstration.')

    def call(self, path, payload=None, *, status=200):
        data = json.dumps(payload).encode() if payload is not None else None
        request = Request(self.root + path, data=data, headers={'Content-Type': 'application/json', 'Accept': 'application/json'})
        try:
            with self.opener.open(request, timeout=30) as response:
                actual, result = response.status, json.load(response)
        except HTTPError as error:
            actual, result = error.code, json.load(error)
        require(actual == status, f'{path} returned HTTP {actual} (expected {status}). ' +
                (str(result.get('detail', '')) if isinstance(result, dict) and actual != status else ''))
        return result


def require(condition, detail):
    if not condition:
        raise RuntimeError(detail)


def sign_ins(root, users):
    parsed = urlsplit(root)
    require(parsed.scheme in ('http', 'https') and parsed.hostname in ('localhost', '127.0.0.1'),
            'Run the demonstration against a loopback API address.')
    keys = {row['id']: row['key'] for row in users}
    require({EXPERT, REVIEWER, LEARNER} <= keys.keys(), 'The three isolated demo identities must be configured.')
    return [OperatorSession(root, keys[identifier]) for identifier in (EXPERT, REVIEWER, LEARNER)]


def review_document(author, reviewer, document_id):
    path = '/documents/' + document_id
    doc = author.call(path + '?record_access=false')
    if doc['status'] in ('draft', 'rejected'):
        doc = author.call(path + '/review', {'decision': 'submitted'})
    if doc['status'] == 'submitted':
        author.call(path + '/review', {'decision': 'approved', 'notes': 'The author cannot approve their own work.'}, status=403)
        reviewer.call(path + '/review', {'decision': 'approved',
                      'notes': 'The cited training source supports the read-only decision and its stated limits.'})


def own_document(session, title):
    offset = 0
    while offset is not None:
        result = session.call('/knowledge/contributors/' + session.identity['id'] + '/documents?offset=' + str(offset))
        for doc in result['documents']:
            if doc['title'] == title:
                return doc
        offset = result['next_offset']
    return None


def handoff(session, identifier):
    offset = 0
    while offset is not None:
        result = session.call('/knowledge/handoffs?offset=' + str(offset))
        for item in result['requests']:
            if item['id'] == identifier:
                return item
        offset = result['next_offset']
    raise RuntimeError('The expected participant handoff is missing.')


def ask(learner, question):
    conversation = learner.call('/conversations', {}, status=201)
    turn = learner.call('/conversations/' + conversation['id'] + '/messages',
                        {'question': question, 'request_id': uuid4().hex})
    return turn['metadata']


def run(root, users, *, verify=False):
    expert, reviewer, learner = sign_ins(root, users)
    expert.call('/knowledge/profile', {'role': 'mentor', 'share_activity': False})
    learner.call('/knowledge/profile', {'role': 'learner', 'share_activity': True})
    source = own_document(expert, SOURCE_TITLE)
    if not source:
        source = expert.call('/documents', {'title': SOURCE_TITLE, 'content': SOURCE, 'topic': 'TMF'}, status=201)
    review_document(expert, reviewer, source['id'])
    source_id = source['id']
    request = learner.call('/knowledge/handoffs', {
        'contributor_id': EXPERT, 'context_id': source_id, 'request_key': 'transfer-demonstration-v1',
        'question': 'How should I interpret TMF status and decide whether to escalate this synthetic training case?',
    }, status=201)
    identifier = request['id']
    response = handoff(expert, identifier)
    note = response['guidance']
    if not note:
        catalog = expert.call('/knowledge/catalog?q=' + quote(SOURCE_TITLE))
        citation = next(item['id'] for item in catalog['citations'] if item['document_id'] == source_id)
        catalog = expert.call('/knowledge/catalog?q=' + quote('TMFCOM STATUS TMF'))
        concept = next(item['id'] for item in catalog['concepts'] if item['label'] == 'TMFCOM STATUS TMF')
        note = expert.call('/knowledge/notes', {
            'title': GUIDANCE_TITLE, 'content': GUIDANCE, 'topic': 'TMF', 'category': 'procedure',
            'concept_ids': [concept], 'citations': [{'citation_id': citation, 'relation': 'cites'}],
            'handoff_id': identifier, 'sign_as_current_user': True,
        }, status=201)
        learner.call('/documents/' + note['id'], status=404)
        if verify:
            answer = ask(learner, 'Show approved guidance about TMFCOM STATUS TMF')
            require(answer['status'] == 'guidance_unavailable', 'A private guidance draft entered an assistant answer.')
    note_id = note['id']
    review_document(expert, reviewer, note_id)
    current = handoff(learner, identifier)
    if not verify and current['state'] in ('source_review', 'closed'):
        print('The existing demonstration retains its current review or closed state.')
        return expert, reviewer, learner, source_id, note_id, identifier
    if current['state'] != 'verified':
        if current['state'] != 'explanation_review':
            check = learner.call('/knowledge/checks', {'document_id': note_id, 'mode': 'explanation', 'handoff_id': identifier}, status=201)
            repeated = learner.call('/knowledge/checks', {'document_id': note_id, 'mode': 'explanation', 'handoff_id': identifier}, status=201)
            require(repeated['id'] == check['id'], 'Retrying the check created a second pending assessment.')
            learner.call('/knowledge/checks/' + check['id'] + '/answer', {'answer':
                'I would use the cited TMFCOM STATUS TMF reference and confirm which system and time the observation describes. '
                'A single read cannot show why it happened or authorize a restart. '
                'I would compare another authorized fresh observation and escalate if the observations disagree.'})
        queue = reviewer.call('/knowledge/check-reviews')['checks']
        check_id = next(item['check_id'] for item in queue if item.get('handoff_id') == identifier and item['status'] == 'awaiting_review')
        path = '/knowledge/checks/' + check_id + '/review'
        approval = {'decision': 'approved', 'notes': 'The explanation identifies the source, reason, limits and safe escalation.', 'criteria': CRITERIA}
        expert.call(path, approval, status=403)
        reviewer.call(path, {**approval, 'criteria': CRITERIA[:2]}, status=422)
        reviewer.call(path, approval)
    receipt = learner.call('/knowledge/handoffs/' + identifier + '/receipt')
    require(len(receipt['criteria']) == 4 and receipt['sources'] and len(receipt['guidance_sha256']) == 64,
            'The verification receipt must contain criteria and exact source evidence.')
    graph = learner.call('/graph')
    kinds = {edge['kind'] for edge in graph['edges']}
    require({'guidance_requested', 'wrote', 'cites', 'knows', 'learned_from'} <= kinds, 'The graph is missing a recorded transfer relationship.')
    external = reviewer.call('/graph')
    require('guidance_requested' not in {edge['kind'] for edge in external['edges']},
            'A private request relationship was exposed to a nonparticipant.')
    reviewer.call('/knowledge/handoffs/' + identifier + '/receipt', status=404)
    if not verify:
        learner.call('/knowledge/handoffs', {
            'contributor_id': EXPERT, 'context_id': source_id, 'request_key': 'transfer-practice-v1',
            'question': 'Practice handoff: what evidence would you collect before escalating an unclear TMF observation?',
        }, status=201)
    print('PASS: separate expert, reviewer and learner sessions completed a cited guidance handoff and verified explanation.', flush=True)
    return expert, reviewer, learner, source_id, note_id, identifier


def check_quality(expert, reviewer, learner, source_id, note_id, handoff_id):
    result = ask(learner, 'Show approved guidance about TMFCOM STATUS TMF')
    require(result['status'] == 'cited_guidance' and result['sources'][0]['document_id'] == note_id
            and result['citations'] == [result['sources'][0]['id']] and result['sources'][0]['text'] in result['answer'],
            'The reviewed response did not reproduce the correct guidance and citation.')
    result = ask(learner, 'Show approved guidance about an unrelated glacier')
    require(result['status'] == 'guidance_unavailable' and not result['sources'], 'Unrelated terms produced a guidance answer.')
    result = ask(learner, 'What is the current live status of Prognosis?')
    require(result['status'] == 'live_unavailable' and not result['execution_allowed'], 'Missing telemetry produced a live claim.')
    newer = expert.call('/documents', {'title': SOURCE_TITLE + ' · revision 2',
        'content': SOURCE + ' This new training edition changes the evidence review requirement.', 'topic': 'TMF'}, status=201)
    expert.call('/knowledge/editions', {'newer_id': newer['id'], 'previous_id': source_id}, status=201)
    review_document(expert, reviewer, newer['id'])
    require(handoff(learner, handoff_id)['state'] == 'source_review', 'An approved source change did not mark the handoff for review.')
    learner.call('/knowledge/handoffs/' + handoff_id + '/receipt', status=409)
    result = ask(learner, 'Show approved guidance about TMFCOM STATUS TMF')
    require(result['status'] == 'guidance_unavailable' and not result['sources'], 'The assistant quoted stale guidance.')
    require(not any(edge['kind'] == 'learned_from' and edge.get('document_id') == note_id
                    for edge in learner.call('/graph')['edges']), 'The graph still presents stale learning as current.')
    print('PASS: cited answer, private draft, irrelevant request, absent live telemetry and source revision acceptance cases.', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', action='store_true', help='Run source-revision and answer acceptance cases.')
    options = parser.parse_args()
    require(os.getenv('CAIL_TRANSFER_DEMO') == 'true', 'Use the isolated demo configuration to run this command.')
    root = os.getenv('CAIL_TRANSFER_DEMO_URL', 'http://127.0.0.1:8000')
    result = run(root, configured_users(), verify=options.verify)
    if options.verify:
        check_quality(*result)


if __name__ == '__main__':
    main()
