"""Exercise actual HTTPS and file transport with explicitly synthetic sources."""
from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import ssl
import subprocess
import tempfile
from threading import Thread

from verify_knowledge_transfer import fixture_users, workspace_api
from app.source_acceptance import verify
from app.transfer_demo import OperatorSession, require


def main():
    with tempfile.TemporaryDirectory(prefix='cail-source-wire-') as temporary:
        root = Path(temporary)
        cert, key = root / 'fixture-cert.pem', root / 'fixture-key.pem'
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                        '-subj', '/CN=CAIL synthetic loopback fixture', '-addext', 'subjectAltName=IP:127.0.0.1',
                        '-keyout', str(key), '-out', str(cert)], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        scope, password, token = 'SYNTHETIC-NONSTOP', secrets.token_urlsafe(24), secrets.token_urlsafe(36)
        basic = 'Basic ' + base64.b64encode(('synthetic-reader:' + password).encode()).decode()
        reads = []
        faults = {'wrong_scope': False, 'stale': False, 'redirect': False}

        class Fixture(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                reads.append(self.path)
                if self.path == '/asap' and faults['redirect']:
                    self.send_response(302)
                    self.send_header('Location', '/unapproved')
                    self.end_headers()
                    return
                observed = datetime.now(timezone.utc)
                if faults['stale']:
                    observed -= timedelta(minutes=10)
                timestamp = observed.isoformat()
                system = 'WRONG-SCOPE' if faults['wrong_scope'] else scope
                if self.path == '/prognosis' and self.headers.get('Authorization') == basic:
                    body = [{'id': 'p-1', 'system': system, 'message': 'Synthetic Prognosis TMF observation'}]
                elif self.headers.get('Authorization') == 'Bearer ' + token and self.path in ('/asap', '/asap-topology'):
                    body = {'source_id': 'asap', 'system_id': system, 'observed_at': timestamp, 'health': 'warning',
                            'records': [{'id': 'a-1', 'message': 'Synthetic ASAP observation', 'timestamp': timestamp}],
                            'nodes': [{'id': 'a-1', 'label': 'Synthetic ASAP observation', 'type': 'reported_alarm'}], 'edges': []}
                else:
                    self.send_error(403)
                    return
                raw = json.dumps(body).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

        inbox = root / 'momi'
        inbox.mkdir()
        export = inbox / 'fixture.txt'
        export.write_text(f'ID=m-1\nNODE={scope}\nTEXT=Synthetic MOMI TMF observation\n', encoding='utf-8')
        initial = (export.read_bytes(), export.stat().st_mtime_ns)
        with ThreadingHTTPServer(('127.0.0.1', 0), Fixture) as server:
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(cert, key)
            server.socket = context.wrap_socket(server.socket, server_side=True)
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            upstream = f'https://127.0.0.1:{server.server_port}'
            users = fixture_users()
            users[0]['can_read_live'] = True
            env = {**os.environ, 'LEGACY_DATABASE_PATH': str(root / 'workspace.sqlite3'),
                   'CAIL_WORKSPACE_USERS': json.dumps(users), 'CAIL_WORKSPACE_LOCAL_DEMO': 'false',
                   'CAIL_COOKIE_SECURE': 'false', 'CAIL_LIVE_ENABLED': 'true', 'CAIL_LIVE_ALLOWED_HOSTS': '127.0.0.1',
                   'SSL_CERT_FILE': str(cert), 'CAIL_PROGNOSIS_DATASET_URL': upstream + '/prognosis',
                   'CAIL_PROGNOSIS_USER': 'synthetic-reader', 'CAIL_PROGNOSIS_PASSWORD': password,
                   'CAIL_PROGNOSIS_SYSTEM_ID': scope, 'CAIL_PROGNOSIS_FIELDS': '{"id":"id","node":"system","message":"message"}',
                   'CAIL_PROGNOSIS_ROWS_KEY': '', 'CAIL_MOMI_EXPORT_DIR': str(inbox), 'CAIL_MOMI_SYSTEM_ID': scope,
                   'CAIL_LIVE_ASAP_URL': upstream + '/asap', 'CAIL_LIVE_ASAP_TOPOLOGY_URL': upstream + '/asap-topology',
                   'CAIL_LIVE_ASAP_TOKEN': token, 'CAIL_ASAP_SYSTEM_ID': scope}
            # The receipt verifier reads expected scope from its own local environment.
            overrides = {f'CAIL_{source}_SYSTEM_ID': scope for source in ('PROGNOSIS', 'ASAP', 'MOMI')}
            previous = {name: os.environ.get(name) for name in overrides}
            os.environ.update(overrides)
            try:
                with workspace_api(env) as address:
                    authorized = OperatorSession(address, users[0]['key'], demo_only=False)
                    ordinary = OperatorSession(address, users[2]['key'], demo_only=False)
                    ordinary.call('/connections/asap/check', {}, status=403)
                    require(not reads, 'An unauthorized operator reached the upstream fixture.')
                    report = verify(authorized, ('prognosis', 'asap', 'momi'))
                    require(report['verified'] and all(len(item['checks']) == 2 for item in report['sources']),
                            'Metrics and topology must verify for all three fixture sources.')
                    require(initial == (export.read_bytes(), export.stat().st_mtime_ns), 'MOMI source file was modified.')
                    require(all(not item['snapshot'] and not item['history'] for item in ordinary.call('/connections')['sources']),
                            'Live observations escaped the authorized reader scope.')
                    faults['wrong_scope'] = True
                    authorized.call('/connections/asap/check', {}, status=502)
                    authorized.call('/connections/prognosis/check', {}, status=502)
                    require(not verify(authorized, ('asap',))['verified'], 'Wrong system scope verified.')
                    faults['wrong_scope'] = False
                    faults['stale'] = True
                    authorized.call('/connections/asap/check', {}, status=502)
                    faults['stale'] = False
                    faults['redirect'] = True
                    authorized.call('/connections/asap/check', {}, status=502)
                    require('/unapproved' not in reads, 'An upstream redirect was followed.')
                    print('PASS: actual TLS GETs for synthetic Prognosis and ASAP, read-only MOMI export, source identities, fresh snapshots, graph sync, denied scope and blocked redirects.', flush=True)
            finally:
                for name, value in previous.items():
                    if value is None:
                        os.environ.pop(name, None)
                    else:
                        os.environ[name] = value
                server.shutdown()
                thread.join(timeout=5)


if __name__ == '__main__':
    main()
