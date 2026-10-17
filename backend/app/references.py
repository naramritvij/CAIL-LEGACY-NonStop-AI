"""Offline HPE documentation pointer search.

Reference facts have been manually reviewed against the publicly accessible
HPE documents. They are summaries, not full copyrighted manual reproductions
or validated links to the invented SIM-EVT scenario identifiers.
"""
from __future__ import annotations
import re
from typing import Optional

# A few vetted, attribution-preserving source pointers, not an arbitrary web crawler.
SOURCE_REGISTRY = (
    {
        'id': 'HPE-OPERATOR-INTRO',
        'title': 'HPE NonStop Operator Messages Manual — Introduction',
        'section': 'The Message Header / How to Find a Message',
        'url': 'https://support.hpe.com/hpesc/public/docDisplay?docId=c03911514en_us&docLocale=en_US&page=ch01_Introduction.html',
        'summary': 'To look up a NonStop operator message, identify its actual subsystem name and event number. Operator message headers contain subsystem ID, event number, generation time, system and process/processor information.',
        'keywords': ('EMS', 'operator', 'event', 'number', 'subsystem', 'message', 'lookup', 'header', 'system', 'processor'),
        'scope': 'message-lookup-method',
    },
    {
        'id': 'HPE-EMS-CHAPTER',
        'title': 'HPE NonStop Operator Messages Manual — EMS Messages',
        'section': 'EMS (Event Management Service) Messages',
        'url': 'https://support.hpe.com/hpesc/public/docDisplay?docId=c03911514en_us&docLocale=en_US&page=EMS_Messages.html',
        'summary': 'EMS stands for Event Management Service. This chapter describes messages issued under the EMS subsystem ID, including collector and distributor messages; it is not a definition for every subsystem event.',
        'keywords': ('EMS', 'event', 'management', 'service', 'collector', 'distributor', 'operator', 'messages'),
        'scope': 'ems-subsystem',
    },
    {
        'id': 'HPE-DISK-CHAPTER',
        'title': 'HPE NonStop Operator Messages Manual — DISK Messages',
        'section': 'Table of contents: DISK Messages',
        'url': 'https://support.hpe.com/hpesc/public/docDisplay?docId=c03911514en_us&docLocale=en_US',
        'summary': 'The operator messages manual contains a dedicated DISK chapter. An exact message explanation requires the real subsystem name and event number; a synthetic capacity threshold alone does not identify one.',
        'keywords': ('disk', 'capacity', 'volume', 'utilization', 'device', 'space', 'file', 'storage'),
        'scope': 'chapter-pointer-only',
    },
    {
        'id': 'HPE-PATHWAY-CHAPTER',
        'title': 'HPE NonStop Operator Messages Manual — PATHWAY Messages',
        'section': 'Table of contents: PATHWAY Messages',
        'url': 'https://support.hpe.com/hpesc/public/docDisplay?docId=c03911514en_us&docLocale=en_US',
        'summary': 'The operator messages manual lists a PATHWAY messages chapter. A synthetic service-health observation is not sufficient to match any particular official operator message.',
        'keywords': ('pathway', 'service', 'server', 'process', 'latency', 'response', 'degradation'),
        'scope': 'chapter-pointer-only',
    },
    {
        'id': 'HPE-SCF-L-SUBSYS-STATUS',
        'title': 'HPE NonStop SCF Reference Manual for Kernel Subsystem — STATUS Command',
        'section': 'STATUS Command, L-Series technical update',
        'url': 'https://support.hpe.com/hpesc/public/docDisplay?docId=c04583315en_us&docLocale=en_US&page=GUID-D7147C7F-2016-0901-02DF-0000000004D7.html',
        'summary': 'The L-Series kernel SCF STATUS command displays current status information about an object and is documented as nonsensitive. Object and release applicability must be verified before use.',
        'keywords': ('SCF', 'status', 'kernel', 'L-series', 'object', 'subsys', 'nonstop', 'command'),
        'scope': 'l-series-kernel-reference',
    },
)

_STOP = {'the','and','what','why','with','from','into','about','after','which','should','before',
         'that','this','your','have','does','real','test','how','for','its','are','has','not','need',
         'can','our','will','any','was','the','where','what','when','verify','show'}


def _tokens(value: str) -> set[str]:
    return {x for x in re.findall(r'[a-z0-9]+(?:-[a-z0-9]+)*', value.lower())
            if len(x) > 2 and x not in _STOP}


def source_list() -> list[dict]:
    return [{k: v for k, v in s.items() if k != 'keywords'} |
            {'source_type': 'official_hpe_public_manual_pointer',
             'contains_full_manual': False, 'validated_for_live_system': False}
            for s in SOURCE_REGISTRY]


def search_sources(query: str, limit: int = 4) -> dict:
    """Reproducible lexical lookup. It is NOT semantic/vector RAG."""
    terms = _tokens(query[:500])
    hits = []
    if terms:
        for source in SOURCE_REGISTRY:
            doc_terms = _tokens(' '.join(source['keywords']) + ' ' + source['summary'] + ' ' + source['title'])
            common = sorted(terms & doc_terms)
            if not common:
                continue
            record = {k: v for k, v in source.items() if k != 'keywords'}
            record.update({'matching_terms': common, 'match_count': len(common),
                           'ranking_method': 'lexical_overlap_not_confidence',
                           'source_type': 'official_hpe_public_manual_pointer',
                           'contains_full_manual': False,
                           'validated_for_live_system': False})
            hits.append(record)
    hits.sort(key=lambda item: (-item['match_count'], item['id']))
    return {'status': 'matches' if hits else 'no_source_match',
            'query': query, 'hits': hits[:limit],
            'retrieval_method': 'offline_curated_lexical_source_pointers',
            'limitations': ('These are independently attributed document pointers and curated summaries, '
                            'not validated exact message matches or a vector embedding RAG corpus.')}
