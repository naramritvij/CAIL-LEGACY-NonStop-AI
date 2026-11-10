"""Start the isolated knowledge transfer demonstration on localhost."""
import argparse
from importlib.util import find_spec
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from app.demo_roster import demo_users


def start_local(parser, port, users):
    node = shutil.which('node')
    if not node:
        parser.exit(1, 'Install Node.js 22.12 or later, then reopen your terminal.\n')
    if find_spec('uvicorn') is None:
        parser.exit(1, 'Run python -m pip install -r backend/requirements.txt in your virtual environment.\n')
    if not (ROOT / 'frontend' / 'node_modules' / 'vite' / 'bin' / 'vite.js').is_file():
        parser.exit(1, 'Run npm --prefix frontend ci (npm.cmd in Windows PowerShell).\n')
    with socket.socket() as frontend, socket.socket() as backend:
        frontend.settimeout(.5)
        if frontend.connect_ex(('127.0.0.1', port)) == 0:
            parser.exit(1, f'Local port {port} is in use. Choose another port with --port.\n')
        backend.bind(('127.0.0.1', 0))
        api_port = backend.getsockname()[1]
        if api_port == port:
            with socket.socket() as alternate:
                alternate.bind(('127.0.0.1', 0))
                api_port = alternate.getsockname()[1]
    database = ROOT / 'data' / 'transfer-demo' / str(port) / 'knowledge-transfer-demo.sqlite3'
    env = {
        **os.environ,
        'CAIL_API_PORT': str(api_port),
        'CAIL_PYTHON_BIN': sys.executable,
        'CAIL_WORKSPACE_USERS': users,
        'CAIL_WORKSPACE_LOCAL_DEMO': 'false',
        'CAIL_TRANSFER_DEMO': 'true',
        'CAIL_TRANSFER_DEMO_ROLES': 'true',
        'CAIL_TRANSFER_DEMO_SEED': 'true',
        'CAIL_LIVE_ENABLED': 'false',
        'CAIL_COOKIE_SECURE': 'false',
        'LEGACY_DATABASE_PATH': str(database),
        'OLLAMA_URL': 'http://127.0.0.1:9',
        'VITE_API_BASE': '/api/v1',
        'VITE_LEGACY_DATA_MODE': 'http',
    }
    try:
        subprocess.run([node, str(ROOT / 'scripts' / 'dev-workspace.mjs'),
                        '--host', '127.0.0.1', '--port', str(port)], cwd=ROOT, env=env, check=True)
    except KeyboardInterrupt:
        pass
    except subprocess.CalledProcessError as error:
        parser.exit(error.returncode, 'Local demo stopped. Check the service error above.\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=5180)
    parser.add_argument('--local', action='store_true', help='Run with Python and Node.js without Docker.')
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error('Choose a localhost port between 1024 and 65535.')
    users = json.dumps(demo_users())
    if args.local:
        start_local(parser, args.port, users)
        return
    env = {**os.environ, 'CAIL_TRANSFER_DEMO_USERS': users, 'CAIL_TRANSFER_DEMO_PORT': str(args.port)}
    compose = ['docker', 'compose', '-p', 'cail-transfer-demo', '-f', 'compose.transfer-demo.yaml']
    try:
        subprocess.run([*compose, 'up', '-d', '--build', '--wait'], cwd=ROOT, env=env, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        parser.exit(1, 'Docker could not start the demo. Run python scripts/start_transfer_demo.py --local to use Python and Node.js.\n')
    subprocess.run([*compose, 'exec', '-T', 'backend', 'python', '-m', 'app.transfer_demo'], cwd=ROOT, env=env, check=True)
    print(f'\nOpen http://localhost:{args.port}/#/graph')
    print('Open a sample solution in the Knowledge Tree, then switch junior operators and try it again.')


if __name__ == '__main__':
    main()
