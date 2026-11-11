import type { Graph, PropMeta, UnitNode } from './types';

export type SortDir = 'asc' | 'desc';
export type ColumnKind = 'title' | 'kind' | 'prop' | 'ports';

export interface TableColumn {
  key: string;
  label: string;
  kind: ColumnKind;
  /** kind === 'prop' 时对应的属性名 */
  prop?: string;
}

export interface TableGroup {
  kind: string;
  label: string;
  rows: UnitNode[];
}

export const TITLE_COLUMN: TableColumn = { key: 'title', label: '标题', kind: 'title' };
export const KIND_COLUMN: TableColumn = { key: 'kind', label: 'kind', kind: 'kind' };
export const PORTS_COLUMN: TableColumn = { key: 'ports', label: '端口', kind: 'ports' };

/** 属性列的并集：所有节点 props 名去重后按名称排序。 */
export function propNames(graph: Graph): string[] {
  const names = new Set<string>();
  for (const node of graph.nodes) {
    for (const name of Object.keys(node.props)) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

export function columnsOf(graph: Graph): TableColumn[] {
  return [
    TITLE_COLUMN,
    KIND_COLUMN,
    ...propNames(graph).map<TableColumn>((name) => ({
      key: `prop:${name}`,
      label: name,
      kind: 'prop',
      prop: name,
    })),
    PORTS_COLUMN,
  ];
}

export function propText(meta: PropMeta | undefined): string {
  if (!meta) return '';
  const value = meta.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function cellText(node: UnitNode, column: TableColumn): string {
  if (column.kind === 'title') return node.title;
  if (column.kind === 'kind') return node.kind ?? '';
  if (column.kind === 'ports') {
    const input = node.ports.filter((p) => p.dir === 'in').length;
    const output = node.ports.filter((p) => p.dir === 'out').length;
    return `${input} 入 / ${output} 出`;
  }
  return column.prop ? propText(node.props[column.prop]) : '';
}

/** 单元格输入 → 存储值；number 输入非法时保留原文，交给用户继续改。 */
export function parseCell(text: string, type: string | undefined): unknown {
  const trimmed = text.trim();
  if (type === 'number') {
    if (trimmed === '') return '';
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : text;
  }
  if (type === 'boolean') {
    const lowered = trimmed.toLowerCase();
    if (['true', '1', 'yes', '是'].includes(lowered)) return true;
    if (['false', '0', 'no', '否'].includes(lowered)) return false;
  }
  return text;
}

const numeric = (text: string): number | null => {
  if (!text.trim()) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
};

export function sortNodes(
  rows: UnitNode[],
  column: TableColumn | null,
  dir: SortDir,
): UnitNode[] {
  if (!column) return [...rows];
  const factor = dir === 'asc' ? 1 : -1;
  const text = (node: UnitNode) => cellText(node, column);
  return [...rows].sort((a, b) => {
    const left = text(a);
    const right = text(b);
    // 缺失值永远排最后，不受升降序影响
    if (!left && right) return 1;
    if (left && !right) return -1;
    if (!left && !right) return 0;
    if (column.kind === 'prop') {
      const ln = numeric(left);
      const rn = numeric(right);
      if (ln !== null && rn !== null) return (ln - rn) * factor;
    }
    return left.localeCompare(right, 'zh-Hans-CN') * factor;
  });
}

/** 任意单元格包含查询词即命中（忽略大小写）。 */
export function filterNodes(rows: UnitNode[], query: string): UnitNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((node) =>
    [node.title, node.kind ?? '', node.id, ...Object.entries(node.props).flatMap(([name, meta]) => [name, propText(meta)])]
      .some((text) => text.toLowerCase().includes(needle)),
  );
}

/** 按 kind 分组；'' 归为“未分类”并排最后。 */
export function groupNodes(rows: UnitNode[]): TableGroup[] {
  const map = new Map<string, UnitNode[]>();
  for (const row of rows) {
    const key = row.kind?.trim() ?? '';
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      if (a === b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      return a.localeCompare(b, 'zh-Hans-CN');
    })
    .map(([kind, grouped]) => ({
      kind,
      label: kind || '未分类',
      rows: grouped,
    }));
}

/** 表格里的“属性值”编辑需要知道列类型；新属性默认 string。 */
export function propTypeOf(node: UnitNode, name: string): string | undefined {
  return node.props[name]?.type;
}
