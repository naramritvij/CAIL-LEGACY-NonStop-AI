"""Opt-in HTTP upload/graph check against a running CAIL backend.

Run: python -m app.graph_smoke
Creates two clearly labelled synthetic verification drafts in the current
operator's workspace. It neither approves them nor calls a model/vendor source.
"""
from __future__ import annotations

from http.cookiejar import CookieJar
import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPCookieProcessor, Request, build_opener
from uuid import uuid4


def main():
    root = os.getenv('CAIL_SMOKE_BASE_URL', 'http://127.0.0.1:8000').rstrip('/') + '/api/v1/workspace'
    opener = build_opener(HTTPCookieProcessor(CookieJar()))

    def call(path, payload=None, *, raw=None, content_type='application/json'):
        data = raw if raw is not None else json.dumps(payload).encode() if payload is not None else None
        request = Request(root + path, data=data, method='POST' if data is not None else 'GET',
                          headers={'Content-Type': content_type, 'Accept': 'application/json'})
        with opener.open(request, timeout=30) as response:
            return json.load(response)

    def require(condition, message):
        if not condition:
            raise ValueError(message)

    if os.getenv('CAIL_SMOKE_ACCESS_KEY'):
        call('/session', {'access_key': os.environ['CAIL_SMOKE_ACCESS_KEY']})
    operator = call('/session')
    before = call('/graph')
    marker = uuid4().hex[:8]
    title = 'Graph upload verification ' + marker
    heading = 'Synthetic graph verification ' + marker
    text = ('# ' + heading + '\nTMFCOM STATUS TMF is a documented command reference.\n'
            'This generated test text is not an operational procedure or a live system observation.\n')
    boundary = 'cail-graph-' + uuid4().hex
    parts = [
        f'--{boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\n{title}\r\n',
        f'--{boundary}\r\nContent-Disposition: form-data; name="topic"\r\n\r\nGraph verification\r\n',
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="graph-verification.md"\r\n'
        f'Content-Type: text/markdown\r\n\r\n{text}\r\n--{boundary}--\r\n',
    ]
    document = call('/documents/upload', raw=''.join(parts).encode(), content_type='multipart/form-data; boundary=' + boundary)
    did = 'document:' + document['id']
    print('Uploaded synthetic verification draft: ' + document['id'], flush=True)
    graph = call('/graph?' + urlencode({'cursor': before['cursor']}))
    require(not graph.get('not_modified'), 'Upload did not change the graph cursor.')
    require(document['owner_id'] == operator['id'], 'Upload lost the signed-in contributor.')
    require(any(e['kind'] == 'contributed' and e['source'] == 'person:' + operator['id'] and e['target'] == did
                for e in graph['edges']), 'Contributor relationship is missing.')

    # Use search when a large workspace's bounded overview omits this draft.
    passage = next((n for n in graph['nodes'] if n.get('dataset_id') == 'document-' + document['id']
                    and n.get('entity_type') == 'passage'), None)
    if passage is None:
        results = call('/graph/search?' + urlencode({'q': heading}))['nodes']
        passage = next((n for n in results if n.get('dataset_id') == 'document-' + document['id']), None)
    require(passage is not None, 'Uploaded text passage is missing from graph/search.')
    nearby = call('/graph/neighborhood?' + urlencode({'node_id': passage['id']}))
    ids = {node['id'] for node in nearby['nodes']}
    require(all(e['source'] in ids and e['target'] in ids for e in nearby['edges']), 'Drill-down has a missing endpoint.')
    evidence = next((e for e in nearby['edges'] if e['kind'] in ('defined_in', 'referenced_in') and e.get('citation_id')), None)
    require(evidence is not None, 'Canonical concept and exact citation are missing.')
    require(did in ids, 'Passage is disconnected from its source document.')

    attachment = call('/documents', {'title': 'Attached graph verification ' + marker,
        'topic': 'Graph verification', 'content': 'Synthetic verification attachment for this specific cited documentation concept.',
        'target_node_id': evidence['source']})
    graph = call('/graph')
    require(any(e['kind'] == 'documents' and e['source'] == 'document:' + attachment['id'] and
                e['target'] == evidence['source'] for e in graph['edges']), 'Contextual attachment is missing.')
    saved = call('/documents/' + document['id'])
    require(saved['content'] == text.strip() and saved['owner_id'] == operator['id'] and saved['status'] == 'draft',
            'Saved text, ownership or draft review state changed.')
    path = call('/graph/path?' + urlencode({'source': evidence['source'], 'target': passage['id']}))
    require(path['found'] and len(path['edges']) == 1, 'The concept-to-passage trail cannot be followed.')
    print('PASS: HTTP file upload, graph refresh, contributor, exact citation, complete drill-down, attachment and evidence trail.', flush=True)
    print('Verification drafts: ' + document['id'] + ', ' + attachment['id'], flush=True)


if __name__ == '__main__':
    try:
        main()
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, KeyError, StopIteration) as exc:
        detail = str(exc) if isinstance(exc, ValueError) else type(exc).__name__
        print('FAIL: ' + detail, file=sys.stderr)
        raise SystemExit(1) from None
