"""Approved-only retrieval for human-reviewed Decision DNA and public source pointers.

Uses deterministic lexical matching over authorized records, not vector embeddings.
Never treat retrieved text as executable instructions or proof of a root cause.
"""
from __future__ import annotations
import re
from .references import search_sources

_STOPWORDS = {'the', 'and', 'for', 'with', 'what', 'when', 'how', 'why', 'are',
              'was', 'this', 'that', 'from', 'into', 'should', 'would', 'could',
              'our', 'you', 'your', 'about', 'before', 'there', 'has', 'have',
              'during', 'after', 'which', 'each', 'their', 'will', 'them'}


def tokens(value: str) -> set[str]:
    return {word for word in re.findall(r'[a-z0-9]+(?:-[a-z0-9]+)*', value.lower())
            if len(word) > 2 and word not in _STOPWORDS}


def retrieve_approved(query: str, incident: dict, approved_lessons: list[dict],
                      max_lessons: int = 3, max_sources: int = 3) -> dict:
    """Build a bounded, provenance-retaining context of ONLY approved lessons."""
    if not 1 <= max_lessons <= 10 or not 1 <= max_sources <= 8:
        raise ValueError('Retrieval limits outside supported range')
    query_terms = tokens(query)
    matches = []
    legitimate_evidence = {event['id'] for event in incident['events']}
    for lesson in approved_lessons:
        if lesson.get('status') != 'approved' or lesson.get('incident_id') != incident['id']:
            continue
        if not set(lesson.get('evidence_ids', ())).issubset(legitimate_evidence):
            continue
        searchable = ' '.join([
            lesson.get('symptoms', ''), lesson.get('reasoning', ''),
            ' '.join(lesson.get('prerequisites', ())),
            lesson.get('rejected_action', ''), incident['title']
        ])
        overlaps = sorted(query_terms & tokens(searchable))
        if not overlaps:
            continue
        matches.append({
            'id': lesson['id'], 'status': 'approved', 'incident_id': incident['id'],
            'author_alias': lesson['author_alias'],
            'symptoms': lesson['symptoms'][:1200],
            'reasoning': lesson['reasoning'][:1600],
            'prerequisites': lesson['prerequisites'][:15],
            'rejected_action': lesson['rejected_action'][:500],
            'evidence_ids': lesson['evidence_ids'][:25],
            'previous_lesson_id': lesson.get('previous_lesson_id'),
            'match_count': len(overlaps), 'matched_terms': overlaps,
            'citation': {'kind': 'approved_expert_record', 'id': lesson['id'],
                         'review_status': 'approved', 'reviewed_at': lesson.get('reviewed_at')},
        })
    matches.sort(key=lambda m: (-m['match_count'], m['id']))
    sources = search_sources(query, limit=max_sources)
    return {
        'incident_id': incident['id'], 'query': query,
        'status': 'approved_context_found' if matches else 'no_relevant_approved_lessons',
        'approved_lessons': matches[:max_lessons],
        'official_document_pointers': sources['hits'],
        'retrieval_method': 'approved_lesson_lexical_overlap_plus_curated_public_manual_pointers',
        'verified_for_live_use': False,
        'limitations': ('Approved lesson status means a demo reviewer accepted the record, not that a real '
                        'HPE expert or production environment validated it. Document pointers are not '
                        'verbatim source chunks and do not establish exact-message or root-cause matches.'),
    }
