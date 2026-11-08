"""Start the isolated Docker knowledge transfer demonstration on localhost."""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=5180)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error('Choose a localhost port between 1024 and 65535.')
    root = Path(__file__).resolve().parents[1]
    users = [
        {'id': 'transfer-expert', 'name': 'Demo expert', 'can_manage_members': True, 'can_review': True},
        {'id': 'transfer-reviewer', 'name': 'Demo independent reviewer', 'can_review': True},
        {'id': 'transfer-learner', 'name': 'Demo learner'},
    ]
    for user in users:
        user['key'] = secrets.token_urlsafe(36)
    env = {**os.environ, 'CAIL_TRANSFER_DEMO_USERS': json.dumps(users), 'CAIL_TRANSFER_DEMO_PORT': str(args.port)}
    compose = ['docker', 'compose', '-p', 'cail-transfer-demo', '-f', 'compose.transfer-demo.yaml']
    subprocess.run([*compose, 'up', '-d', '--build', '--wait'], cwd=root, env=env, check=True)
    subprocess.run([*compose, 'exec', '-T', 'backend', 'python', '-m', 'app.transfer_demo'], cwd=root, env=env, check=True)
    print(f'\nOpen http://localhost:{args.port}/#/graph')
    print('Inspect the learner’s verified receipt, then use Switch demo role to follow the practice handoff.')


if __name__ == '__main__':
    main()
