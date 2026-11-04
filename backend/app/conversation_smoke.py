"""Opt-in end-to-end check against the running workspace and its real model.

Run inside the existing backend container:
    python -m app.conversation_smoke
Creates one labelled test conversation; no vendor data or source access needed.
"""
from __future__ import annotations

from http.cookiejar import CookieJar
import json
import os
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import HTTPCookieProcessor, Request, build_opener
from uuid import uuid4


def main():
    root = os.getenv('CAIL_SMOKE_BASE_URL', 'http://127.0.0.1:8000').rstrip('/') + '/api/v1/workspace'
    opener = build_opener(HTTPCookieProcessor(CookieJar()))

    def call(path, payload=None, timeout=240):
        data = json.dumps(payload).encode() if payload is not None else None
        request = Request(root + path, data=data, method='POST' if payload is not None else 'GET',
                          headers={'Content-Type': 'application/json', 'Accept': 'application/json'})
        with opener.open(request, timeout=timeout) as response:
            return json.load(response)

    deadline = time.monotonic() + 20
    while True:
        try:
            call('/session', timeout=3)
            break
        except HTTPError as exc:
            if exc.code == 401:
                break  # Server is ready; establish the configured session below.
            raise
        except (URLError, TimeoutError):
            if time.monotonic() >= deadline:
                raise
            time.sleep(1)
    if os.getenv('CAIL_SMOKE_ACCESS_KEY'):
        call('/session', {'access_key': os.environ['CAIL_SMOKE_ACCESS_KEY']})
    call('/session')
    identifier = call('/conversations', {})['id']
    name = 'Lantern-' + uuid4().hex[:8]
    questions = [
        f'Remember that our checklist is called {name}.',
        'Explain what an API is in one sentence.',
        'What did I name our checklist?',
    ]
    replies = []
    for index, question in enumerate(questions, 1):
        reply = call(f'/conversations/{identifier}/messages', {'question': question, 'request_id': uuid4().hex})
        metadata = reply.get('metadata', {})
        answer = reply.get('content', '')
        print(f'{index}. {question}\nCAIL: {answer}\n', flush=True)
        if metadata.get('status') != 'answered':
            raise ValueError(f'Step {index}: no accepted real-model answer ({metadata.get("status", "unknown")}).')
        if metadata.get('route') != 'general':
            raise ValueError(f'Step {index}: ordinary conversation was routed to {metadata.get("route")}.')
        if index in (1, 3) and name.casefold() not in answer.casefold():
            raise ValueError(f'Step {index}: answer did not acknowledge or recall the supplied name.')
        if re.search(r'not present in (?:the )?available evidence|no references or data points|no support for the existence', answer, re.I):
            raise ValueError(f'Step {index}: the original evidence-only refusal returned.')
        if index == 2 and not re.search(r'\binterface\b', answer, re.I):
            raise ValueError('The general API question did not receive an interface explanation.')
        replies.append(answer)
    # A separate read must recover the complete saved transcript and accepted answers.
    saved = call(f'/conversations/{identifier}')['messages']
    if [row['content'] for row in saved if row['role'] == 'user'] != questions:
        raise ValueError('Saved user turns do not match the conversation.')
    if [row['content'] for row in saved if row['role'] == 'assistant'] != replies:
        raise ValueError('Saved assistant turns do not match the conversation.')
    print('PASS: real-model acknowledgement, topic change, recall and six persisted turns.', flush=True)
    print('Test conversation: ' + identifier, flush=True)


if __name__ == '__main__':
    try:
        main()
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, KeyError) as exc:
        # Print the error class for transport/auth errors, never request headers or keys.
        detail = str(exc) if isinstance(exc, ValueError) else type(exc).__name__
        print('FAIL: ' + detail, file=sys.stderr)
        raise SystemExit(1) from None
