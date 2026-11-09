import { uid } from './ops';
import type { Graph, UnitEdge, UnitNode } from './types';

export interface ClipPayload {
  nodes: UnitNode[];
  edges: UnitEdge[];
}

type Pos = { x: number; y: number };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 复制选中的单元，以及两端都在选区内的连线。
 * 结果做深拷贝：复制之后再改原图，不会污染剪贴板。
 */
export function copySelection(g: Graph, ids: string[]): ClipPayload {
  const picked = new Set(ids);
  return {
    nodes: clone(g.nodes.filter((n) => picked.has(n.id))),
    edges: clone(
      g.edges.filter(
        (e) => !e.orphan && picked.has(e.from.node) && picked.has(e.to.node),
      ),
    ),
  };
}

/**
 * 粘贴：节点、端口、连线全部换新 id，内部连线按映射重连，整体偏移。
 * 外部连线（只连到选区一半的）不会被复制。
 */
export function pasteClip(clip: ClipPayload, offset: Pos = { x: 32, y: 32 }): ClipPayload {
  const nodeIds = new Map<string, string>();
  const portIds = new Map<string, string>();

  const nodes = clip.nodes.map((n) => {
    const id = uid('n');
    nodeIds.set(n.id, id);
    const ports = n.ports.map((p) => {
      const portId = uid('p');
      portIds.set(`${n.id}:${p.id}`, portId);
      return { ...clone(p), id: portId };
    });
    return {
      ...clone(n),
      id,
      ports,
      pos: { x: n.pos.x + offset.x, y: n.pos.y + offset.y },
    };
  });

  const edges: UnitEdge[] = [];
  for (const e of clip.edges) {
    const from = {
      node: nodeIds.get(e.from.node),
      port: portIds.get(`${e.from.node}:${e.from.port}`),
    };
    const to = {
      node: nodeIds.get(e.to.node),
      port: portIds.get(`${e.to.node}:${e.to.port}`),
    };
    if (!from.node || !from.port || !to.node || !to.port) continue;
    edges.push({
      ...clone(e),
      id: uid('e'),
      from: { node: from.node, port: from.port },
      to: { node: to.node, port: to.port },
    });
  }

  return { nodes, edges };
}
