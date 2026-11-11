import { describe, expect, it } from 'vitest';
import {
  addGraph, mergeKinds, normalizeProject, projectFromGraph, removeGraph, renameGraph,
  syncActive, switchGraph, unifyKinds, type ProjectDoc,
} from '../src/model/project';
import type { Graph } from '../src/model/types';

function graph(title: string, kinds: Graph['kinds'] = {}): Graph {
  return {
    version: 1,
    kinds,
    nodes: [{ id: 'n1', title, props: {}, ports: [], pos: { x: 0, y: 0 } }],
    edges: [],
  };
}

function doc(): ProjectDoc {
  return {
    version: 1,
    active: 'a',
    graphs: [
      { id: 'a', name: '图 A', graph: graph('A') },
      { id: 'b', name: '图 B', graph: graph('B') },
    ],
  };
}

describe('project 容器', () => {
  it('projectFromGraph 的 active 与唯一图 id 一致', () => {
    const project = projectFromGraph(graph('X'), '主图');
    expect(project.graphs).toHaveLength(1);
    expect(project.active).toBe(project.graphs[0].id);
    expect(project.graphs[0].name).toBe('主图');
  });

  it('normalizeProject 修复空图与失效 active，并统一 kinds', () => {
    const project = normalizeProject({
      version: 1,
      active: 'missing',
      graphs: [
        { id: 'a', name: 'A', graph: graph('A', { item: { name: '物品' } }) },
        { id: 'b', name: 'B', graph: graph('B', { recipe: { name: '配方' } }) },
      ],
    });
    expect(project.active).toBe('a');
    expect(mergeKinds(project.graphs)).toEqual({
      item: { name: '物品' },
      recipe: { name: '配方' },
    });
    expect(project.graphs[1].graph.kinds).toEqual(project.graphs[0].graph.kinds);
  });

  it('addGraph 继承共享 kinds 并切到新图', () => {
    const base = unifyKinds({
      ...doc(),
      graphs: [
        { id: 'a', name: 'A', graph: graph('A', { item: { name: '物品' } }) },
        { id: 'b', name: 'B', graph: graph('B') },
      ],
    });
    const { project, id } = addGraph(base, '新图');
    expect(project.graphs).toHaveLength(3);
    expect(project.active).toBe(id);
    const added = project.graphs.find((pg) => pg.id === id);
    expect(added?.name).toBe('新图');
    expect(added?.graph.nodes).toHaveLength(0);
    expect(added?.graph.kinds).toEqual({ item: { name: '物品' } });
  });

  it('syncActive 把当前图写回并广播 kinds', () => {
    const next = syncActive(doc(), graph('A2', { machine: { name: '机器' } }), 'a');
    expect(next.graphs[0].graph.nodes[0].title).toBe('A2');
    expect(next.graphs[1].graph.kinds.machine).toEqual({ name: '机器' });
  });

  it('removeGraph 至少保留一张，并在删除当前图时换 active', () => {
    expect(removeGraph(projectFromGraph(graph('X')), 'only').graphs).toHaveLength(1);
    const next = removeGraph(doc(), 'a');
    expect(next.graphs).toHaveLength(1);
    expect(next.active).toBe('b');
  });

  it('renameGraph 去空白并忽略空名；switchGraph 拒绝未知 id', () => {
    const renamed = renameGraph(doc(), 'a', '  钛线  ');
    expect(renamed.graphs[0].name).toBe('钛线');
    expect(renameGraph(doc(), 'a', '   ').graphs[0].name).toBe('图 A');
    expect(switchGraph(doc(), 'b')?.active).toBe('b');
    expect(switchGraph(doc(), 'nope')).toBeNull();
  });
});
