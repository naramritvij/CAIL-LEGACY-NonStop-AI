"""Read-only native dataset and export adapters, without demo endpoints.

Admin-supplied Prognosis row mappings and literal MOMI exports become observation
networks. A reported alarm is not a physical dependency or verified root cause.
"""
from __future__ import annotations

import base64
import csv
from datetime import datetime, timezone
import hashlib
from io import StringIO
import json
import os
from pathlib import Path
import re
import ssl
from urllib.parse import urlsplit
from urllib.request import HTTPSHandler, Request, build_opener

from fastapi import HTTPException
from . import live_sources

MAX_BYTES = 16 * 1024 * 1024
DEFAULT_FIELDS = {'id': 'ProblemId', 'node': 'NodeName', 'message': 'Description', 'category': 'Category', 'severity': 'Severity', 'timestamp': 'TimeRaised', 'state': 'State'}


def mode(source):
    if source == 'prognosis' and os.getenv('CAIL_PROGNOSIS_DATASET_URL', '').strip():
        return 'prognosis_rest_dataset'
    if source == 'momi' and os.getenv('CAIL_MOMI_EXPORT_DIR', '').strip():
        return 'momi_export_directory'
    return None


def configured(source):
    if not live_sources._enabled():
        raise HTTPException(503, 'Live source reads are disabled')
    kind = mode(source)
    system = os.getenv(f'CAIL_{source.upper()}_SYSTEM_ID', '').strip()
    if not system or len(system) > 120:
        raise HTTPException(503, 'Set the expected source system ID before enabling native reads')
    if kind == 'prognosis_rest_dataset':
        url = os.getenv('CAIL_PROGNOSIS_DATASET_URL', '').strip()
        parsed = urlsplit(url)
        allowed = {item.strip().lower() for item in os.getenv('CAIL_LIVE_ALLOWED_HOSTS', '').split(',') if item.strip()}
        user, password = os.getenv('CAIL_PROGNOSIS_USER', ''), os.getenv('CAIL_PROGNOSIS_PASSWORD', '')
        if (parsed.scheme != 'https' or not parsed.hostname or parsed.hostname.lower() not in allowed or
                parsed.username or parsed.password or parsed.fragment or not user or not password or len(user) > 300 or len(password) > 1000 or
                any(char in url for char in ('\r', '\n'))):
            raise HTTPException(503, 'Prognosis dataset needs a fixed allowlisted HTTPS URL and server-only credentials')
        fields()
        return {'mode': kind, 'system_id': system, 'url': url, 'user': user, 'password': password}
    if kind == 'momi_export_directory':
        path = Path(os.environ['CAIL_MOMI_EXPORT_DIR']).expanduser()
        if not path.is_absolute() or not path.is_dir():
            raise HTTPException(503, 'Configure an existing absolute MOMI export directory')
        return {'mode': kind, 'system_id': system, 'directory': path.resolve()}
    raise HTTPException(503, 'Native source read is not configured')


def fields():
    try:
        overrides = json.loads(os.getenv('CAIL_PROGNOSIS_FIELDS', '') or '{}')
        if not isinstance(overrides, dict) or set(overrides) - set(DEFAULT_FIELDS):
            raise ValueError()
        if any(not isinstance(value, str) or not 1 <= len(value) <= 100 for value in overrides.values()):
            raise ValueError()
        return {**DEFAULT_FIELDS, **overrides}
    except (ValueError, TypeError):
        raise HTTPException(503, 'CAIL_PROGNOSIS_FIELDS must map known fields to dataset column names') from None


def row_list(raw):
    if isinstance(raw, list):
        rows = raw
    else:
        path = os.getenv('CAIL_PROGNOSIS_ROWS_KEY', '').strip()
        if path:
            value = raw
            try:
                if len(path) > 150 or len(path.split('.')) > 5:
                    raise ValueError()
                for key in path.split('.'):
                    value = value[key]
            except (KeyError, TypeError, ValueError):
                raise ValueError('The configured dataset rows key was not found') from None
            rows = value
        elif isinstance(raw, dict):
            candidates = [raw[key] for key in ('data', 'rows', 'Data', 'Records') if isinstance(raw.get(key), list)]
            if len(candidates) != 1:
                raise ValueError('Set CAIL_PROGNOSIS_ROWS_KEY for this dataset response shape')
            rows = candidates[0]
        else:
            raise ValueError('Expected JSON dataset rows')
    if not isinstance(rows, list) or len(rows) > 5000 or any(not isinstance(row, dict) for row in rows):
        raise ValueError('A monitoring export supports at most 5,000 row objects')
    return rows


