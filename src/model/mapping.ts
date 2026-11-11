import { GraphSchema } from './schema';
import { uid } from './ops';
import type { Graph, PropMeta, UnitEdge, UnitNode } from './types';

/** 单类节点 → 目标表；属性名 → 目标字段名。 */
export interface NodeTableMapping {
  table: string;
  titleField: string;
  /** 用哪个属性值当业务 id（如 key）；没有就退回图内 id */
  idProp?: string;
  props?: Record<string, string>;
  defaults?: Record<string, unknown>;
  /** 导出时初始化为空数组的字段（recipe.inputs / tech.unlocks…） */
  arrays?: string[];
  /** 必填字段（目标字段名，含 titleField） */
  required?: string[];
  /** 配方必须有一条 runs on 边 */
  requireMachine?: boolean;
}

export type EdgeRule =
  | { id: string; from: string; to: string; store: 'recipeInput' | 'recipeOutput'; amountProp?: string }
  | { id: string; from: string; to: string; store: 'machineRef'; field: string }
  | { id: string; from: string; to: string; store: 'refList'; field: string };

export interface ExportMapping {
  version: 1;
  target: string;
  nodes: Record<string, NodeTableMapping>;
  edges: EdgeRule[];
  ports?: { in: string; out: string };
}

export type IssueLevel = 'error' | 'warn';

export interface DryRunIssue {
  level: IssueLevel;
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface DryRunReport {
  issues: DryRunIssue[];
  errors: number;
  warnings: number;
  /** 目标表 → 记录数 */
  counts: Record<string, number>;
}

export interface ExportOutput {
  project: Record<string, unknown>;
  report: DryRunReport;
}

/** 附录 A 的默认契约；节点 id 优先用 key 属性（ORE_TI 这类业务 id）。 */
export const FORGEWORKS_MAPPING: ExportMapping = {
  version: 1,
  target: 'forgeworks.project.json',
  ports: { in: '输入', out: '输出' },
  nodes: {
    element: {
      table: 'elements',
      titleField: 'name',
      idProp: 'key',
      props: { color: 'color', icon: 'icon' },
    },
    item: {
      table: 'items',
      titleField: 'name',
      idProp: 'key',
      props: {
        tier: 'tier',
        type: 'type',
        value: 'value',
        color: 'color',
        icon: 'icon',
        mesh: 'mesh',
        mat: 'mat',
        modelStatus: 'modelStatus',
      },
      required: ['name'],
    },
    machine: {
      table: 'machines',
      titleField: 'name',
      idProp: 'key',
      props: { footprint: 'footprint', icon: 'icon' },
    },
    recipe: {
      table: 'recipes',
      titleField: 'name',
      idProp: 'key',
      props: { cycle: 'cycle', power: 'power' },
      arrays: ['inputs', 'outputs'],
      required: ['name'],
      requireMachine: true,
    },
    tech: {
      table: 'techs',
      titleField: 'name',
      idProp: 'key',
      props: { cost: 'cost', time: 'time' },
      arrays: ['unlocks'],
    },
  },
  edges: [
    { id: 'recipe-input', from: 'item', to: 'recipe', store: 'recipeInput', amountProp: 'amount' },
    { id: 'recipe-output', from: 'recipe', to: 'item', store: 'recipeOutput', amountProp: 'amount' },
    { id: 'runs-on', from: 'recipe', to: 'machine', store: 'machineRef', field: 'machine' },
    { id: 'unlocks', from: 'tech', to: 'recipe', store: 'refList', field: 'unlocks' },
  ],
};

class Collector {
  readonly issues: DryRunIssue[] = [];

  warn(code: string, message: string, nodeId?: string, edgeId?: string): void {
    this.issues.push({ level: 'warn', code, message, nodeId, edgeId });
  }

  error(code: string, message: string, nodeId?: string, edgeId?: string): void {
    this.issues.push({ level: 'error', code, message, nodeId, edgeId });
  }

