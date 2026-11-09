import type { Graph, PropMeta, UnitNode } from './types';

export interface GraphFilter {
  query: string;
  /** 空数组 = 不过滤；元素为 kind 字符串，'' 表示没有 kind 的单元 */
  kinds: string[];
  onlyIsolated: boolean;
  onlyOrphan: boolean;
}

export type CanvasFilter = Omit<GraphFilter, 'query'>;

export const EMPTY_FILTER: GraphFilter = {
  query: '',
  kinds: [],
  onlyIsolated: false,
  onlyOrphan: false,
};

export function isFiltering(filter: CanvasFilter): boolean {
  return filter.kinds.length > 0 || filter.onlyIsolated || filter.onlyOrphan;
}

/** 没有任何非孤儿连线的单元。 */
export function isolatedNodeIds(g: Graph): Set<string> {
  const linked = new Set<string>();
  for (const e of g.edges) {
    if (e.orphan) continue;
    linked.add(e.from.node);
    linked.add(e.to.node);
  }
  return new Set(
    g.nodes.filter((n) => !linked.has(n.id)).map((n) => n.id),
  );
}

/** 被孤儿边牵连的单元。 */
export function orphanNodeIds(g: Graph): Set<string> {
  const ids = new Set<string>();
  for (const e of g.edges) {
    if (!e.orphan) continue;
    ids.add(e.from.node);
    ids.add(e.to.node);
  }
  return ids;
}

function propText(meta: PropMeta): string {
  const value = meta.value;
  const text =
    typeof value === 'string' ? value : value === undefined ? '' : JSON.stringify(value);
  return `${meta.type ?? ''} ${text ?? ''}`;
}

/** 标题、id、kind、属性名、属性值都参与匹配；空查询匹配一切。 */
export function nodeMatches(node: UnitNode, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    node.title,
    node.id,
    node.kind ?? '',
    ...Object.entries(node.props).flatMap(([key, meta]) => [key, propText(meta)]),
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

/** kind / 孤立 / 孤儿过滤后的节点（不含搜索词）。 */
export function visibleNodes(g: Graph, filter: CanvasFilter): UnitNode[] {
  const kindSet = new Set(filter.kinds);
  const isolated = filter.onlyIsolated ? isolatedNodeIds(g) : null;
  const orphan = filter.onlyOrphan ? orphanNodeIds(g) : null;
  return g.nodes.filter(
    (n) =>
      (kindSet.size === 0 || kindSet.has(n.kind ?? '')) &&
      (!isolated || isolated.has(n.id)) &&
      (!orphan || orphan.has(n.id)),
  );
}

export interface KindGroup {
  kind: string;
  label: string;
  nodes: UnitNode[];
}

const KIND_NONE_LABEL = '未分类';

export function kindLabel(kind: string): string {
  return kind || KIND_NONE_LABEL;
}

/** 按 kind 分组；组内按标题排序，未分类排最后。 */
export function groupByKind(nodes: UnitNode[]): KindGroup[] {
  const map = new Map<string, UnitNode[]>();
  for (const node of nodes) {
    const kind = node.kind?.trim() ?? '';
    const list = map.get(kind);
    if (list) list.push(node);
    else map.set(kind, [node]);
  }
  return [...map.entries()]
    .map(([kind, list]) => ({
      kind,
      label: kindLabel(kind),
      nodes: [...list].sort((a, b) => a.title.localeCompare(b.title, 'zh')),
    }))
    .sort((a, b) => {
      if (a.kind === '') return 1;
      if (b.kind === '') return -1;
      return a.kind.localeCompare(b.kind, 'zh');
    });
}

export interface KindOption {
  kind: string;
  label: string;
  count: number;
}

/** 图里实际出现的 kind，用于过滤条。 */
export function kindOptions(g: Graph): KindOption[] {
  const counts = new Map<string, number>();
  for (const node of g.nodes) {
    const kind = node.kind?.trim() ?? '';
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, label: kindLabel(kind), count }))
    .sort((a, b) => {
      if (a.kind === '') return 1;
      if (b.kind === '') return -1;
      return a.kind.localeCompare(b.kind, 'zh');
    });
}
