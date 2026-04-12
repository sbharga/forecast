"""
core/embedder.py — Local text embeddings via fastembed.

No API key. No rate limits. Model (~65 MB) downloads once on first use
and is cached in ~/.cache/fastembed.

Produces 384-dimensional vectors (BAAI/bge-small-en-v1.5).
"""

import json
from typing import List

_model = None


def _get_model():
    global _model
    if _model is None:
        from fastembed import TextEmbedding
        print("[embedder] Loading model (first run downloads ~65 MB)…")
        _model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
        print("[embedder] Model ready.")
    return _model


def generate_embedding(text: str, task_type: str = "RETRIEVAL_DOCUMENT") -> List[float]:
    """
    Return a 384-dimensional embedding vector for the given text.
    task_type="RETRIEVAL_DOCUMENT" — for event text at index time (workers)
    task_type="RETRIEVAL_QUERY"    — for user keywords at query time (API)
    """
    model = _get_model()
    if task_type == "RETRIEVAL_QUERY":
        vectors = list(model.query_embed([text]))
    else:
        vectors = list(model.embed([text]))
    return vectors[0].tolist()


def embedding_to_json(vec: List[float]) -> str:
    """Serialize a float list to a compact JSON string for SQLite storage."""
    return json.dumps(vec)


def embedding_from_json(s: str) -> List[float]:
    """Deserialize a JSON string back to a float list."""
    return json.loads(s)
