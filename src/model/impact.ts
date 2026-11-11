import type { Graph } from './types';

export interface ImpactResult {
  root: string;
  /** 受影响的单元（含起点），按 id 去重 */
  nodes: string[];
  /** 受影响单元之间的边（含起点相关边） */
  edges: string[];
  /** 上游祖先（不含起点） */
  up: string[];
  /** 下游后代（不含起点） */
  down: string[];
  /** 按层：levels.up[0] 是 1 层上游 */
  levels: { up: string[][]; down: string[][] };
}

/**
 * 影响面：从某节点出发，沿连线向两侧各走 depth 层。
 * 只读派生，不修改图；孤儿边不参与（端点可能已失效）。
 * 环安全：visited 去重，每层只收新节点。
 */
export function impactOf(graph: Graph, id: string, depth = 2): ImpactResult {
  const rounded = Math.floor(depth);
  const limit = Number.isFinite(rounded) ? Math.max(1, Math.min(5, rounded)) : 2;

  const upAdj = new Map<string, string[]>();
  const downAdj = new Map<string, string[]>();
  const push = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key);
    if (list) {
      if (!list.includes(value)) list.push(value);
    } else {
      map.set(key, [value]);
    }
  };

  for (const edge of graph.edges) {
    if (edge.orphan) continue;
    push(downAdj, edge.from.node, edge.to.node);
    push(upAdj, edge.to.node, edge.from.node);
  }

  const walk = (adj: Map<string, string[]>) => {
    const levels: string[][] = [];
    const seen = new Set<string>([id]);
    let frontier = [id];
    for (let d = 0; d < limit && frontier.length; d += 1) {
      const next: string[] = [];
      for (const nodeId of frontier) {
        for (const peer of adj.get(nodeId) ?? []) {
          if (seen.has(peer)) continue;
          seen.add(peer);
          next.push(peer);
        }
      }
      if (!next.length) break;
      levels.push(next);
      frontier = next;
    }
    return { levels, ids: levels.flat() };
  };

  const up = walk(upAdj);
  const down = walk(downAdj);
  const nodeSet = new Set<string>([id, ...up.ids, ...down.ids]);
  const edges = graph.edges
    .filter((edge) => !edge.orphan && nodeSet.has(edge.from.node) && nodeSet.has(edge.to.node))
    .map((edge) => edge.id);

  return {
    root: id,
    nodes: [...nodeSet],
    edges,
    up: up.ids,
    down: down.ids,
    levels: { up: up.levels, down: down.levels },
  };
}
