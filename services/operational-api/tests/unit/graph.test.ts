import { describe, it, expect } from 'vitest';
import { validateWarehouseLayoutGraph } from '../../src/domain/graph';
import { WarehouseNode, WarehouseEdge } from '../../src/domain/types';

describe('Warehouse Layout Graph Validation (O(V+E) BFS)', () => {
  it('validates a complete, correctly connected layout graph', () => {
    const nodes: WarehouseNode[] = [
      { id: 'DS-1', type: 'DISPATCH_STATION', x: 0, y: 0, z: 0 },
      { id: 'AISLE-A', type: 'AISLE', x: 5, y: 0, z: 0 },
      { id: 'SHELF-A1', type: 'SHELF', aisle_id: 'A', shelf_id: 'A1', x: 5, y: 5, z: 1 }
    ];

    const edges: WarehouseEdge[] = [
      { from_node: 'DS-1', to_node: 'AISLE-A', distance: 5.0, bidirectional: true },
      { from_node: 'AISLE-A', to_node: 'SHELF-A1', distance: 5.0, bidirectional: true }
    ];

    const result = validateWarehouseLayoutGraph(nodes, edges);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects layouts missing any DISPATCH_STATION node', () => {
    const nodes: WarehouseNode[] = [
      { id: 'AISLE-A', type: 'AISLE', x: 5, y: 0, z: 0 },
      { id: 'SHELF-A1', type: 'SHELF', aisle_id: 'A', shelf_id: 'A1', x: 5, y: 5, z: 1 }
    ];

    const edges: WarehouseEdge[] = [
      { from_node: 'AISLE-A', to_node: 'SHELF-A1', distance: 5.0, bidirectional: true }
    ];

    const result = validateWarehouseLayoutGraph(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Warehouse layout must contain at least one DISPATCH_STATION node');
  });

  it('rejects duplicate node IDs', () => {
    const nodes: WarehouseNode[] = [
      { id: 'DS-1', type: 'DISPATCH_STATION', x: 0, y: 0, z: 0 },
      { id: 'DS-1', type: 'DISPATCH_STATION', x: 10, y: 0, z: 0 }
    ];

    const edges: WarehouseEdge[] = [];
    const result = validateWarehouseLayoutGraph(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Duplicate node ID'))).toBe(true);
  });

  it('rejects shelf nodes with missing aisle_id or shelf_id', () => {
    const nodes: WarehouseNode[] = [
      { id: 'DS-1', type: 'DISPATCH_STATION', x: 0, y: 0, z: 0 },
      { id: 'SHELF-1', type: 'SHELF', aisle_id: '', shelf_id: 'S1', x: 5, y: 5, z: 1 },
      { id: 'SHELF-2', type: 'SHELF', aisle_id: 'A', shelf_id: '', x: 5, y: 6, z: 1 }
    ];

    const edges: WarehouseEdge[] = [
      { from_node: 'DS-1', to_node: 'SHELF-1', distance: 5.0, bidirectional: true },
      { from_node: 'DS-1', to_node: 'SHELF-2', distance: 6.0, bidirectional: true }
    ];

    const result = validateWarehouseLayoutGraph(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('valid non-empty aisle_id'))).toBe(true);
    expect(result.errors.some(e => e.includes('valid non-empty shelf_id'))).toBe(true);
  });

  it('rejects edges referencing non-existent nodes', () => {
    const nodes: WarehouseNode[] = [
      { id: 'DS-1', type: 'DISPATCH_STATION', x: 0, y: 0, z: 0 }
    ];

    const edges: WarehouseEdge[] = [
      { from_node: 'DS-1', to_node: 'GHOST-NODE', distance: 10.0, bidirectional: true }
    ];

    const result = validateWarehouseLayoutGraph(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("non-existent to_node 'GHOST-NODE'"))).toBe(true);
  });

  it('rejects disconnected shelf nodes unreachable from dispatch stations', () => {
    const nodes: WarehouseNode[] = [
      { id: 'DS-1', type: 'DISPATCH_STATION', x: 0, y: 0, z: 0 },
      { id: 'AISLE-A', type: 'AISLE', x: 5, y: 0, z: 0 },
      // SHELF-ISLAND has no path from DS-1
      { id: 'SHELF-ISLAND', type: 'SHELF', aisle_id: 'B', shelf_id: 'B1', x: 20, y: 20, z: 1 }
    ];

    const edges: WarehouseEdge[] = [
      { from_node: 'DS-1', to_node: 'AISLE-A', distance: 5.0, bidirectional: true }
    ];

    const result = validateWarehouseLayoutGraph(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Unreachable shelf nodes detected: SHELF-ISLAND'))).toBe(true);
  });

  it('handles multi-source reachability across multiple dispatch stations and cyclic movement paths', () => {
    const nodes: WarehouseNode[] = [
      { id: 'DS-NORTH', type: 'DISPATCH_STATION', x: 0, y: 50, z: 0 },
      { id: 'DS-SOUTH', type: 'DISPATCH_STATION', x: 0, y: 0, z: 0 },
      { id: 'HUB-1', type: 'AISLE', x: 10, y: 25, z: 0 },
      { id: 'HUB-2', type: 'AISLE', x: 20, y: 25, z: 0 },
      { id: 'SHELF-1', type: 'SHELF', aisle_id: 'Z1', shelf_id: 'S1', x: 30, y: 25, z: 2 }
    ];

    // Cyclic graph: DS-NORTH -> HUB-1 -> HUB-2 -> HUB-1 (cycle) -> SHELF-1
    const edges: WarehouseEdge[] = [
      { from_node: 'DS-NORTH', to_node: 'HUB-1', distance: 30.0, bidirectional: false },
      { from_node: 'HUB-1', to_node: 'HUB-2', distance: 10.0, bidirectional: false },
      { from_node: 'HUB-2', to_node: 'HUB-1', distance: 10.0, bidirectional: false }, // Cycle allowed
      { from_node: 'HUB-2', to_node: 'SHELF-1', distance: 10.0, bidirectional: false }
    ];

    const result = validateWarehouseLayoutGraph(nodes, edges);
    expect(result.valid).toBe(true);
  });
});
