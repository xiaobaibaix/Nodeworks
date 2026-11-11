import type { Graph, UnitNode } from './types';

export interface NodeSize {
  width: number;
  height: number;
}

export interface LayoutOptions {
  gapX?: number;
  gapY?: number;
  padding?: number;
}

export interface LayoutResult {
  positions: Record<string, { x: number; y: number }>;
  width: number;
  height: number;
}

const COLUMN_WIDTH = 240;

/** 没测过尺寸时按属性行与端口行估高，保证层内不叠。 */
export function estimateSize(node: UnitNode): NodeSize {
  const rows = Object.keys(node.props).length;
  const ports = Math.max(1, node.ports.length);
  return { width: COLUMN_WIDTH, height: 56 + rows * 22 + ports * 20 };
}

type EdgePair = { from: string; to: string; key: string };

/**
 * 分层布局（Sugiyama 简化版）：
 * 1. DFS 找出回边并忽略，得到 DAG；
 * 2. Kahn 拓扑求最长路径层级；
 * 3. 层内按前驱/后继重心排序，减少交叉；
 * 4. 层间横向排开，层内纵向居中；孤立节点单独排在下方网格。
 */
export function layeredLayout(
  graph: Graph,
  sizes: Record<string, NodeSize> = {},
  options: LayoutOptions = {},
): LayoutResult {
  const gapX = options.gapX ?? 120;
  const gapY = options.gapY ?? 48;
  const padding = options.padding ?? 60;
  const nodes = graph.nodes;
  if (!nodes.length) return { positions: {}, width: 0, height: 0 };

  const sizeOf = (node: UnitNode): NodeSize => sizes[node.id] ?? estimateSize(node);
  const ids = new Set(nodes.map((n) => n.id));

  const pairs: EdgePair[] = [];
  for (const edge of graph.edges) {
    if (edge.orphan) continue;
    if (!ids.has(edge.from.node) || !ids.has(edge.to.node)) continue;
    if (edge.from.node === edge.to.node) continue;
    pairs.push({ from: edge.from.node, to: edge.to.node, key: edge.id });
  }

  // 1. DFS 去回边
  const state = new Map<string, 1 | 2>();
  const ignored = new Set<string>();
  const outgoing = new Map<string, EdgePair[]>();
  for (const pair of pairs) {
    const list = outgoing.get(pair.from) ?? [];
    list.push(pair);
    outgoing.set(pair.from, list);
  }
  const visit = (id: string): void => {
    state.set(id, 1);
    for (const pair of outgoing.get(id) ?? []) {
      const next = state.get(pair.to);
      if (next === 1) ignored.add(pair.key);
      else if (!next) visit(pair.to);
    }
    state.set(id, 2);
  };
  for (const node of nodes) if (!state.has(node.id)) visit(node.id);

  const dag = pairs.filter((p) => !ignored.has(p.key));
  const succ = new Map<string, string[]>();
  const pred = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const node of nodes) indeg.set(node.id, 0);
  for (const pair of dag) {
    succ.set(pair.from, [...(succ.get(pair.from) ?? []), pair.to]);
    pred.set(pair.to, [...(pred.get(pair.to) ?? []), pair.from]);
    indeg.set(pair.to, (indeg.get(pair.to) ?? 0) + 1);
  }

  // 2. 最长路径层级
  const rank = new Map<string, number>();
  for (const node of nodes) rank.set(node.id, 0);
  const queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  for (let i = 0; i < queue.length; i += 1) {
    const id = queue[i];
    for (const next of succ.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(id) ?? 0) + 1));
      const left = (indeg.get(next) ?? 1) - 1;
      indeg.set(next, left);
      if (left === 0) queue.push(next);
    }
  }

  const degree = new Map<string, number>();
  for (const node of nodes) degree.set(node.id, 0);
  for (const pair of pairs) {
    degree.set(pair.from, (degree.get(pair.from) ?? 0) + 1);
    degree.set(pair.to, (degree.get(pair.to) ?? 0) + 1);
  }
  const isolated = nodes.filter((n) => (degree.get(n.id) ?? 0) === 0);
  const connected = nodes.filter((n) => (degree.get(n.id) ?? 0) > 0);

  const layerCount = connected.reduce((max, n) => Math.max(max, rank.get(n.id) ?? 0), 0) + 1;
  const layers: UnitNode[][] = Array.from({ length: layerCount }, () => []);
  for (const node of connected) layers[rank.get(node.id) ?? 0].push(node);

  // 3. 初始顺序沿用当前 y，避免每次布局都大幅换位
  const orderIndex = new Map<string, number>();
  for (const layer of layers) {
    layer.sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x || a.title.localeCompare(b.title));
    layer.forEach((n, i) => orderIndex.set(n.id, i));
  }
  const sortLayer = (layer: UnitNode[], prev?: UnitNode[], next?: UnitNode[]): void => {
    const score = (n: UnitNode): number => {
      const neighbors = prev ? pred.get(n.id) ?? [] : next ? succ.get(n.id) ?? [] : [];
      const pool = prev ?? next ?? [];
      const idx = neighbors
        .map((id) => pool.findIndex((m) => m.id === id))
        .filter((i) => i >= 0);
      if (!idx.length) return orderIndex.get(n.id) ?? 0;
      return idx.reduce((a, b) => a + b, 0) / idx.length;
    };
    layer.sort((a, b) => score(a) - score(b) || (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0));
    layer.forEach((n, i) => orderIndex.set(n.id, i));
  };
  for (let sweep = 0; sweep < 3; sweep += 1) {
    for (let l = 1; l < layers.length; l += 1) sortLayer(layers[l], layers[l - 1]);
    for (let l = layers.length - 2; l >= 0; l -= 1) sortLayer(layers[l], undefined, layers[l + 1]);
  }

  // 4. 坐标
  const positions: Record<string, { x: number; y: number }> = {};
  let cursorX = 0;
  let maxHeight = 0;
  layers.forEach((layer) => {
    if (!layer.length) return;
    const columnWidth = Math.max(...layer.map((n) => sizeOf(n).width));
    const total = layer.reduce((sum, n) => sum + sizeOf(n).height, 0) + gapY * (layer.length - 1);
    let y = -total / 2;
    for (const node of layer) {
      const size = sizeOf(node);
      positions[node.id] = { x: cursorX, y };
      y += size.height + gapY;
    }
    cursorX += columnWidth + gapX;
    maxHeight = Math.max(maxHeight, total);
  });

  // 孤立节点排在主图下方，三列网格
  if (isolated.length) {
    const startY = maxHeight / 2 + gapY * 2;
    const colWidth = Math.max(...isolated.map((n) => sizeOf(n).width)) + gapX;
    let x = 0;
    let y = startY;
    let rowHeight = 0;
    isolated.forEach((node, i) => {
      if (i > 0 && i % 3 === 0) {
        x = 0;
        y += rowHeight + gapY;
        rowHeight = 0;
      }
      positions[node.id] = { x, y };
      x += colWidth;
      rowHeight = Math.max(rowHeight, sizeOf(node).height);
    });
  }

  // 归一化到 (padding, padding)
  const xs = Object.values(positions).map((p) => p.x);
  const ys = Object.values(positions).map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const shiftX = padding - minX;
  const shiftY = padding - minY;
  for (const pos of Object.values(positions)) {
    pos.x = Math.round(pos.x + shiftX);
    pos.y = Math.round(pos.y + shiftY);
  }

  let width = 0;
  let height = 0;
  for (const node of nodes) {
    const pos = positions[node.id];
    if (!pos) continue;
    width = Math.max(width, pos.x + sizeOf(node).width + padding);
    height = Math.max(height, pos.y + sizeOf(node).height + padding);
  }
  return { positions, width, height };
}
