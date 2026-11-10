"""Serve the fictional Knowledge Tree in a dedicated workspace process."""
import argparse
import json
import logging
import os
from pathlib import Path
from threading import Thread
from time import sleep

import uvicorn

from .demo_roster import demo_users


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, required=True)
    parser.add_argument('--data-dir', type=Path, required=True)
    args = parser.parse_args()
    users = demo_users()
    # This process holds only sample data and its own operator identities.
    for key in tuple(os.environ):
        if key.startswith(('CAIL_', 'LEGACY_', 'OLLAMA_')):
            del os.environ[key]
    os.environ.update({
        'LEGACY_DATABASE_PATH': str(args.data_dir.resolve() / 'knowledge-transfer-demo.sqlite3'),
        'CAIL_WORKSPACE_USERS': json.dumps(users),
        'CAIL_WORKSPACE_LOCAL_DEMO': 'false',
        'CAIL_TRANSFER_DEMO': 'true',
        'CAIL_TRANSFER_DEMO_ROLES': 'true',
        'CAIL_LIVE_ENABLED': 'false',
        'OLLAMA_URL': 'http://127.0.0.1:9',
    })

    from .main import app
    from .transfer_demo import run, seed_contributor_knowledge

    state = 'starting'

    @app.get('/api/v1/workspace/practice-ready')
    def readiness():
        return {'status': state}

    server = uvicorn.Server(uvicorn.Config(app, host=args.host, port=args.port, access_log=False))

    def seed():
        nonlocal state
        while not server.started and not server.should_exit:
            sleep(.05)
        if server.should_exit:
            return
        try:
            address = f'http://127.0.0.1:{args.port}'
            _, reviewer, *_ = run(address, users)
            seed_contributor_knowledge(address, users, reviewer)
            state = 'ready'
            print('Knowledge Tree practice is ready.', flush=True)
        except Exception:
            state = 'failed'
            logging.getLogger(__name__).exception('Could not seed Knowledge Tree practice')

    Thread(target=seed, daemon=True).start()
    server.run()


if __name__ == '__main__':
    main()
