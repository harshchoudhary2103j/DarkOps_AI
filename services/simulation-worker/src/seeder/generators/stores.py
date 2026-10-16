"""
Deterministic virtual store and service zone generator.
"""

import math
import random
from typing import List, Tuple
from ..config import ScenarioConfig
from ..models import StorePayload, ServiceZonePayload, GeoJSONPolygon


def generate_stores(
    config: ScenarioConfig,
    rng: random.Random
) -> Tuple[List[StorePayload], List[ServiceZonePayload]]:
    stores: List[StorePayload] = []
    service_zones: List[ServiceZonePayload] = []

    # 1 degree lat is approx 111 km. 1 degree lon at lat 40 is approx 85 km.
    km_per_lat = 111.0
    km_per_lon = 111.0 * math.cos(math.radians(config.geo_center_lat))

    for i in range(1, config.num_stores + 1):
        store_id = f"store-{config.scenario_id}-{i:02d}"
        store_name = f"DarkStore {config.scenario_name} #{i:02d}"

        # Place store deterministically in circle around center
        angle = rng.uniform(0, 2 * math.pi)
        dist = rng.uniform(0.5, config.geo_radius_km)
        d_lat = (dist * math.sin(angle)) / km_per_lat
        d_lon = (dist * math.cos(angle)) / km_per_lon

        store_lat = round(config.geo_center_lat + d_lat, 6)
        store_lon = round(config.geo_center_lon + d_lon, 6)

        # Generate a closed rectangular service polygon of radius ~2.5 km around store
        poly_delta_lat = round(2.5 / km_per_lat, 6)
        poly_delta_lon = round(2.5 / km_per_lon, 6)

        min_lat = round(store_lat - poly_delta_lat, 6)
        max_lat = round(store_lat + poly_delta_lat, 6)
        min_lon = round(store_lon - poly_delta_lon, 6)
        max_lon = round(store_lon + poly_delta_lon, 6)

        # GeoJSON Polygon coordinate convention: [longitude, latitude]
        polygon_coords = [
            [
                [min_lon, min_lat],
                [max_lon, min_lat],
                [max_lon, max_lat],
                [min_lon, max_lat],
                [min_lon, min_lat]  # Closed ring
            ]
        ]

        service_area = GeoJSONPolygon(coordinates=polygon_coords)

        store = StorePayload(
            id=store_id,
            name=store_name,
            status="ACTIVE",
            latitude=store_lat,
            longitude=store_lon,
            service_area=service_area
        )
        stores.append(store)

        # Generate primary service zone for this store
        zone_id = f"zone-{config.scenario_id}-{i:02d}-primary"
        zone = ServiceZonePayload(
            id=zone_id,
            store_id=store_id,
            name=f"{store_name} Primary Delivery Zone",
            boundary=service_area,
            status="ACTIVE"
        )
        service_zones.append(zone)

    # Sort deterministically by id
    stores.sort(key=lambda s: s.id)
    service_zones.sort(key=lambda z: z.id)
    return stores, service_zones
