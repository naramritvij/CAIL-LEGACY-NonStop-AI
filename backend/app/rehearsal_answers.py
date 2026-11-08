"""Compose scoped answers from the actual saved replay observations.

Training chats use bounded read intents. They do not call model, shell,
live connectors or the full incident fixture after a checkpoint is opened.
"""
from __future__ import annotations

import re

from .operations_lab import NATIVE, PROHIBITED
from .policy import requests_state_change

EVENT_ID = re.compile(r'\bSIM-EVT-\d+\b', re.I)
CASE_ID = re.compile(r'\bINC-(?:[A-Z0-9]+-)+\d+\b', re.I)
SYSTEM_ID = re.compile(r'\b(?:SIMULATED-NONSTOP|SIM-[A-Z]+)(?:-[A-Z0-9]+)+\b', re.I)
FIXTURE_SOURCE = re.compile(r'\b[a-z]+-(?:monitor|audit)\b', re.I)


def cited_lines(events):
    return '\n'.join(f'- {event["time"]} · {event["source"]} · {event["message"]} [{event["id"]}]' for event in events)


def trend_text(info):
    return (f'The replay rose to {info["latest_value"]}% at {info["rate"]:g} percentage points per minute. '
            f'At the same rate it would reach the {info["threshold"]}% exercise threshold in '
            f'{info["minutes_remaining"]} minutes. This projection assumes the recent rate continues.')


