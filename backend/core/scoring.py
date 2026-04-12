"""
core/scoring.py — In-memory semantic scoring for events.

The embedding cache is populated once at API startup from the database.
At query time, a keyword embedding is computed and scored against all
cached event vectors via cosine similarity.
"""

import logging
import math
from typing import Dict, List, Optional

log = logging.getLogger("forecast.scoring")

# Populated at startup via preload()
_event_embeddings: Dict[int, List[float]] = {}


def preload(embeddings: Dict[int, List[float]]) -> None:
    """Load all event embeddings into memory. Called once at API startup."""
    global _event_embeddings
    _event_embeddings = embeddings
    log.info("[scoring] Loaded %d event embeddings into memory.", len(embeddings))


def update(event_id: int, vec: List[float]) -> None:
    """Add or replace a single event's embedding (called after upsert)."""
    _event_embeddings[event_id] = vec


def _cosine_similarity(a: List[float], b: List[float]) -> float:
    dot   = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(y * y for y in b))
    if mag_a == 0.0 or mag_b == 0.0:
        return 0.0
    return dot / (mag_a * mag_b)


def score_events(event_ids: List[int], keyword_vec: List[float]) -> Dict[int, int]:
    """
    Return {event_id: priority_score (0-100)} for every event in event_ids.
    Events without a stored embedding receive score 0.

    Scoring (bge-small-en-v1.5 calibration):
      - Unrelated text typically scores 0.20–0.55 cosine similarity
      - Genuinely related text scores 0.60–0.90+
      - Threshold 0.62 → only clear semantic matches get a non-zero score
      - 0.62–0.90 mapped linearly to 0–100
    """
    _THRESHOLD = 0.62
    _CEILING   = 0.90

    dim = len(keyword_vec)
    scores: Dict[int, int] = {}
    nonzero = 0

    for event_id in event_ids:
        vec = _event_embeddings.get(event_id)
        if vec is None or len(vec) != dim:
            scores[event_id] = 0
            continue

        sim = _cosine_similarity(keyword_vec, vec)
        if sim < _THRESHOLD:
            scores[event_id] = 0
        else:
            score = (sim - _THRESHOLD) / (_CEILING - _THRESHOLD) * 100
            scores[event_id] = min(100, round(score))
            nonzero += 1

    log.info("[scoring] %d/%d events scored above threshold (%.2f).", nonzero, len(event_ids), _THRESHOLD)
    return scores
