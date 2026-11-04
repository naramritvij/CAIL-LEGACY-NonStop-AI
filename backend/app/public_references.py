"""A fixed publisher catalog; no arbitrary URL fetch or bundled manual copies."""
from __future__ import annotations

import hashlib
import re
import ssl
from urllib.request import HTTPSHandler, Request, build_opener

from fastapi import HTTPException
from . import live_sources, workspace_store as store

MAX_BYTES = 32 * 1024 * 1024
CATALOG = {
    'hpe-nonstop-hardening': {
        'title': 'HPE NonStop Security Hardening Guide', 'topic': 'NonStop security',
        'url': 'https://support.hpe.com/hpesc/public/api/document/c04705427?v=1774494064000',
        'publisher_page': 'https://support.hpe.com/hpesc/public/docDisplay?docId=c04705427&docLocale=en_US'},
    'hpe-tacl-reference': {
        'title': 'HPE NonStop TACL Reference Manual', 'topic': 'TACL reference',
        'url': 'https://support.hpe.com/hpesc/public/api/document/c04577061',
        'publisher_page': 'https://support.hpe.com/hpesc/public/docDisplay?docId=c04577061&docLocale=en_US'},
}


def catalog():
    return {'references': [{'key': key, 'title': value['title'], 'publisher_page': value['publisher_page']} for key, value in CATALOG.items()],
            'source_kind': 'public_hpe_reference', 'customer_monitoring_data': False}


def download(key):
    entry = CATALOG.get(key)
    if not entry:
        raise HTTPException(404, 'Unknown publisher reference')
    try:
        opener = build_opener(live_sources._NoRedirect(), HTTPSHandler(context=ssl.create_default_context()))
        request = Request(entry['url'], headers={'Accept': 'application/pdf', 'User-Agent': 'CAIL-reference-import/1'}, method='GET')
        with opener.open(request, timeout=20) as response:
            if response.status != 200 or 'application/pdf' not in response.headers.get('Content-Type', ''):
                raise ValueError()
            raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES or not raw.startswith(b'%PDF'):
            raise ValueError()
        return raw
    except Exception:
        raise HTTPException(502, 'The publisher PDF could not be read. You can download it from HPE and use Reference manual upload instead.') from None


def import_reference(user, key, extract_text, target_node_id=None):
    raw = download(key)
    entry = CATALOG[key]
    text = extract_text(key + '.pdf', raw)
    parts = [match.group(0).strip() for match in re.finditer(r'(?:Part Number|Published|Edition|Version)\s*:[^\n]{1,180}', text[:5000])]
    edition = ' · '.join(parts)[:240] or 'Edition shown in downloaded PDF; review applicability'
    digest = hashlib.sha256(raw).hexdigest()
    with store.database() as db:
        db.execute('BEGIN IMMEDIATE')
        existing = db.execute('SELECT d.id FROM ws_documents d JOIN ws_document_sources s ON s.document_id=d.id WHERE d.owner_id=? AND s.file_sha256=? AND s.source_url=?', (user['id'], digest, entry['url'])).fetchone()
        if existing:
            identifier = existing['id']
            if target_node_id:
                from .workspace_topology import require_node
                from uuid import uuid4
                require_node(db, user, target_node_id)
                result = db.execute('INSERT OR IGNORE INTO ws_graph_links VALUES (?,?,?,?,?)', (str(uuid4()), identifier, target_node_id, user['id'], store.now()))
                if result.rowcount:
                    store.event(db, user, 'linked', identifier, {'target_node_id': target_node_id})
        else:
            identifier = store.insert_document(db, user, entry['title'], key + '.pdf', text, entry['topic'], target_node_id, max_chars=2_000_000)
            db.execute('INSERT INTO ws_document_sources VALUES (?,?,?,?,?)', (identifier, entry['url'], edition, 'downloaded_public_hpe_reference', digest))
        db.execute('COMMIT')
    return store.document(user, identifier, record_access=False)
