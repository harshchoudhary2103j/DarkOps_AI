import pytest
from datetime import datetime, timedelta, timezone

from src.simulation.demand import DemandConfig, SyntheticDemandGenerator


def test_demand_generator_horizon_and_bounds():
    start = datetime(2026, 10, 16, 8, 0, 0, tzinfo=timezone.utc)
    end = start + timedelta(hours=4)
    cfg = DemandConfig(base_hourly_rate=15.0, min_basket_size=2, max_basket_size=5)

    catalog = [
        {"id": f"sku_{i:02d}", "sku_code": f"SKU-{i:02d}", "storage_temp": "AMBIENT", "unit_price": 4.5}
        for i in range(10)
    ]
    stores = [{"id": "store_01", "latitude": 40.7128, "longitude": -74.0060}]
    zones = []

    generator = SyntheticDemandGenerator(
        config=cfg,
        catalog_skus=catalog,
        stores=stores,
        service_zones=zones,
        run_seed=42,
    )

    arrivals = generator.generate_orders(start, end, "run_test_demand")
    assert len(arrivals) > 0

    for arr in arrivals:
        # All arrival timestamps strictly within horizon
        assert start <= arr.virtual_timestamp < end
        p = arr.payload
        # Basket size within configured bounds
        assert cfg.min_basket_size <= len(p["lines"]) <= cfg.max_basket_size
        # No duplicate SKUs in single basket
        sku_ids = [l["sku_id"] for l in p["lines"]]
        assert len(sku_ids) == len(set(sku_ids))
        # Positive requested quantities
        for line in p["lines"]:
            assert 1 <= line["quantity"] <= cfg.max_units_per_sku


def test_demand_generator_zero_rate_interval():
    start = datetime(2026, 10, 16, 0, 0, 0, tzinfo=timezone.utc)
    end = start + timedelta(hours=1)
    # Zero rate for hour 0
    cfg = DemandConfig(base_hourly_rate=20.0, hour_multipliers={0: 0.0})
    catalog = [{"id": "sku_01", "sku_code": "SKU-01", "storage_temp": "AMBIENT", "unit_price": 2.0}]

    generator = SyntheticDemandGenerator(
        config=cfg,
        catalog_skus=catalog,
        stores=[],
        service_zones=[],
        run_seed=42,
    )
    arrivals = generator.generate_orders(start, end, "run_zero_rate")
    assert len(arrivals) == 0


def test_demand_generator_seed_reproducibility():
    start = datetime(2026, 10, 16, 8, 0, 0, tzinfo=timezone.utc)
    end = start + timedelta(hours=6)
    cfg = DemandConfig(base_hourly_rate=10.0)
    catalog = [{"id": f"sku_{i}", "sku_code": f"SKU-{i}", "storage_temp": "AMBIENT", "unit_price": 3.0} for i in range(5)]

    gen_a = SyntheticDemandGenerator(config=cfg, catalog_skus=catalog, stores=[], service_zones=[], run_seed=123)
    arrivals_a = gen_a.generate_orders(start, end, "run_seed_test")

    gen_b = SyntheticDemandGenerator(config=cfg, catalog_skus=catalog, stores=[], service_zones=[], run_seed=123)
    arrivals_b = gen_b.generate_orders(start, end, "run_seed_test")

    assert len(arrivals_a) == len(arrivals_b)
    for a, b in zip(arrivals_a, arrivals_b):
        assert a.virtual_timestamp == b.virtual_timestamp
        assert a.payload == b.payload

    # Distinct seed
    gen_c = SyntheticDemandGenerator(config=cfg, catalog_skus=catalog, stores=[], service_zones=[], run_seed=999)
    arrivals_c = gen_c.generate_orders(start, end, "run_seed_test")
    # Different timestamps
    assert [a.virtual_timestamp for a in arrivals_a] != [c.virtual_timestamp for c in arrivals_c]
