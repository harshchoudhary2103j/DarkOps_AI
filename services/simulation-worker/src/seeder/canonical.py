"""
Canonical JSON serialization and SHA-256 fingerprinting for deterministic world artifacts.
"""

import hashlib
import json
from .models import SyntheticWorld


def to_canonical_json(world: SyntheticWorld) -> str:
    """
    Serializes a SyntheticWorld into a deterministic, canonical JSON string with
    sorted keys, standard indentation, and trailing newline.
    """
    payload = world.model_dump()
    return json.dumps(payload, sort_keys=True, indent=2, ensure_ascii=False) + "\n"


def compute_canonical_hash(world: SyntheticWorld) -> str:
    """
    Computes a cryptographic SHA-256 checksum over the canonical UTF-8 JSON bytes.
    """
    canonical_bytes = to_canonical_json(world).encode("utf-8")
    return hashlib.sha256(canonical_bytes).hexdigest()
