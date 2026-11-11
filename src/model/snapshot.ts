import { GraphSchema } from './schema';
import type { Graph, UnitEdge, UnitNode } from './types';

export const SNAPSHOT_KEY = 'nodeworks.snapshots.v1';
export const SNAPSHOT_LIMIT = 20;

export interface Snapshot {
  id: string;
  at: number;
  label: string;
  graph: Graph;
}

export interface TitleChange {
  nodeId: string;
  from: string;
  to: string;
}

export interface PropChange {
  nodeId: string;
  nodeTitle: string;
  prop: string;
  from: unknown;
  to: unknown;
}

/** from（快照）→ to（当前）的差异；只描述结构，不做业务判断。 */
export interface GraphDiff {
  nodesAdded: number;
  nodesRemoved: number;
  nodesChanged: number;
  edgesAdded: number;
  edgesRemoved: number;
  edgesChanged: number;
  movedNodes: number;
  titleChanges: TitleChange[];
  propChanges: PropChange[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function isDiffEmpty(diff: GraphDiff): boolean {
  return (
    diff.nodesAdded === 0 &&
    diff.nodesRemoved === 0 &&
    diff.nodesChanged === 0 &&
    diff.edgesAdded === 0 &&
    diff.edgesRemoved === 0 &&
    diff.edgesChanged === 0
  );
}

export function diffCount(diff: GraphDiff): number {
  return (
    diff.nodesAdded +
    diff.nodesRemoved +
    diff.nodesChanged +
    diff.edgesAdded +
    diff.edgesRemoved +
    diff.edgesChanged
  );
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function nodeShape(n: UnitNode): unknown {
  return [n.kind ?? '', n.title, n.pos.x, n.pos.y, n.props, n.ports, n.subgraph ?? null, n.subgraphMap ?? null];
}

function edgeShape(e: UnitEdge): unknown {
  return [e.label ?? '', e.props ?? null, Boolean(e.orphan)];
}

const edgeKey = (e: UnitEdge): string =>
  `${e.from.node}:${e.from.port}->${e.to.node}:${e.to.port}`;

export function diffGraphs(from: Graph, to: Graph): GraphDiff {
  const oldNodes = new Map(from.nodes.map((n) => [n.id, n]));
  const newNodes = new Map(to.nodes.map((n) => [n.id, n]));
  const diff: GraphDiff = {
    nodesAdded: 0,
    nodesRemoved: 0,
    nodesChanged: 0,
    edgesAdded: 0,
    edgesRemoved: 0,
    edgesChanged: 0,
    movedNodes: 0,
    titleChanges: [],
    propChanges: [],
  };

  for (const [id, node] of newNodes) {
    const prev = oldNodes.get(id);
    if (!prev) {
      diff.nodesAdded += 1;
      continue;
    }
    if (same(nodeShape(prev), nodeShape(node))) continue;

    diff.nodesChanged += 1;
    if (prev.pos.x !== node.pos.x || prev.pos.y !== node.pos.y) diff.movedNodes += 1;
    if (prev.title !== node.title) {
      diff.titleChanges.push({ nodeId: id, from: prev.title, to: node.title });
    }
    const names = new Set([...Object.keys(prev.props), ...Object.keys(node.props)]);
    for (const name of names) {
      const before = prev.props[name]?.value;
      const after = node.props[name]?.value;
      if (!same(before, after)) {
        diff.propChanges.push({ nodeId: id, nodeTitle: node.title, prop: name, from: before, to: after });
      }
    }
  }
  for (const id of oldNodes.keys()) if (!newNodes.has(id)) diff.nodesRemoved += 1;

  const oldEdges = new Map(from.edges.map((e) => [edgeKey(e), e]));
  const newEdges = new Map(to.edges.map((e) => [edgeKey(e), e]));
  for (const [key, edge] of newEdges) {
    const prev = oldEdges.get(key);
    if (!prev) diff.edgesAdded += 1;
    else if (!same(edgeShape(prev), edgeShape(edge))) diff.edgesChanged += 1;
  }
  for (const key of oldEdges.keys()) if (!newEdges.has(key)) diff.edgesRemoved += 1;

  return diff;
}

export function newSnapshot(graph: Graph, label: string, at = Date.now()): Snapshot {
  return {
    id: `snap_${at.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    at,
    label: label.trim() || '手动快照',
    graph: clone(graph),
  };
}

export function pushSnapshot(list: Snapshot[], snap: Snapshot, limit = SNAPSHOT_LIMIT): Snapshot[] {
  return [snap, ...list].slice(0, limit);
}

export function loadSnapshots(): Snapshot[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): Snapshot[] => {
      if (!item || typeof item !== 'object') return [];
      const candidate = item as Partial<Snapshot>;
      if (typeof candidate.id !== 'string' || typeof candidate.at !== 'number') return [];
      if (typeof candidate.label !== 'string') return [];
      const result = GraphSchema.safeParse(candidate.graph);
      if (!result.success) return [];
      return [{ id: candidate.id, at: candidate.at, label: candidate.label, graph: result.data as Graph }];
    });
  } catch {
    return [];
  }
}

export function persistSnapshots(list: Snapshot[]): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function formatTime(at: number): string {
  return new Date(at).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatValue(value: unknown): string {
  if (value === undefined) return '∅';
  if (typeof value === 'string') return value || '∅';
  return JSON.stringify(value) ?? '∅';
}
