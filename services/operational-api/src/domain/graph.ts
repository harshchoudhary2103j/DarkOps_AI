import { WarehouseNode, WarehouseEdge } from './types';

export interface GraphValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates structural integrity and reachability of a warehouse layout graph.
 *
 * Algorithm & Complexity:
 * 1. Node Uniqueness & Type Check: O(V) scan verifying unique node IDs and shelf requirements.
 * 2. Edge Endpoint Check: O(E) scan verifying from/to nodes exist in V.
 * 3. Adjacency List Construction: O(V + E) building directed or bidirectional edges.
 * 4. Multi-Source Breadth-First Search (BFS): O(V + E) exploring reachable nodes starting
 *    simultaneously from all DISPATCH_STATION nodes.
 * 5. Reachability Assertion: O(V) ensuring every node of type SHELF was visited during BFS.
 * Total Time Complexity: O(V + E) where V is the number of nodes and E is the number of edges.
 * Space Complexity: O(V + E) for adjacency graph representation and BFS visited set.
 */
export function validateWarehouseLayoutGraph(
  nodes: WarehouseNode[],
  edges: WarehouseEdge[]
): GraphValidationResult {
  const errors: string[] = [];

  // 1. Verify Node ID uniqueness and Shelf requirements
  const nodeMap = new Map<string, WarehouseNode>();
  const dispatchStations: string[] = [];
  const shelfNodes: string[] = [];

  for (const node of nodes) {
    if (nodeMap.has(node.id)) {
      errors.push(`Duplicate node ID detected: '${node.id}'`);
    }
    nodeMap.set(node.id, node);

    if (node.type === 'DISPATCH_STATION') {
      dispatchStations.push(node.id);
    } else if (node.type === 'SHELF') {
      shelfNodes.push(node.id);
      if (!node.aisle_id || node.aisle_id.trim() === '') {
        errors.push(`Shelf node '${node.id}' must specify a valid non-empty aisle_id`);
      }
      if (!node.shelf_id || node.shelf_id.trim() === '') {
        errors.push(`Shelf node '${node.id}' must specify a valid non-empty shelf_id`);
      }
    }
  }

  // 2. Must contain at least one dispatch station
  if (dispatchStations.length === 0) {
    errors.push('Warehouse layout must contain at least one DISPATCH_STATION node');
  }

  // 3. Build Adjacency List & Validate Edge References
  const adjacency = new Map<string, string[]>();
  for (const nodeId of nodeMap.keys()) {
    adjacency.set(nodeId, []);
  }

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const fromExists = nodeMap.has(edge.from_node);
    const toExists = nodeMap.has(edge.to_node);

    if (!fromExists) {
      errors.push(`Edge index ${i} references non-existent from_node '${edge.from_node}'`);
    }
    if (!toExists) {
      errors.push(`Edge index ${i} references non-existent to_node '${edge.to_node}'`);
    }

    if (fromExists && toExists) {
      adjacency.get(edge.from_node)!.push(edge.to_node);
      if (edge.bidirectional) {
        adjacency.get(edge.to_node)!.push(edge.from_node);
      }
    }
  }

  // If structural reference errors occurred, return early
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // 4. Multi-Source BFS Reachability from all dispatch stations
  const visited = new Set<string>();
  const queue: string[] = [...dispatchStations];

  for (const ds of dispatchStations) {
    visited.add(ds);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adjacency.get(current) || [];

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  // 5. Verify every SHELF node is reachable
  const unreachableShelves: string[] = [];
  for (const shelfId of shelfNodes) {
    if (!visited.has(shelfId)) {
      unreachableShelves.push(shelfId);
    }
  }

  if (unreachableShelves.length > 0) {
    errors.push(
      `Unreachable shelf nodes detected: ${unreachableShelves.join(', ')}. All shelves must be connected to at least one DISPATCH_STATION.`
    );
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
