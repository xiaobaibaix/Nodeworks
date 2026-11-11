import type { Graph, UnitNode } from './types';

/** 沿 path（节点 id 链）取出当前层图；路径不完整时返回 null。 */
export function graphAtPath(root: Graph, path: string[]): Graph | null {
  let g = root;
  for (const id of path) {
    const node = g.nodes.find((n) => n.id === id);
    if (!node?.subgraph) return null;
    g = node.subgraph;
  }
  return g;
}

/**
 * 在 path 指向的那一层上应用 fn，逐层复制父图。
 * 路径不合法或 fn 返回原值时，尽量返回原对象，避免无意义的重渲染。
 */
export function updateAtPath(
  root: Graph,
  path: string[],
  fn: (g: Graph) => Graph,
): Graph {
  if (!path.length) return fn(root);
  const [head, ...rest] = path;
  let changed = false;
  const nodes = root.nodes.map((n) => {
    if (n.id !== head || !n.subgraph) return n;
    const next = updateAtPath(n.subgraph, rest, fn);
    if (next === n.subgraph) return n;
    changed = true;
    return { ...n, subgraph: next };
  });
  return changed ? { ...root, nodes } : root;
}

export interface TrailItem {
  id: string;
  title: string;
}

/** 面包屑：只返回真实存在的前缀，遇到断链立即停止。 */
export function pathTrail(root: Graph, path: string[]): TrailItem[] {
  const trail: TrailItem[] = [];
  let g: Graph | undefined = root;
  for (const id of path) {
    const node: UnitNode | undefined = g?.nodes.find((n) => n.id === id);
    if (!node?.subgraph) break;
    trail.push({ id, title: node.title });
    g = node.subgraph;
  }
  return trail;
}

/** 撤销/载入后路径可能失效，截到最长仍有效的前缀。 */
export function normalizePath(root: Graph, path: string[]): string[] {
  return pathTrail(root, path).map((t) => t.id);
}

/** 该节点能否进入（有子图）。 */
export function canEnter(root: Graph, path: string[], nodeId: string): boolean {
  const g = graphAtPath(root, path);
  return Boolean(g?.nodes.find((n) => n.id === nodeId)?.subgraph);
}
