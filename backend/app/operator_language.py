"""Operator-confirmed wording used to interpret later requests."""
from __future__ import annotations

from dataclasses import dataclass
import re
import unicodedata

from .policy import requests_state_change


_TEACH = re.compile(r'(?:when|if) i (?:say|ask)\s+(.+?)(?:,\s*|\s+)i mean\s+(.+)', re.I)
_CORRECT = re.compile(
    r'(?:actually,?\s+)?i meant\s+(.+?)[.!]\s+(?:please\s+)?remember (?:that|this) for next time[.!]?',
    re.I,
)
_FORGET = re.compile(r'forget what i mean by\s+(.+)', re.I)
_REQUEST_START = re.compile(
    r'^(?:(?:can|could|would) you )?(?:please )?'
    r'(?:(?:check|show me|give me|look at|look up|pull up) )?(?:the )?'
)
_CONTEXT_ONLY = {'again', 'continue', 'go ahead', 'how', 'it', 'okay', 'that', 'this', 'what', 'where', 'why', 'yes'}


@dataclass(frozen=True)
class LanguageEdit:
    phrase: str
    key: str
    meaning: str | None = None


def phrase_key(text: str) -> str:
    text = ' '.join(unicodedata.normalize('NFKC', text).casefold().split()).rstrip(' .!?')
    text = re.sub(r',? please$', '', text)
    key = _REQUEST_START.sub('', text, count=1)
    return '' if key in _CONTEXT_ONLY else key


def _unquote(text: str) -> str:
    text = text.strip()
    outer = text.rstrip('.!?').rstrip()
    if len(outer) >= 2 and (outer[0], outer[-1]) in {('"', '"'), ("'", "'"), ('“', '”'), ('‘', '’')}:
        return outer[1:-1].strip()
    return text


def _reply(answer: str, status: str, edit: LanguageEdit | None = None):
    return ({
        'answer': answer, 'status': status, 'route': 'language', 'sources': [],
        'citations': [], 'trace': [], 'model': None, 'execution_allowed': False,
        'state_change_executed': False,
    }, edit)


def instruction(question: str, history: list[dict]):
    """Only explicit teaching or a correction marked for next time is durable."""
    teach = _TEACH.fullmatch(question)
    correct = _CORRECT.fullmatch(question)
    forget = _FORGET.fullmatch(question)
    if teach:
        phrase, meaning = map(_unquote, teach.groups())
    elif correct:
        phrase = next((turn['content'] for turn in reversed(history) if turn['role'] == 'user'), '')
        if any(pattern.fullmatch(phrase) for pattern in (_TEACH, _CORRECT, _FORGET)):
            phrase = ''
        meaning = _unquote(correct[1])
    elif forget:
        phrase, meaning = _unquote(forget[1]), None
    else:
        return None

    key = phrase_key(phrase)
    if not 3 <= len(key) <= 120 or len(phrase) > 120:
        return _reply('Give me a specific phrase between 3 and 120 characters to associate with your request.', 'language_needs_detail')
    if forget:
        return _reply(f'Cleared any saved meaning for “{phrase}” in future chats.', 'language_forgotten',
                      LanguageEdit(phrase, key))
    if not meaning or not 3 <= len(meaning) <= 320 or phrase_key(meaning) == key:
        return _reply('Tell me what the phrase means as a separate, complete request.', 'language_needs_detail')
    if requests_state_change(phrase) or requests_state_change(meaning):
        return _reply('Saved wording can only describe read-only requests.', 'unsafe_request')
    return _reply(f'I’ll understand “{phrase}” as “{meaning}” in your future chats.',
                  'language_learned', LanguageEdit(phrase, key, meaning))
