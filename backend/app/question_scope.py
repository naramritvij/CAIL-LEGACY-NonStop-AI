"""Question-scope guard and small, explicitly project-authored training glossary.

These reference notes are NOT authenticated HPE documentation. They are intended
for concept orientation in a $0 offline demo until independently checked,
approved source excerpts are ingested. No LLM or operational command is called.
"""
from __future__ import annotations
import re

GLOSSARY = {
    "nonstop": (
        "HPE NonStop is a family of fault-tolerant server systems designed for high "
        "availability and continuous transaction processing. Its design reduces "
        "the impact of individual component failures; it does not mean that failures "
        "or outages are impossible. This prototype simulates NonStop incidents, "
        "and is not connected to an actual HPE NonStop installation."
    ),
    "asap": (
        "ASAP (Availability, Statistics and Performance) is a monitoring solution "
        "in the HPE NonStop ecosystem. Operators can use performance and availability "
        "observations to investigate potential issues. The ASAP data shown in this "
        "demo is synthesized from training fixtures, not a live ASAP feed."
    ),
    "ems": (
        "EMS (Event Management Service) supports operational event messaging in "
        "the HPE NonStop environment. An operator reviews events, severity and "
        "context to understand what changed. Demo event IDs beginning SIM-EVT "
        "are fictional and are not official EMS event numbers."
    ),
    "scf": (
        "SCF (Subsystem Control Facility) is a NonStop interface for viewing and "
        "administering supported subsystems. Commands depend on release, subsystem "
        "and privileges. This application offers display-only references and does "
        "not execute SCF commands."
    ),
    "tacl": (
        "TACL (Tandem Advanced Command Language) is an interactive command-language "
        "environment associated with HPE NonStop systems. Its available commands "
        "and privileges depend on configuration. The demo never executes TACL."
    ),
    "pathway": (
        "Pathway is part of the HPE NonStop transaction-processing ecosystem. "
        "Its components help operate transaction-server applications. A Pathway "
        "alert is evidence to investigate, not by itself a proven root cause."
    ),
    "knowledge_tree": (
        "Knowledge Tree is the assistant's visualization of locally approved "
        "operational lessons and their revision relationships. A human reviewer "
        "must approve knowledge before the live approved view displays it. "
        "Synthetic showcases are not authenticated veteran-operator expertise."
    ),
    "assistant": (
        "CAIL/Nonstop AI Operations Assistant is this prototype operator-training "
        "application. It combines simulated health signals, evidence inspection, "
        "safe command previews, local Qwen investigations and a reviewed Knowledge "
        "Tree. It does not operate or control a production NonStop system."
    ),
}
ALIASES = {
    "nonstop": ("nonstop", "hpe nonstop", "nonstop server", "nonstop servers",
                "hpe nonstop server", "non stop", "non-stop"),
    "asap": ("asap", "nonstop asap", "hpe asap"),
    "ems": ("ems", "nonstop ems", "event management service"),
    "scf": ("scf", "nonstop scf", "subsystem control facility"),
    "tacl": ("tacl", "tandem advanced command language"),
    "pathway": ("pathway", "nonstop pathway"),
    "knowledge_tree": ("knowledge tree",),
    "assistant": ("cail assistant", "cail nonstop ai operations assistant",
                  "nonstop ai operations assistant", "your assistant"),
}

_STOP_WORDS = {
    "what", "do", "you", "mean", "by", "does", "the", "a", "an", "is", "are",
    "why", "how", "when", "where", "which", "who", "we", "can", "i", "tell",
    "me", "about", "of", "to", "for", "with", "from", "and", "or", "this", "that",
    "its", "our", "it", "in", "on", "be", "as", "was", "were", "did",
    "would", "should", "could", "please", "help", "explain", "show", "give",
    "summarize", "observations", "observation", "evidence", "events",
    "event", "incident", "incidents", "status", "issue", "issues", "problem",
    "problems", "system", "systems", "recorded", "synthetic", "currently",
    "current", "happened", "happening", "changed", "changing", "review",
    "check", "checks", "verify", "first", "next", "possible", "caused",
    "cause", "causing", "root", "risk", "wrong", "impact", "unknown",
    "diagnose", "investigate", "any", "there", "available", "signal",
    "signals", "please", "operations", "operator", "operators",
    # These general diagnosis words are not evidence topics on their own.
    "broken", "unhealthy", "unavailable", "down", "failing", "failed",
    "failure", "failures", "alarm", "alarms", "symptom", "symptoms",
}
_EXPLICIT_DEFINITION = re.compile(
    r"^(?:what (?:do you mean by|is|are) |what does |"
    r"define |explain |tell me about |meaning of |how does )",
    re.IGNORECASE,
)
_INCIDENT_WORDS = re.compile(
    r"\b(?:currently|happening|incident|issue|status|alert|warning|red|yellow|"
    r"capacity|utilization|increasing|latency|outage|degradation|"
    r"failed|failing|failure|failures|broken|wrong|unhealthy|unavailable|down|"
    r"alarm|alarms|symptom|symptoms|cause|causing|threshold|error|problem|81|80)\b|\$data\d+",
    re.IGNORECASE,
)


def _normal(text: str) -> str:
    text = text.lower().replace("non-stop", "nonstop").replace("non stop", "nonstop")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9$ ]", " ", text)).strip()


def classify_question(question: str) -> tuple[str, str | None]:
    """Returns incident, concept, or reference_required (no inferred answers)."""
    value = _normal(question)
    if not _EXPLICIT_DEFINITION.match(value):
        return "incident", None
    # "What does the disk evidence show?" is NOT a definition request.
    if value.startswith("what does ") and not value.endswith(" mean"):
        return "incident", None
    # An operator asking "What is wrong?" wants incident analysis, not a definition.
    if _INCIDENT_WORDS.search(value):
        return "incident", None
    subject = re.sub(
        r"^(?:what do you mean by|what is|what are|what does|"
        r"define|explain|tell me about|meaning of|how does)\s+",
        "", value
    ).strip()
    subject = re.sub(r"\s+(?:mean|work)$", "", subject).strip()
    subject = re.sub(r"^(?:the|a|an)\s+", "", subject)
    # Recognized concepts only; prefer refusing an ungrounded question
    # over returning a well-cited but irrelevant incident summary.
    for key, aliases in ALIASES.items():
        if subject in aliases:
            return "concept", key
    if "nonstop" in subject and "assistant" in subject:
        return "concept", "assistant"
    return "reference_required", None


def focus_terms(question: str) -> set[str]:
    """Cheap lexical request/source relevance gate; NOT semantic entailment."""
    return {
        token for token in re.findall(r"[a-z0-9]+", _normal(question))
        if len(token) > 2 and token not in _STOP_WORDS
    }


def source_terms(sources: list[dict]) -> set[str]:
    return set().union(*(set(re.findall(r"[a-z0-9]+", str(s.get("source_text", "")).lower()))
                         for s in sources)) if sources else set()
