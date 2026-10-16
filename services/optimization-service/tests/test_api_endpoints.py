from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)


def test_healthz_endpoint():
    res = client.get("/healthz")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["service"] == "optimization-service"


def test_replenishment_api_endpoint():
    payload = {
        "store_id": "store_api_01",
        "horizon_periods": 3,
        "period_duration_hours": 24.0,
        "skus": [
            {
                "sku_id": "sku_api_1",
                "current_inventory": 10,
                "demand_forecast": [15, 20, 25],
                "safety_stock_target": 5,
                "lead_time_periods": 1,
                "min_order_quantity": 10,
                "pack_size": 5,
            }
        ],
    }

    res = client.post("/api/v1/optimize/replenishment", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ("OPTIMAL", "FEASIBLE")
    assert "decisions" in data
    assert "recommended_orders" in data["decisions"]


def test_allocation_api_endpoint():
    payload = {
        "orders": [
            {
                "order_id": "ord_api_1",
                "customer_latitude": 40.7128,
                "customer_longitude": -74.0060,
                "lines": [{"sku_id": "sku_1", "quantity": 2}],
            }
        ],
        "stores": [
            {
                "store_id": "store_api_1",
                "latitude": 40.7130,
                "longitude": -74.0060,
                "status": "ACTIVE",
                "service_radius_km": 15.0,
                "current_queue_depth": 1,
                "available_inventory": {"sku_1": 10},
            }
        ],
    }

    res = client.post("/api/v1/optimize/allocation", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ("OPTIMAL", "FEASIBLE")
    assert len(data["decisions"]["assignments"]) == 1
    assert data["decisions"]["assignments"][0]["store_id"] == "store_api_1"


def test_picker_route_api_endpoint():
    layout = {
        "id": "layout_api_01",
        "store_id": "store_01",
        "nodes": [
            {"id": "DISPATCH", "type": "DISPATCH_STATION", "x": 0.0, "y": 0.0},
            {"id": "SHELF_A", "type": "SHELF", "x": 5.0, "y": 5.0},
        ],
        "edges": [
            {"from_node": "DISPATCH", "to_node": "SHELF_A", "distance": 10.0, "bidirectional": True}
        ],
    }
    payload = {
        "task_id": "task_api_01",
        "store_id": "store_01",
        "layout": layout,
        "pick_items": [{"item_id": "item_1", "sku_id": "sku_1", "shelf_node_id": "SHELF_A"}],
    }

    res = client.post("/api/v1/optimize/picker-route", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ("OPTIMAL", "FEASIBLE")
    assert data["decisions"]["total_distance_meters"] == 20.0
    assert data["decisions"]["route_nodes"] == ["DISPATCH", "SHELF_A", "DISPATCH"]
