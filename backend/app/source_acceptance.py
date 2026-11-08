"""Validate authorized source reads and print a metadata-only acceptance receipt."""
from __future__ import annotations

import argparse
import json
import os

from .transfer_demo import OperatorSession
from .vendor_datasets import canonical_system
from .workspace_identity import configured_users

SOURCES = ('prognosis', 'asap', 'momi')


def verify(session, selected):
    configured = {source['id']: source for source in session.call('/connections')['sources']}
    result = []
    for identifier in selected:
        scope = canonical_system(os.getenv(f'CAIL_{identifier.upper()}_SYSTEM_ID', ''))
        source = configured[identifier]
        item = {'source': identifier, 'status': 'configuration_required', 'checks': []}
        result.append(item)
        if not scope or not source['configured']:
            item['reason'] = 'Set the authorized read configuration and expected system scope.'
            continue
        try:
            if source['metrics_configured']:
                snapshot = session.call('/connections/' + identifier + '/check', {})
                if (canonical_system(snapshot['system_id']) != scope or snapshot['synthetic'] or
                        snapshot['execution_allowed'] or not snapshot['connected']):
                    raise RuntimeError('Unexpected source identity or read contract.')
                item['checks'].append({
                    'mode': snapshot['mode'], 'system_id': snapshot['system_id'],
                    'observed_at': snapshot['observed_at'], 'records': len(snapshot['evidence']),
                    'sha256': snapshot['snapshot_sha256'], 'health': snapshot['health_signal'],
                })
            if source['topology_configured']:
                summary = session.call('/graph/sync?source_id=' + identifier, {})
                topology = next((entry for entry in summary['sources'] if entry['id'] == identifier), None)
                if not topology or topology['status'] != 'connected' or canonical_system(topology['system_id']) != scope:
                    raise RuntimeError('The topology read did not verify the expected scope.')
                item['checks'].append({
                    'mode': source['topology_mode'], 'system_id': topology['system_id'],
                    'observed_at': topology['observed_at'], 'nodes': topology['node_count'],
                    'relationships': topology['edge_count'], 'sha256': topology['snapshot_sha256'],
                })
            item['status'] = 'verified' if item['checks'] else 'configuration_required'
        except (OSError, RuntimeError, ValueError, KeyError):
            item['status'] = 'failed'
            item['reason'] = 'Check Connections for the failed read, source mapping, identity or freshness.'
    return {'read_only': True, 'sources': result, 'verified': all(item['status'] == 'verified' for item in result)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--operator', help='Configured operator ID with authorized live read access')
    parser.add_argument('--source', action='append', choices=SOURCES)
    args = parser.parse_args()
    eligible = [user for user in configured_users()
                if user.get('can_read_live') is True and (not args.operator or user['id'] == args.operator)]
    if len(eligible) != 1:
        parser.error('Choose one configured live-read operator using --operator.')
    session = OperatorSession('http://127.0.0.1:8000', eligible[0]['key'], demo_only=False)
    result = verify(session, args.source or SOURCES)
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result['verified'] else 1)


if __name__ == '__main__':
    main()