def prognosis_records(raw):
    mapping = fields()
    result = []
    for row in row_list(raw):
        record = {key: row.get(column) for key, column in mapping.items()}
        if not record['node'] or not record['message'] or record['id'] is None:
            raise ValueError('Prognosis rows require mapped ID, node and message columns')
        result.append(record)
    return result


def momi_records(text):
    text = text.replace('\xa0', ' ').replace('\r\n', '\n').lstrip('\ufeff').strip()
    if not text:
        return []
    records = []
    if re.match(r'\s*[A-Za-z_-]+\s*=', text):
        for block in re.split(r'\n\s*\n', text):
            data = {}
            for line in block.splitlines():
                key, separator, value = line.partition('=')
                if separator:
                    data[key.strip().lower()] = value.strip()
            if not data.get('node') or not data.get('text'):
                raise ValueError('MOMI alarm blocks require node and text fields')
            records.append({'id': data.get('id') or hashlib.sha256(block.encode()).hexdigest()[:24],
                            'node': data['node'], 'message': data['text'], 'category': data.get('entity'),
                            'severity': data.get('action'), 'state': data.get('state'),
                            'timestamp': data.get('timestamp') or ' '.join(value for value in (data.get('date'), data.get('time')) if value)})
    else:
        rows = list(csv.reader(StringIO(text), delimiter='\t'))
        header = [value.strip().lower() for value in rows[0]] if rows else []
        has_header = 'node' in header and ('text' in header or 'message' in header)
        for ordinal, values in enumerate(rows[1:] if has_header else rows):
            if not any(value.strip() for value in values):
                continue
            if has_header:
                data = dict(zip(header, values))
                node, message = data.get('node'), data.get('text') or data.get('message')
                timestamp = data.get('timestamp') or ' '.join(value for value in (data.get('date'), data.get('time')) if value)
            else:
                if len(values) < 4:
                    raise ValueError('MOMI TAB exports require date, time, node and alarm text columns')
                node, message, timestamp = values[2], values[3], values[0] + ' ' + values[1]
            if not node or not message:
                raise ValueError('A MOMI export row is missing its node or alarm text')
            records.append({'id': hashlib.sha256(('\t'.join(values) + ':' + str(ordinal)).encode()).hexdigest()[:24],
                            'node': node, 'message': message, 'timestamp': timestamp})
    if len(records) > 5000:
        raise ValueError('MOMI exports support at most 5,000 alarm rows')
    return records


def canonical_system(value):
    return str(value).strip().lstrip('\\').upper()


def observation_network(records, source, expected_system=None):
    nodes, edges = {}, []
    # This is the actual data collection, not a made-up NonStop component.
    nodes['collection'] = {'id': 'collection', 'label': source.upper() + ' observation dataset', 'type': 'observation_dataset',
                           'properties': {'record_count': len(records), 'physical_topology': False, 'health_conclusion': 'not_inferred'}}
    for ordinal, record in enumerate(records):
        name = str(record['node']).strip()
        if not name or len(name) > 120:
            raise ValueError('A monitoring row has an invalid source node name')
        if expected_system and canonical_system(name) != canonical_system(expected_system):
            raise ValueError('Dataset contains a node outside the configured source system scope')
        system_id = 'system:' + canonical_system(name)
        nodes.setdefault(system_id, {'id': system_id, 'label': name, 'type': 'reported_system', 'properties': {'basis': 'source_node_column'}})
        source_id = str(record['id']).strip()
        if not source_id or len(source_id) > 200:
            raise ValueError('Monitoring record IDs must contain 1–200 characters')
        alarm_id = 'alarm:' + hashlib.sha256((source_id + '\0' + system_id).encode()).hexdigest()[:24]
        if alarm_id in nodes:
            raise ValueError('Duplicate monitoring record ID for the same source system')
        message = str(record['message'])
        props = {'source_record_id': source_id, 'message_excerpt': message[:1000], 'message_sha256': hashlib.sha256(message.encode()).hexdigest(),
                 'message_truncated': len(message) > 1000, 'event_timestamp': str(record.get('timestamp') or 'not supplied')[:1000],
                 'timestamp_timezone': 'as_exported_not_assumed_UTC', 'severity': str(record.get('severity') or 'not supplied')[:1000],
                 'state': str(record.get('state') or 'not supplied')[:1000]}
        nodes[alarm_id] = {'id': alarm_id, 'label': message[:160] or source_id, 'type': 'reported_alarm', 'status': 'source_reported', 'properties': props}
        edges.extend([{'id': f'row:{ordinal}', 'source': 'collection', 'target': alarm_id, 'label': 'contains observation'},
                      {'id': f'node:{ordinal}', 'source': alarm_id, 'target': system_id, 'label': 'reported on'}])
        category = str(record.get('category') or '').strip()
        if category:
            category_id = 'category:' + hashlib.sha256(category.encode()).hexdigest()[:24]
            nodes.setdefault(category_id, {'id': category_id, 'label': category[:240], 'type': 'reported_category'})
            edges.append({'id': f'category:{ordinal}', 'source': alarm_id, 'target': category_id, 'label': 'categorized as'})
    from .workspace_topology import normalize
    return normalize({'nodes': list(nodes.values()), 'edges': edges})


