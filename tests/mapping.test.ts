import { describe, expect, it } from 'vitest';
import { FORGEWORKS_MAPPING, exportProject, importProject } from '../src/model/mapping';
import type { Graph, PropMeta, UnitEdge, UnitNode, UnitPort } from '../src/model/types';

const port = (id: string, dir: 'in' | 'out'): UnitPort => ({
  id,
  dir,
  label: dir === 'in' ? '输入' : '输出',
  capacity: 'many',
});

function node(
  id: string,
  kind: string,
  title: string,
  props: Record<string, unknown> = {},
): UnitNode {
  const metas: Record<string, PropMeta> = {};
  for (const [key, value] of Object.entries(props)) {
    metas[key] = {
      value,
      type: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string',
    };
  }
  return {
    id,
    kind,
    title,
    props: metas,
    ports: [port('p_in', 'in'), port('p_out', 'out')],
    pos: { x: 0, y: 0 },
  };
}

function edge(
  id: string,
  from: [string, string],
  to: [string, string],
  amount?: number,
): UnitEdge {
  const e: UnitEdge = {
    id,
    from: { node: from[0], port: from[1] },
    to: { node: to[0], port: to[1] },
  };
  if (amount !== undefined) e.props = { amount: { value: amount, type: 'number' } };
  return e;
}

function fixture(): Graph {
  return {
    version: 1,
    kinds: {},
    nodes: [
      node('n_ore', 'item', '钛矿', { key: 'ORE_TI', tier: 1, tags: 'ore' }),
      node('n_ingot', 'item', '钛锭', { key: 'INGOT_TI', tier: 2, value: 9 }),
      node('n_recipe', 'recipe', '钛锭配方', { key: 'R_TI', cycle: 2, power: 30 }),
      node('n_machine', 'machine', '冶炼炉', { key: 'M_SMELTER', footprint: '2x2' }),
      node('n_tech', 'tech', '冶金', { key: 'T_METAL', cost: 100 }),
    ],
    edges: [
      edge('e1', ['n_ore', 'p_out'], ['n_recipe', 'p_in'], 2),
      edge('e2', ['n_recipe', 'p_out'], ['n_ingot', 'p_in'], 1),
      edge('e3', ['n_recipe', 'p_out'], ['n_machine', 'p_in']),
      edge('e4', ['n_tech', 'p_out'], ['n_recipe', 'p_in']),
    ],
  };
}

describe('exportProject', () => {
  it('把图投影成 Forgeworks 表，业务 id 取 key 属性', () => {
    const { project, report } = exportProject(fixture());
    expect(report.errors).toBe(0);
    expect(report.counts).toMatchObject({ items: 2, recipes: 1, machines: 1, techs: 1 });

    const items = project.items as Record<string, unknown>[];
    expect(items.map((i) => i.id).sort()).toEqual(['INGOT_TI', 'ORE_TI']);
    expect(items.find((i) => i.id === 'ORE_TI')).toMatchObject({ name: '钛矿', tier: 1 });

    const recipe = (project.recipes as Record<string, unknown>[])[0];
    expect(recipe).toMatchObject({ id: 'R_TI', name: '钛锭配方', cycle: 2, machine: 'M_SMELTER' });
    expect(recipe.inputs).toEqual([{ item: 'ORE_TI', amount: 2 }]);
    expect(recipe.outputs).toEqual([{ item: 'INGOT_TI', amount: 1 }]);

    const tech = (project.techs as Record<string, unknown>[])[0];
    expect(tech.unlocks).toEqual(['R_TI']);
  });

  it('未映射的属性只告警、不阻塞', () => {
    const { report } = exportProject(fixture());
    expect(report.warnings).toBeGreaterThan(0);
    const codes = report.issues.map((i) => i.code);
    expect(codes).toContain('unmapped-prop');
    expect(codes).not.toContain('unmapped-kind');
  });

  it('配方没有机器时报 missing-required 错误', () => {
    const graph = fixture();
    graph.edges = graph.edges.filter((e) => e.id !== 'e3');
    const { report } = exportProject(graph);
    expect(report.errors).toBeGreaterThan(0);
    expect(report.issues.some((i) => i.code === 'missing-required')).toBe(true);
  });

  it('业务 id 重复时拒绝导出', () => {
    const graph = fixture();
    graph.nodes.push(node('n_dup', 'item', '重复物品', { key: 'ORE_TI' }));
    const { report } = exportProject(graph);
    expect(report.errors).toBeGreaterThan(0);
    expect(report.issues.some((i) => i.code === 'duplicate-id')).toBe(true);
  });

  it('未映射 kind 与孤儿边只告警', () => {
    const graph = fixture();
    graph.nodes.push(node('n_misc', 'misc', '神秘单元'));
    graph.edges.push({ ...edge('e9', ['n_ore', 'p_out'], ['n_misc', 'p_in']), orphan: true });
    const { report } = exportProject(graph);
    expect(report.issues.some((i) => i.code === 'unmapped-kind')).toBe(true);
    expect(report.issues.some((i) => i.code === 'orphan-edge')).toBe(true);
  });
});

describe('importProject', () => {
  it('导出再导入能保住单元、连线、业务 id 与属性值', () => {
    const { project } = exportProject(fixture());
    const { graph, report } = importProject(project);
    expect(report.errors).toBe(0);
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(
      ['INGOT_TI', 'M_SMELTER', 'ORE_TI', 'R_TI', 'T_METAL'].sort(),
    );
    expect(graph.edges).toHaveLength(4);

    const ore = graph.nodes.find((n) => n.id === 'ORE_TI');
    expect(ore?.props.tier.value).toBe(1);
    const recipe = graph.nodes.find((n) => n.id === 'R_TI');
    expect(recipe?.props.cycle.value).toBe(2);
    expect(recipe?.props.power.value).toBe(30);
  });

  it('未知字段只告警，悬空引用报错', () => {
    const project = {
      version: 1,
      items: [{ id: 'A', name: 'A', mystery: true }],
      recipes: [{ id: 'R1', name: 'R1', inputs: [{ item: 'MISSING', amount: 1 }], machine: 'NOPE' }],
    };
    const { report } = importProject(project);
    const codes = report.issues.map((i) => i.code);
    expect(codes).toContain('unmapped-field');
    expect(codes.filter((c) => c === 'dangling-ref').length).toBeGreaterThanOrEqual(2);
    expect(report.errors).toBeGreaterThan(0);
  });

  it('非数组表与重复业务 id 会被拒绝或改名', () => {
    const project = {
      version: 1,
      items: 'nope',
    };
    const { report } = importProject(project);
    expect(report.issues.some((i) => i.code === 'bad-table')).toBe(true);

    const dup = {
      version: 1,
      items: [
        { id: 'X', name: 'X' },
        { id: 'X', name: 'X2' },
      ],
    };
    const res = importProject(dup);
    expect(res.report.issues.some((i) => i.code === 'duplicate-id')).toBe(true);
    expect(new Set(res.graph.nodes.map((n) => n.id)).size).toBe(2);
  });

  it('默认映射把配方放进 recipes 表', () => {
    const { project } = exportProject(fixture());
    expect(project).toHaveProperty('recipes');
    expect(FORGEWORKS_MAPPING.target).toBe('forgeworks.project.json');
  });
});
