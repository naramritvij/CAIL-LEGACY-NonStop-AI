"""Scope-limited reviewer/expert credentials for a localhost hackathon prototype.

Unconfigured endpoints fail closed; these keys are not production identity or RBAC.
"""
import hmac
import os
from fastapi import HTTPException


def _check_distinct():
    expert = os.getenv('LEGACY_EXPERT_KEY', '')
    reviewer = os.getenv('LEGACY_REVIEWER_KEY', '')
    if expert and reviewer and hmac.compare_digest(expert, reviewer):
        raise HTTPException(status_code=503, detail='Expert and reviewer credentials must differ')


def require_role(role: str, provided: str | None):
    _check_distinct()
    env_name = {'expert': 'LEGACY_EXPERT_KEY', 'reviewer': 'LEGACY_REVIEWER_KEY'}[role]
    configured = os.getenv(env_name, '')
    if not configured or len(configured) < 20:
        raise HTTPException(status_code=503, detail=f'{role.title()} write access is not configured')
    if not provided or not hmac.compare_digest(configured, provided):
        raise HTTPException(status_code=403, detail='Forbidden')
    return role


def require_either(provided: str | None):
    _check_distinct()
    if not provided:
        raise HTTPException(status_code=403, detail='Forbidden')
    for role, var in [('expert', 'LEGACY_EXPERT_KEY'), ('reviewer', 'LEGACY_REVIEWER_KEY')]:
        configured = os.getenv(var, '')
        if len(configured) >= 20 and hmac.compare_digest(configured, provided):
            return role
    raise HTTPException(status_code=403, detail='Forbidden')