def select(context, question):
    lower = question.casefold()
    events = context['events']
    if requests_state_change(question) or any(mark in question for mark in (';', '&&', '||', '`')):
        return 'unsafe_request', 'The rehearsal supports authorized read-only checks and escalation. State-changing or compound commands are blocked.', []
    case_ids = {value.upper() for value in CASE_ID.findall(question)}
    systems = {value.upper() for value in SYSTEM_ID.findall(question) if not value.upper().startswith('SIM-EVT-')}
    if case_ids - {context['case_id']} or systems - {context['system']} or re.search(r'\\[a-z][a-z0-9_-]+', lower):
        return 'scope_mismatch', f'This conversation is pinned to {context["case_id"]} on {context["system"]}. Select the requested case in Incident lab.', []
    if re.search(r'\b(?:actual|real|production|live)\b', lower) and re.search(r'\b(?:status|health|data|read|cpu|alerts?|system|metrics?|prognosis|asap|momi)\b', lower):
        return 'live_unavailable', 'This conversation contains synthetic observations from a saved checkpoint. Authorized site reads are available separately in Connections.', []
    if re.search(r'\b(?:(?:future|unrevealed) (?:timeline|events?|records?|observations?)|later checkpoint|next checkpoint|remaining events)\b', lower):
        return 'outside_checkpoint', f'Only the observations visible at checkpoint {context["checkpoint"]} through {context["as_of"]} are available.', []
    ids = {value.upper() for value in EVENT_ID.findall(question)}
    if ids:
        selected = [event for event in events if event['id'] in ids]
        if len(selected) != len(ids):
            return 'outside_checkpoint', 'One or more requested observations are outside this checkpoint.', []
        return 'observed', cited_lines(selected), selected
    exact = ' '.join(question.strip().rstrip('?').split()).upper()
    if exact.startswith('STATUS '):
        reference = NATIVE.get(exact)
        if not reference:
            return 'unsupported_reference', 'Choose a registered read-only reference or ask about the observations shown in the replay.', []
        if context['case_id'] not in reference['allowed_incidents']:
            return 'scope_mismatch', 'That reference belongs to another incident. Choose a check for this case.', []
        return ('reference_only',
                f'`{exact}` is a command reference. Target release, permissions and native output are unknown. '
                f'See the [HPE command reference]({reference["manual_url"]}).', [])
    if re.search(r'\b(?:root cause|cause|caused|causal|prove|certain|conclude|confirmed recovery|recovered)\b', lower):
        return ('cause_unverified', f'The cause and recovery state remain unverified. {context["unknowns"]}\n\n'
                + cited_lines(events), events)
    if re.search(r'\b(?:handoff|hand over|hand off|brief|debrief|shift summary|escalation summary)\b', lower):
        projection = '\n\n' + trend_text(context['trend']) if context['trend'] else ''
        return ('handoff', f'**{context["title"]} · {context["system"]} · as of {context["as_of"]}**\n\n'
                + cited_lines(events) + f'\n\n**Unresolved** · {context["unknowns"]}\n\n'
                + f'**Next authorized check** · {context["next_check"]}' + projection, events)
    if re.search(r'\b(?:still (?:unknown|unresolved)|what is unknown|what remains unknown|unverified details)\b', lower):
        return 'uncertainty', context['unknowns'], []
    if re.search(r'\b(?:next step|next check|read-only check|what should i (?:check|do|verify|read)|which (?:read|check|evidence)|verify next|what to (?:check|verify)|safe action|before escalating)\b', lower):
        return ('next_check', f'{context["next_check"]}\n\n**Limits** · {context["unknowns"]}\n\n'
                + cited_lines(events), events)
    if re.search(r'\b(?:trend|forecast|projection|project|estimate|threshold time|how long until|time to threshold|run out)\b', lower):
        if context['trend']:
            return 'trend_watch', trend_text(context['trend']) + '\n\n' + cited_lines(events), events
        return ('trend_unavailable', 'The visible checkpoint lacks the three comparable measurements and threshold required for a projection. '
                + cited_lines(events), events)
    if re.search(r'\b(?:system identity|which system|which node|what system|scope|cutoff|as of|checkpoint time)\b', lower):
        return ('scope', f'This synthetic replay is {context["case_id"]} on {context["system"]}, '
                f'checkpoint {context["checkpoint"]}, through {context["as_of"]}.', [])
    requested_source = FIXTURE_SOURCE.search(lower)
    if requested_source:
        selected = [event for event in events if event['source'] == requested_source[0]]
        if not selected:
            return 'source_unavailable', 'That source has no registered observation at this checkpoint.', []
        return 'observed', cited_lines(selected), selected
    if re.search(r'\b(?:latest|most recent|last observation|current observation)\b', lower):
        return 'observed', cited_lines(events[-1:]), events[-1:]
    if re.search(r'\b(?:timeline|chronolog\w*|observations?|evidence|events?|what happened|what changed|records?|symptoms?|warnings?|reading|observed|reported|recorded)\b', lower):
        return 'observed', cited_lines(events), events
    # Handle state-changing synonyms outside the explicit command pattern conservatively.
    if PROHIBITED.search(lower):
        return 'unsafe_request', 'This operation is blocked. Choose an authorized read-only check or escalation from the rehearsal.', []
    return 'needs_clarification', 'Ask about the observed timeline, a source record, what is still unknown, or the next read-only check.', []


def answer(context, question, history):
    status, text, events = select(context, question)
    evidence = [{
        'id': event['id'], 'title': f'{event["source"]} · {event["time"]}',
        'text': event['message'], 'type': 'rehearsal_observation', 'synthetic': True,
        'source_id': event['source'], 'system_id': context['system'],
    } for event in events]
    return {
        'status': status, 'route': 'rehearsal', 'answer': text, 'sources': evidence,
        'citations': [item['id'] for item in evidence], 'model': None,
        'memory': {'saved_turns_before': len(history), 'context_turns': 0},
        'trace': [
            {'agent': 'Rehearsal', 'status': 'complete',
             'detail': f'Synthetic snapshot through {context["as_of"]}. {len(context["events"])} visible observations.', 'elapsed_ms': 0},
            {'agent': 'Evaluator', 'status': 'complete', 'detail': 'Citations are limited to the saved checkpoint.', 'elapsed_ms': 0},
        ],
        'rehearsal': {key: context[key] for key in ('run_id', 'case_id', 'checkpoint', 'as_of')},
        'synthetic': True, 'execution_allowed': False, 'state_change_executed': False,
    }
