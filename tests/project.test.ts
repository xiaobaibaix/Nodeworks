import { describe, expect, it } from 'vitest';
import {
  addFolder, addGraph, graphLevelLabel, mergeKinds, moveGraphToFolder, normalizeProject,
  parseProjectDoc, projectFromGraph, removeFolder, removeGraph, renameFolder, renameGraph,
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


describe('parseProjectDoc', () => {
  it('接受 project 文档并忽略坏图', () => {
    const graph = { version: 1 as const, nodes: [], edges: [], kinds: {} };
    const doc = { version: 1 as const, active: 'g1', graphs: [{ id: 'g1', name: '主图', graph }] };
    const parsed = parseProjectDoc(doc);
    expect(parsed?.graphs).toHaveLength(1);
    expect(parsed?.active).toBe('g1');
    expect(parseProjectDoc({ ...doc, graphs: [{ id: 'g1', name: 'x', graph: { version: 1 } }] })).toBeNull();
    expect(parseProjectDoc({ version: 2 })).toBeNull();
  });
});


describe('图的产物层级', () => {
  it('normalize 补齐 level 并把未分层排到最后', () => {
    const input: ProjectDoc = {
      version: 1,
      active: 'a',
      graphs: [
        { id: 'a', name: '钢', graph: graph('钢'), level: 2 },
        { id: 'b', name: '机器', graph: graph('机器') },
      ],
    };
    const normalized = normalizeProject(input);
    expect(normalized.graphs.map((g) => g.level)).toEqual([2, 0]);
    expect(graphLevelLabel(0)).toBe('其它');
    expect(graphLevelLabel(1)).toBe('一级矿');
    expect(graphLevelLabel(2)).toBe('二级产物');
  });

  it('新建图继承当前图层级', () => {
    const input = normalizeProject({
      version: 1,
      active: 'a',
      graphs: [{ id: 'a', name: '钢', graph: graph('钢'), level: 3 }],
    });
    const created = addGraph(input);
    expect(created.project.graphs.find((g) => g.id === created.id)?.level).toBe(3);
  });
});


describe('图分组（文件树）', () => {
  it('新建分组可嵌套，重命名保留结构', () => {
    const root = addFolder(doc(), '产线');
    const folder = root.project.folders!.find((f) => f.name === '产线')!;
    const child = addFolder(root.project, '炼钢', folder.id);
    const renamed = renameFolder(child.project, child.id, '转炉');
    const kids = renamed.folders!.filter((f) => f.parentId === folder.id);
    expect(kids).toHaveLength(1);
    expect(kids[0].name).toBe('转炉');
  });

  it('图可在分组里新建、移动，删除分组时图回到上一级', () => {
    const project = addFolder(doc(), '产线').project;
    const folder = project.folders![0];
    const created = addGraph(project, '钢', folder.id);
    expect(created.project.graphs.find((g) => g.id === created.id)?.folderId).toBe(folder.id);
    const moved = moveGraphToFolder(created.project, 'a', folder.id);
    expect(moved.graphs.find((g) => g.id === 'a')?.folderId).toBe(folder.id);
    const removed = removeFolder(moved, folder.id);
    expect(removed.folders).toHaveLength(0);
    expect(removed.graphs.every((g) => g.folderId === null)).toBe(true);
    expect(removed.graphs.map((g) => g.id).sort()).toEqual(['a', 'b', created.id].sort());
  });

  it('旧项目按 level 自动补分组', () => {
    const project = normalizeProject(doc());
    expect(project.folders?.length).toBe(1);
    expect(project.graphs.every((g) => g.folderId === project.folders![0].id)).toBe(true);
    expect(project.folders![0].name).toBe('其它');
  });
});
