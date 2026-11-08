"""Exercise real HTTP sessions, guidance, learning, isolation and restart recovery."""
from __future__ import annotations

from contextlib import contextmanager
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from app import transfer_demo as demo


@contextmanager
def workspace_api(env, root=ROOT):
    with socket.socket() as available:
        available.bind(('127.0.0.1', 0))
        port = available.getsockname()[1]
    address = f'http://127.0.0.1:{port}'
    with tempfile.TemporaryFile(mode='w+t', encoding='utf-8') as log:
        process = subprocess.Popen(
            [sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', str(port)],
            cwd=root / 'backend', env={**env, 'PYTHONPATH': str(root / 'backend')},
            stdout=log, stderr=subprocess.STDOUT,
        )
        try:
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                try:
                    with urlopen(address + '/api/v1/health', timeout=1) as response:
                        if response.status == 200:
                            break
                except OSError:
                    if process.poll() is not None:
                        break
                    time.sleep(.1)
            else:
                raise RuntimeError('Isolated API readiness timed out.')
            if process.poll() is not None:
                log.seek(0)
                raise RuntimeError('Isolated API exited during startup. ' + log.read()[-1600:])
            yield address
        finally:
            process.terminate()
            process.wait(timeout=10)


def fixture_users():
    return [
        {'id': demo.EXPERT, 'name': 'Demo expert', 'key': secrets.token_urlsafe(36),
         'can_review': True, 'can_manage_members': True},
        {'id': demo.REVIEWER, 'name': 'Demo independent reviewer', 'key': secrets.token_urlsafe(36), 'can_review': True},
        {'id': demo.LEARNER, 'name': 'Demo learner', 'key': secrets.token_urlsafe(36)},
    ]


def benchmark(label, call, samples=25):
    times = []
    for _ in range(samples):
        start = time.perf_counter()
        call()
        times.append((time.perf_counter() - start) * 1000)
    times.sort()
    print(f'{label}: p50 {times[samples // 2]:.1f} ms, p95 {times[(95 * samples + 99) // 100 - 1]:.1f} ms, n={samples}', flush=True)


def main():
    with tempfile.TemporaryDirectory(prefix='cail-transfer-http-') as temporary:
        users = fixture_users()
        env = {**os.environ, 'LEGACY_DATABASE_PATH': str(Path(temporary) / 'workspace.sqlite3'),
               'CAIL_WORKSPACE_USERS': json.dumps(users), 'CAIL_WORKSPACE_LOCAL_DEMO': 'false',
               'CAIL_TRANSFER_DEMO': 'true', 'CAIL_LIVE_ENABLED': 'false', 'CAIL_COOKIE_SECURE': 'false',
               'CAIL_TRANSFER_DEMO_ROLES': 'true',
               'OLLAMA_URL': 'http://127.0.0.1:9'}
        with workspace_api(env) as address:
            expert, reviewer, learner, source, note, request = demo.run(address, users, verify=True)
            learner.call('/session/demo-role', {'person_id': demo.REVIEWER}, status=404)
            learner.call('/knowledge/contributors', {'name': 'Unauthorized account'}, status=403)
            reuse = learner.call('/knowledge/handoffs', {
                'contributor_id': demo.EXPERT, 'request_key': 'verified-reuse-fixture',
                'question': 'Could I reuse the reviewed guidance for a second TMF learning exercise?',
            }, status=201)
            reuse_path = '/knowledge/handoffs/' + reuse['id'] + '/guidance'
            learner.call(reuse_path, {'document_id': note}, status=403)
            expert.call(reuse_path, {'document_id': note})
            reused = demo.handoff(learner, reuse['id'])
            demo.require(reused['state'] == 'ready_to_explain' and reused['guidance']['id'] == note,
                         'Reused guidance must retain the original approved version.')
            learner.call('/knowledge/handoffs/' + reuse['id'] + '/receipt', status=409)
            member = expert.call('/knowledge/contributors', {'name': 'Demo new contributor'}, status=201)
            newcomer = demo.OperatorSession(address, member['access_key'])
            demo.require(newcomer.identity['id'] == member['id'] and not newcomer.identity['can_review']
                         and not newcomer.identity['can_read_live'], 'Managed contributors received unexpected permissions.')
            directory = learner.call('/knowledge/contributors')
            demo.require(any(person['id'] == member['id'] and person['documents'] == 0
                             for person in directory['contributors']), 'New contributor is missing from the directory.')
            demo.require(not newcomer.call('/knowledge/handoffs')['requests'], 'A new operator can read another operator’s requests.')
            expert.call('/knowledge/contributors/' + member['id'] + '/access?action=revoke', {})
            newcomer.call('/session', status=401)
            newcomer.call('/session', {'access_key': member['access_key']}, status=401)
            rotated = expert.call('/knowledge/contributors/' + member['id'] + '/access?action=rotate', {})
            demo.require(demo.OperatorSession(address, rotated['access_key']).identity['id'] == member['id'],
                         'Rotated access did not retain contributor identity.')
            print('PASS: manager-only enrollment, directory count, least privilege, private requests, session revocation and key rotation.', flush=True)
            benchmark('Contributor directory', lambda: learner.call('/knowledge/contributors'))
            benchmark('Handoff inbox', lambda: learner.call('/knowledge/handoffs'))
            benchmark('Reviewed answer and citation', lambda: demo.ask(learner, 'Show approved guidance about TMFCOM STATUS TMF'))
            receipt = learner.call('/knowledge/handoffs/' + request + '/receipt')
        with workspace_api(env) as address:
            expert, reviewer, learner = demo.sign_ins(address, users)
            demo.require(learner.call('/knowledge/handoffs/' + request + '/receipt') == receipt,
                         'Verified receipt changed after backend restart.')
            print('PASS: evidence-bound receipt recovered after backend process restart.', flush=True)
            demo.check_quality(expert, reviewer, learner, source, note, request)


if __name__ == '__main__':
    main()