  report(counts: Record<string, number> = {}): DryRunReport {
    const errors = this.issues.filter((i) => i.level === 'error').length;
    return { issues: this.issues, errors, warnings: this.issues.length - errors, counts };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

/** 业务 id 优先；没有就用图内 id。 */
export function businessId(node: UnitNode, def: NodeTableMapping): string {
  if (def.idProp) {
    const raw = node.props[def.idProp]?.value;
    const id = text(raw);
    if (id) return id;
  }
  return node.id;
}

function amountOf(edge: UnitEdge, prop = 'amount'): number {
  const value = edge.props?.[prop]?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : 1;
}

/** 正向导出：图 → 目标 project.json，同时产出 dry-run 报告。 */
export function exportProject(
  graph: Graph,
  mapping: ExportMapping = FORGEWORKS_MAPPING,
): ExportOutput {
  const collect = new Collector();
  const project: Record<string, unknown> = { version: 1 };
  const counts: Record<string, number> = {};
  const objects = new Map<string, Record<string, unknown>>();
  const kinds = new Map<string, string | undefined>();
  const seen = new Set<string>();

  for (const [kind, def] of Object.entries(mapping.nodes)) {
    project[def.table] = [];
    if (graph.nodes.some((n) => n.kind === kind)) counts[def.table] = 0;
  }

  for (const node of graph.nodes) {
    kinds.set(node.id, node.kind);
    const def = node.kind ? mapping.nodes[node.kind] : undefined;
    if (!def) {
      collect.warn(
        'unmapped-kind',
        `单元「${node.title}」的 kind「${node.kind ?? '未分类'}」没有导出映射，已跳过`,
        node.id,
      );
      continue;
    }
    const table = project[def.table] as Record<string, unknown>[];
    const id = businessId(node, def);
    if (seen.has(id)) {
      collect.error('duplicate-id', `业务 id「${id}」重复，导出目标会冲突`, node.id);
    }
    seen.add(id);

    const record: Record<string, unknown> = { ...def.defaults, id };
    record[def.titleField] = node.title;
    for (const [propName, field] of Object.entries(def.props ?? {})) {
      const meta = node.props[propName];
      if (meta && meta.value !== undefined) record[field] = meta.value;
    }
    for (const field of def.arrays ?? []) record[field] = [];
    for (const name of Object.keys(node.props)) {
      if (name === def.idProp) continue;
      if (!def.props || !(name in def.props)) {
        collect.warn(
          'unmapped-prop',
          `单元「${node.title}」的属性「${name}」没有导出映射，已跳过`,
          node.id,
        );
      }
    }
    for (const field of def.required ?? []) {
      const value = record[field];
      if (value === undefined || value === null || value === '') {
        collect.error('missing-required', `单元「${node.title}」缺少必填字段「${field}」`, node.id);
      }
    }
    table.push(record);
    objects.set(node.id, record);
    counts[def.table] = (counts[def.table] ?? 0) + 1;
  }

  for (const edge of graph.edges) {
    if (edge.orphan) {
      collect.warn('orphan-edge', `孤儿边「${edge.id}」没有有效端点，未导出`, undefined, edge.id);
      continue;
    }
    const fromKind = kinds.get(edge.from.node);
    const toKind = kinds.get(edge.to.node);
    const rule = mapping.edges.find((r) => r.from === fromKind && r.to === toKind);
    if (!rule) {
      collect.warn(
        'unmapped-edge',
        `连线「${edge.from.node}.${edge.from.port} → ${edge.to.node}.${edge.to.port}」没有匹配的导出规则`,
        undefined,
        edge.id,
      );
      continue;
    }
    const from = objects.get(edge.from.node);
    const to = objects.get(edge.to.node);
    if (!from || !to) {
      collect.error('dangling-edge', `连线「${edge.id}」的端点没有导出，无法落表`, undefined, edge.id);
      continue;
    }
    if (rule.store === 'machineRef') {
      from[rule.field] = to.id;
      continue;
    }
    if (rule.store === 'refList') {
      const refs = from[rule.field];
      if (Array.isArray(refs)) refs.push(to.id);
      continue;
    }
    const recipe = rule.store === 'recipeInput' ? to : from;
    const item = rule.store === 'recipeInput' ? from : to;
    const field = rule.store === 'recipeInput' ? 'inputs' : 'outputs';
    const list = recipe[field];
    if (Array.isArray(list)) {
      list.push({ item: item.id, amount: amountOf(edge, rule.amountProp ?? 'amount') });
    }
  }

  for (const node of graph.nodes) {
    const def = node.kind ? mapping.nodes[node.kind] : undefined;
    if (!def?.requireMachine) continue;
    const record = objects.get(node.id);
    if (record && !record.machine) {
      collect.error('missing-required', `配方「${node.title}」没有机器（需要一条 runs on 连线）`, node.id);
    }
  }

  return { project, report: collect.report(counts) };
}

function propOf(value: unknown): PropMeta {
  if (typeof value === 'number') return { value, type: 'number' };
  if (typeof value === 'boolean') return { value, type: 'boolean' };
  if (typeof value === 'string') return { value, type: 'string' };
  return { value, type: 'json' };
}

const PORT_IN = 'p_in';
const PORT_OUT = 'p_out';

function makeNode(kind: string, id: string, title: string, pos: { x: number; y: number }, mapping: ExportMapping): UnitNode {
  return {
    id,
    kind,
    title,
    props: {},
    ports: [
      { id: PORT_IN, dir: 'in', label: mapping.ports?.in ?? '输入', capacity: 'many' },
      { id: PORT_OUT, dir: 'out', label: mapping.ports?.out ?? '输出', capacity: 'many' },
    ],
    pos,
  };
}

/** 反向导入：目标 project.json → 图，同时产出 dry-run 报告。 */
export function importProject(
  raw: unknown,
  mapping: ExportMapping = FORGEWORKS_MAPPING,
): { graph: Graph; report: DryRunReport } {
  const project = asRecord(raw);
  if (!project) throw new Error('project.json 顶层必须是 JSON 对象');

  const collect = new Collector();
  const counts: Record<string, number> = {};
  const graph: Graph = { version: 1, nodes: [], edges: [], kinds: {} };
  const byBusinessId = new Map<string, UnitNode>();
  const recipeRows: { node: UnitNode; entry: Record<string, unknown> }[] = [];
  const techRows: { node: UnitNode; entry: Record<string, unknown> }[] = [];

  const knownKeys = (def: NodeTableMapping): Set<string> =>
    new Set([
      'id',
      def.titleField,
      ...Object.values(def.props ?? {}),
      ...(def.arrays ?? []),
      'machine',
    ]);

  let kindIndex = 0;
  for (const [kind, def] of Object.entries(mapping.nodes)) {
    const table = project[def.table];
    if (table === undefined) continue;
    if (!Array.isArray(table)) {
      collect.error('bad-table', `「${def.table}」应为数组`);
      continue;
    }
    counts[def.table] = table.length;
    table.forEach((rawEntry, index) => {
      const entry = asRecord(rawEntry);
      if (!entry) {
        collect.error('bad-row', `「${def.table}」第 ${index + 1} 条不是对象`);
        return;
      }
      const rawId = text(entry.id);
      const id = rawId || uid('n');
      if (byBusinessId.has(id)) {
        collect.error('duplicate-id', `业务 id「${id}」重复，后一条改用新 id`);
      }
      const node = makeNode(
        kind,
        byBusinessId.has(id) ? uid('n') : id,
        text(entry[def.titleField]) || id,
        { x: 80 + (index % 4) * 300, y: 80 + kindIndex * 210 },
        mapping,
      );
      for (const [propName, field] of Object.entries(def.props ?? {})) {
        if (entry[field] !== undefined && entry[field] !== null) {
          node.props[propName] = propOf(entry[field]);
        }
      }
      const known = knownKeys(def);
      for (const key of Object.keys(entry)) {
        if (!known.has(key)) {
          collect.warn('unmapped-field', `「${def.table}.${id}」的字段「${key}」没有映射，已忽略`);
        }
      }
      graph.nodes.push(node);
      if (!byBusinessId.has(node.id)) byBusinessId.set(node.id, node);
      if (rawId && !byBusinessId.has(rawId)) byBusinessId.set(rawId, node);
      if (kind === 'recipe') recipeRows.push({ node, entry });
      if (kind === 'tech') techRows.push({ node, entry });
    });
    kindIndex += 1;
  }

  let edgeSeq = 0;
  const addEdge = (from: UnitNode, to: UnitNode, amount?: number) => {
    edgeSeq += 1;
    const edge: UnitEdge = {
      id: `e_${edgeSeq}`,
      from: { node: from.id, port: PORT_OUT },
      to: { node: to.id, port: PORT_IN },
    };
    if (amount !== undefined) {
      edge.props = { amount: { value: amount, type: 'number' } };
      edge.label = String(amount);
    }
    graph.edges.push(edge);
  };

  for (const { node: recipe, entry } of recipeRows) {
    for (const listName of ['inputs', 'outputs']) {
      const list = entry[listName];
      if (!Array.isArray(list)) continue;
      list.forEach((rawLink, i) => {
        const link = asRecord(rawLink);
        if (!link) {
          collect.error('bad-link', `配方「${recipe.title}」的 ${listName} 第 ${i + 1} 条不是对象`);
          return;
        }
        const targetId = text(link.item ?? link.id);
        const target = byBusinessId.get(targetId);
        if (!target) {
          collect.error('dangling-ref', `配方「${recipe.title}」引用了不存在的物品「${targetId}」`);
          return;
        }
        const amountRaw = link.amount;
        const amount = typeof amountRaw === 'number' && Number.isFinite(amountRaw) ? amountRaw : undefined;
        if (listName === 'inputs') addEdge(target, recipe, amount);
        else addEdge(recipe, target, amount);
      });
    }
    const machine = text(entry.machine);
    if (machine) {
      const target = byBusinessId.get(machine);
      if (!target) collect.error('dangling-ref', `配方「${recipe.title}」引用了不存在的机器「${machine}」`);
      else addEdge(recipe, target);
    } else {
      collect.error('missing-required', `配方「${recipe.title}」没有 machine 字段`);
    }
  }

  for (const { node: tech, entry } of techRows) {
    const list = entry.unlocks;
    if (!Array.isArray(list)) continue;
    list.forEach((rawRef, i) => {
      const targetId = text(rawRef);
      const target = byBusinessId.get(targetId);
      if (!target) {
        collect.error('dangling-ref', `科技「${tech.title}」的 unlocks 第 ${i + 1} 项引用了不存在的内容「${targetId}」`);
        return;
      }
      addEdge(tech, target);
    });
  }

  try {
    GraphSchema.parse(graph);
  } catch (error) {
    collect.error('invalid-graph', `导入后的图未通过校验：${(error as Error).message}`);
  }

  return { graph, report: collect.report(counts) };
}
