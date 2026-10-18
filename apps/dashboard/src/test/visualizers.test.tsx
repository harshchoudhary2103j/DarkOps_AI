import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Warehouse2DViewer } from '../components/visualizers/Warehouse2DViewer';
import { StoreGeoMap } from '../components/visualizers/StoreGeoMap';
import { WarehouseLayout, PickerRouteResponse, Store, ServiceZone } from '../types/domain';

describe('Warehouse 2D Layout & Store Map Visualizers', () => {
  const mockLayout: WarehouseLayout = {
    id: 'layout-01',
    store_id: 'store_nyc_01',
    version: 1,
    is_active: true,
    created_at: new Date().toISOString(),
    layout_data: {
      nodes: [
        { id: 'DEPOT', type: 'DISPATCH_STATION', x: 10, y: 10 },
        { id: 'SHELF-01', type: 'SHELF', x: 20, y: 10, shelf_id: 'S-01', aisle_id: 'A1' },
        { id: 'SHELF-02', type: 'SHELF', x: 20, y: 20, shelf_id: 'S-02', aisle_id: 'A1' },
        { id: 'WP-01', type: 'AISLE_WAYPOINT', x: 15, y: 10 },
      ],
      edges: [
        { from_node: 'DEPOT', to_node: 'WP-01', distance: 5.0 },
        { from_node: 'WP-01', to_node: 'SHELF-01', distance: 5.0 },
        { from_node: 'SHELF-01', to_node: 'SHELF-02', distance: 10.0 },
      ],
    },
  };

  const mockRouteResponse: PickerRouteResponse = {
    status: 'OPTIMAL',
    objective_value: 30.0,
    execution_time_ms: 2.5,
    constraint_status: { dispatch_anchored: true, all_shelves_visited: true },
    explanations: ['Optimized 2 stops spanning 30m'],
    decisions: {
      task_id: 'task-01',
      store_id: 'store_nyc_01',
      route_nodes: ['DEPOT', 'WP-01', 'SHELF-01', 'SHELF-02', 'SHELF-01', 'WP-01', 'DEPOT'],
      ordered_stops: ['SHELF-01', 'SHELF-02'],
      total_distance_meters: 30.0,
      travel_duration_seconds: 25.0,
      pick_duration_seconds: 10.0,
      total_duration_seconds: 35.0,
      baseline_comparison: {
        baseline_distance_meters: 36.0,
        baseline_route_nodes: ['DEPOT', 'SHELF-01', 'SHELF-02', 'DEPOT'],
        distance_reduction_meters: 6.0,
        distance_reduction_percent: 16.67,
        baseline_policy: 's_shape_serpentine_v1',
      },
    },
  };

  it('renders Warehouse2DViewer with nodes, edges, and route overlay', () => {
    const onSelectShelf = vi.fn();
    render(
      <Warehouse2DViewer
        layout={mockLayout}
        routeResponse={mockRouteResponse}
        onSelectShelf={onSelectShelf}
      />
    );

    // Verify Depot station text rendered
    expect(screen.getByText('DEPOT')).toBeInTheDocument();
    // Verify node count badge
    expect(screen.getByText(/4 Nodes/i)).toBeInTheDocument();

    // Verify distance metrics overlay rendered
    expect(screen.getByText(/Picker Route Analysis/i)).toBeInTheDocument();
    expect(screen.getByText(/30.0 m/i)).toBeInTheDocument();
    expect(screen.getByText(/36.0 m/i)).toBeInTheDocument();
    expect(screen.getByText('+16.7%')).toBeInTheDocument();

    // Test shelf selection
    const shelf = screen.getByText('S-01');
    fireEvent.click(shelf);
    expect(onSelectShelf).toHaveBeenCalledWith('S-01');
  });

  it('toggles route layers between optimized and baseline', () => {
    render(<Warehouse2DViewer layout={mockLayout} routeResponse={mockRouteResponse} />);

    const optBtn = screen.getByRole('button', { name: /Optimized \(TSP\)/i });
    const baselineBtn = screen.getByRole('button', { name: /Baseline \(S-Shape\)/i });

    fireEvent.click(optBtn);
    expect(optBtn).toHaveClass('text-cyan-300');

    fireEvent.click(baselineBtn);
    expect(baselineBtn).toHaveClass('text-amber-300');
  });

  it('renders StoreGeoMap with stores and handles selection', () => {
    const mockStores: Store[] = [
      {
        id: 'st-01',
        name: 'Downtown Dark Store',
        code: 'DS-DT',
        status: 'ACTIVE',
        latitude: 40.7128,
        longitude: -74.006,
        service_radius_km: 10,
        current_queue_depth: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const mockZones: ServiceZone[] = [
      {
        id: 'zone-01',
        store_id: 'st-01',
        name: 'Downtown Catchment',
        code: 'Z-DT',
        status: 'ACTIVE',
        polygon_geojson: {
          type: 'Polygon',
          coordinates: [
            [
              [-74.01, 40.71],
              [-74.0, 40.71],
              [-74.0, 40.72],
              [-74.01, 40.72],
              [-74.01, 40.71],
            ],
          ],
        },
        created_at: new Date().toISOString(),
      },
    ];

    const onSelectStore = vi.fn();
    render(
      <StoreGeoMap
        stores={mockStores}
        serviceZones={mockZones}
        onSelectStore={onSelectStore}
      />
    );

    expect(screen.getByText('Downtown Dark Store')).toBeInTheDocument();
    expect(screen.getByText('DS-DT')).toBeInTheDocument();

    const storeNode = screen.getByText('Downtown Dark Store');
    fireEvent.click(storeNode);
    expect(onSelectStore).toHaveBeenCalledWith('st-01');
  });

  it('handles empty stores safely without crashing', () => {
    render(<StoreGeoMap stores={[]} />);
    expect(screen.getByText(/No geographic store coordinates found/i)).toBeInTheDocument();
  });
});
