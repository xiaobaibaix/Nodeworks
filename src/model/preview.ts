import { estimateSize } from './autolayout';
import type { Graph } from './types';

export interface MiniNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

export interface MiniEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface MiniPreview {
  nodes: MiniNode[];
  edges: MiniEdge[];
}

const FALLBACK = '#5b6678';

/** 把子图压成节点卡片里的小预览：只画位置、尺寸和连线，不做交互。 */
export function miniPreview(graph: Graph, width = 200, height = 54, pad = 6): MiniPreview {
  if (graph.nodes.length === 0) return { nodes: [], edges: [] };

  const sizes = new Map(
    graph.nodes.map((n) => [n.id, estimateSize(n)]),
  );
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of graph.nodes) {
    const size = sizes.get(node.id)!;
    minX = Math.min(minX, node.pos.x);
    minY = Math.min(minY, node.pos.y);
    maxX = Math.max(maxX, node.pos.x + size.width);
    maxY = Math.max(maxY, node.pos.y + size.height);
  }
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;

  const project = (x: number, y: number): { x: number; y: number } => ({
    x: offsetX + (x - minX) * scale,
    y: offsetY + (y - minY) * scale,
  });

  // 缩略图只表达拓扑，不表达真实卡片尺寸：用位置中心 + 小色块，避免单节点铺满整条。
  const nodes: MiniNode[] = graph.nodes.map((node) => {
    const size = sizes.get(node.id)!;
    const center = project(node.pos.x + size.width / 2, node.pos.y + size.height / 2);
    const w = Math.min(34, Math.max(8, size.width * scale * 0.55));
    const h = Math.min(12, Math.max(5, size.height * scale * 0.4));
    return {
      id: node.id,
      x: center.x - w / 2,
      y: center.y - h / 2,
      w,
      h,
      fill: (node.kind && graph.kinds[node.kind]?.color) || FALLBACK,
    };
  });

  const centers = new Map(
    graph.nodes.map((node) => {
      const size = sizes.get(node.id)!;
      const p = project(node.pos.x + size.width / 2, node.pos.y + size.height / 2);
      return [node.id, p];
    }),
  );

  const edges: MiniEdge[] = [];
  for (const edge of graph.edges) {
    if (edge.orphan) continue;
    const a = centers.get(edge.from.node);
    const b = centers.get(edge.to.node);
    if (!a || !b) continue;
    edges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }

  return { nodes, edges };
}
