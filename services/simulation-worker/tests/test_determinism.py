"""
Determinism tests for Synthetic World Seeder.
Asserts that given identical config and seed, outputs and canonical hashes are 100% byte-for-byte identical.
"""

from src.seeder.config import ScenarioConfig
from src.seeder.generator import generate_world
from src.seeder.canonical import to_canonical_json, compute_canonical_hash


def test_seed_42_byte_identical_reproducibility():
    config = ScenarioConfig(
        scenario_id="det-test",
        scenario_name="Determinism Test",
        seed=42,
        num_stores=2,
        num_skus=8,
        num_suppliers=2,
        history_horizon_days=14
    )

    # Run A
    world_a = generate_world(config)
    json_a = to_canonical_json(world_a)
    hash_a = compute_canonical_hash(world_a)

    # Run B (independent run)
    world_b = generate_world(config)
    json_b = to_canonical_json(world_b)
    hash_b = compute_canonical_hash(world_b)

    assert json_a == json_b, "Canonical JSON output differs between identical seed runs"
    assert hash_a == hash_b, "SHA-256 canonical hash differs between identical seed runs"
    assert len(hash_a) == 64


def test_seed_change_produces_distinct_world():
    config_a = ScenarioConfig(
        scenario_id="det-test",
        scenario_name="Determinism Test",
        seed=42,
        num_stores=2,
        num_skus=8,
        num_suppliers=2,
        history_horizon_days=14
    )
    config_b = ScenarioConfig(
        scenario_id="det-test",
        scenario_name="Determinism Test",
        seed=999,
        num_stores=2,
        num_skus=8,
        num_suppliers=2,
        history_horizon_days=14
    )

    world_a = generate_world(config_a)
    world_b = generate_world(config_b)

    hash_a = compute_canonical_hash(world_a)
    hash_b = compute_canonical_hash(world_b)

    assert hash_a != hash_b, "Different random seeds should produce different canonical hashes"
    # Specific entity divergence
    assert world_a.stores[0].latitude != world_b.stores[0].latitude
    assert world_a.skus[0].unit_price != world_b.skus[0].unit_price
