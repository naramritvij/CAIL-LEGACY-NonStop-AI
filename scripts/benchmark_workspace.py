"""Measure retrieval and real HTTP graph reads on a reproducible synthetic manual."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from urllib.parse import urlencode

from verify_knowledge_transfer import ROOT, benchmark, fixture_users, workspace_api
from app import workspace_store as store
from app.transfer_demo import OperatorSession

RETRIEVAL = """
from app import workspace_store as store
from time import perf_counter
times = []
for index in range(27):
    started = perf_counter()
    matches = store.retrieve_documents({'id': 'transfer-learner'}, 'TMFCOM STATUS TMF')
    if not matches:
        raise RuntimeError('Benchmark source is missing.')
    if index >= 2:
        times.append((perf_counter() - started) * 1000)
times.sort()
print(f'Approved passage retrieval: p50 {times[12]:.1f} ms, p95 {times[23]:.1f} ms, n=25')
"""


def run(code_root, env, users, label):
    print(label, flush=True)
    subprocess.run([sys.executable, '-c', RETRIEVAL], cwd=code_root / 'backend',
                   env={**env, 'PYTHONPATH': str(code_root / 'backend')}, check=True)
    with workspace_api(env, code_root) as address:
        learner = OperatorSession(address, users[2]['key'], demo_only=False)
        graph = learner.call('/graph')
        print(f'Graph fixture: {len(graph["nodes"]):,} nodes, {len(graph["edges"]):,} relationships')
        benchmark('Full graph over HTTP', lambda: learner.call('/graph'))
        cursor = graph['cursor']

        def poll():
            nonlocal cursor
            result = learner.call('/graph?' + urlencode({'cursor': cursor}))
            cursor = result['cursor']

        benchmark('Graph refresh with cursor', poll)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=Path, help='Optional checkout of the previous application version')
    args = parser.parse_args()
    users = fixture_users()
    with tempfile.TemporaryDirectory(prefix='cail-throughput-') as temporary:
        path = str(Path(temporary) / 'workspace.sqlite3')
        previous = os.environ.get('LEGACY_DATABASE_PATH')
        os.environ['LEGACY_DATABASE_PATH'] = path
        try:
            content = ''.join((f'Synthetic reference section {index:04d}. TMFCOM STATUS TMF is the cited '
                               'reference in this synthetic throughput fixture. ').ljust(1100, '.') for index in range(1234))
            for user in users:
                store.person(user)
            with store.database() as db:
                db.execute('BEGIN IMMEDIATE')
                document = store.insert_document(db, users[0], 'Synthetic throughput manual', 'fixture.txt',
                                                 content, 'TMF', max_chars=2_000_000)
                db.execute('COMMIT')
            store.transition_document(users[0], document, 'submitted')
            store.transition_document(users[1], document, 'approved', 'Synthetic benchmark source.')
        finally:
            if previous is None:
                os.environ.pop('LEGACY_DATABASE_PATH', None)
            else:
                os.environ['LEGACY_DATABASE_PATH'] = previous
        env = {**os.environ, 'LEGACY_DATABASE_PATH': path, 'CAIL_WORKSPACE_USERS': json.dumps(users),
               'CAIL_WORKSPACE_LOCAL_DEMO': 'false', 'CAIL_TRANSFER_DEMO': 'false', 'CAIL_LIVE_ENABLED': 'false',
               'CAIL_COOKIE_SECURE': 'false'}
        print('Synthetic 1,234-passage workload on the local runtime. The same SQLite data is used for each version.')
        if args.baseline:
            run(args.baseline.resolve(), env, users, 'Previous checkout')
        run(ROOT, env, users, 'Current checkout')


if __name__ == '__main__':
    main()
