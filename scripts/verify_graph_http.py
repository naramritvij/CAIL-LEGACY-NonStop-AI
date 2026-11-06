"""Run the real HTTP graph check and restart an isolated SQLite application.

Uses only temporary verification data and generated in-memory operator keys.
Run with the project's Python environment; no Docker, model or vendor required.
"""
from __future__ import annotations

from http.cookiejar import CookieJar
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
from urllib.request import HTTPCookieProcessor, Request, build_opener, urlopen


ROOT = Path(__file__).resolve().parents[1]


def main():
    with tempfile.TemporaryDirectory(prefix='cail-graph-http-') as temporary:
        with socket.socket() as available:
            available.bind(('127.0.0.1', 0))
            port = available.getsockname()[1]
        users = [{'id': identifier, 'name': name, 'key': secrets.token_urlsafe(36)} for identifier, name in (
            ('graph-http-author', 'Graph HTTP Verification Author'), ('graph-http-reader', 'Graph HTTP Verification Reader'))]
        address = f'http://127.0.0.1:{port}'
        env = {**os.environ, 'LEGACY_DATABASE_PATH': str(Path(temporary) / 'workspace.sqlite3'),
               'CAIL_WORKSPACE_USERS': json.dumps(users), 'CAIL_WORKSPACE_LOCAL_DEMO': 'false',
               'CAIL_LIVE_ENABLED': 'false', 'CAIL_SMOKE_BASE_URL': address,
               'CAIL_SMOKE_ACCESS_KEY': users[0]['key'], 'PYTHONPATH': str(ROOT / 'backend')}

        def start():
            process = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.main:app',
                '--host', '127.0.0.1', '--port', str(port)], cwd=ROOT / 'backend', env=env,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                try:
                    with urlopen(address + '/api/v1/health', timeout=1) as response:
                        if response.status == 200:
                            return process
                except OSError:
                    if process.poll() is not None:
                        raise RuntimeError('Verification API exited before readiness.')
                    time.sleep(.1)
            process.terminate()
            process.wait(timeout=5)
            raise RuntimeError('Verification API readiness timed out.')

        def graph_for(user):
            opener = build_opener(HTTPCookieProcessor(CookieJar()))
            request = Request(address + '/api/v1/workspace/session',
                data=json.dumps({'access_key': user['key']}).encode(), headers={'Content-Type': 'application/json'})
            with opener.open(request, timeout=5) as response:
                if response.status != 200:
                    raise RuntimeError('Verification operator could not sign in.')
            with opener.open(address + '/api/v1/workspace/graph', timeout=10) as response:
                return json.load(response)

        server = start()
        try:
            subprocess.run([sys.executable, '-m', 'app.graph_smoke'], cwd=ROOT / 'backend', env=env,
                           check=True, timeout=45)
            before = graph_for(users[0])
            private = graph_for(users[1])
            if private['total_documents'] or private['edges']:
                raise RuntimeError('Another operator could access the private verification graph.')
            print('PASS: a separately authenticated reader cannot see the private drafts or relationships.', flush=True)
        finally:
            server.terminate()
            server.wait(timeout=5)
        server = start()
        try:
            after = graph_for(users[0])
            ids = {node['id'] for node in before['nodes']}
            links = {edge['id'] for edge in before['edges']}
            if {node['id'] for node in after['nodes']} != ids or {edge['id'] for edge in after['edges']} != links:
                raise RuntimeError('Graph identities or relationships changed after a process restart.')
            print(f'PASS: process restart recovered {len(ids)} nodes and {len(links)} relationships from SQLite.', flush=True)
        finally:
            server.terminate()
            server.wait(timeout=5)


if __name__ == '__main__':
    main()