def parse_export(source, filename, raw):
    if len(raw) > MAX_BYTES:
        raise ValueError('Monitoring exports are limited to 16 MB')
    text = raw.decode('utf-8-sig')
    if source == 'prognosis' and filename.lower().endswith('.json'):
        records = prognosis_records(json.loads(text))
    elif source == 'momi' and Path(filename).suffix.lower() in ('.txt', '.log', '.tsv'):
        records = momi_records(text)
    else:
        raise ValueError('Use Prognosis JSON or a MOMI UTF-8 TXT/LOG/TSV alarm export')
    return observation_network(records, source)


def read(source):
    configuration = configured(source)
    try:
        if configuration['mode'] == 'prognosis_rest_dataset':
            auth = base64.b64encode((configuration['user'] + ':' + configuration['password']).encode()).decode()
            request = Request(configuration['url'], method='GET', headers={'Authorization': 'Basic ' + auth, 'Accept': 'application/json'})
            opener = build_opener(live_sources._NoRedirect(), HTTPSHandler(context=ssl.create_default_context()))
            with opener.open(request, timeout=15) as response:
                if response.status != 200 or 'application/json' not in response.headers.get('Content-Type', ''):
                    raise ValueError('Expected a JSON Prognosis dataset')
                raw = response.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                raise ValueError('Prognosis dataset exceeds 16 MB')
            records = prognosis_records(json.loads(raw))
            observed = datetime.now(timezone.utc).isoformat()
        else:
            directory = configuration['directory']
            candidates = [path for path in directory.iterdir() if path.is_file() and not path.is_symlink() and path.suffix.lower() in ('.txt', '.log', '.tsv')]
            if not candidates:
                raise ValueError('No MOMI alarm export is available')
            path = max(candidates, key=lambda item: item.stat().st_mtime)
            before = path.stat()
            observed_time = datetime.fromtimestamp(before.st_mtime, timezone.utc)
            if not -60 <= (datetime.now(timezone.utc) - observed_time).total_seconds() <= live_sources.MAX_AGE_SECONDS:
                raise ValueError('Latest MOMI export is stale; configure scheduled fresh exports')
            with path.open('rb') as stream:
                raw = stream.read(MAX_BYTES + 1)
            after = path.stat()
            if len(raw) > MAX_BYTES or (before.st_mtime_ns, before.st_size) != (after.st_mtime_ns, after.st_size):
                raise ValueError('MOMI export is oversized or changed during the read')
            records, observed = momi_records(raw.decode('utf-8-sig')), observed_time.isoformat()
        return {'payload': observation_network(records, source, configuration['system_id']), 'system_id': configuration['system_id'],
                'observed_at': observed, 'sha256': hashlib.sha256(raw).hexdigest()}
    except HTTPException:
        raise
    except Exception:
        # Transport exceptions can contain URLs/user info. Keep those server-only.
        raise HTTPException(502, 'Native monitoring read failed. Check source access, field mapping, system scope and export freshness. No demo substituted.') from None


def evidence(source):
    snapshot = read(source)
    rows = [node for node in snapshot['payload']['nodes'] if node['entity_type'] == 'reported_alarm']
    records = []
    for row in rows[:live_sources.MAX_RECORDS]:
        properties = row['properties']
        records.append({'id': row['id'], 'message': properties['message_excerpt'], 'component': snapshot['system_id'],
                        'severity': properties['severity'], 'state': properties['state'],
                        'source_record_id': properties['source_record_id'], 'event_timestamp_raw': properties['event_timestamp']})
    return {'tool_id': source, 'system_id': snapshot['system_id'], 'connected': True, 'synthetic': False,
            'mode': mode(source), 'provenance': 'configured_read_only_native_dataset_or_export',
            'observed_at': snapshot['observed_at'], 'age_seconds': round((datetime.now(timezone.utc) - live_sources._timestamp(snapshot['observed_at'])).total_seconds(), 1),
            'snapshot_sha256': snapshot['sha256'], 'health_signal': 'unknown', 'evidence': records,
            'total_record_count': len(rows), 'evidence_truncated': len(rows) > len(records),
            'execution_allowed': False, 'state_change_executed': False,
            'limitations': 'Source-reported observations, not a full health assessment or device attestation. MOMI observation time is export-file time; event timestamps are retained as exported without an assumed timezone.'}
