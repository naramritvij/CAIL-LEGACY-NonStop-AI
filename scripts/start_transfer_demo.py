"""Start the isolated Docker knowledge transfer demonstration on localhost."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from app.demo_roster import demo_users


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=5180)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error('Choose a localhost port between 1024 and 65535.')
    env = {**os.environ, 'CAIL_TRANSFER_DEMO_USERS': json.dumps(demo_users()), 'CAIL_TRANSFER_DEMO_PORT': str(args.port)}
    compose = ['docker', 'compose', '-p', 'cail-transfer-demo', '-f', 'compose.transfer-demo.yaml']
    subprocess.run([*compose, 'up', '-d', '--build', '--wait'], cwd=ROOT, env=env, check=True)
    subprocess.run([*compose, 'exec', '-T', 'backend', 'python', '-m', 'app.transfer_demo'], cwd=ROOT, env=env, check=True)
    print(f'\nOpen http://localhost:{args.port}/#/graph')
    print('Open a sample solution in the Knowledge Tree, then switch junior operators and try it again.')


if __name__ == '__main__':
    main()
