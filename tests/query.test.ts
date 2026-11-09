import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTER, groupByKind, isFiltering, isolatedNodeIds, kindOptions, nodeMatches,
  orphanNodeIds, visibleNodes,
} from '../src/model/query';
import { createEdge, createNode, createPort, emptyGraph } from '../src/model/ops';
import type { Graph, UnitNode } from '../src/model/types';

function node(title: string, kind?: string): UnitNode {
  const n = createNode(title);
  if (kind) n.kind = kind;
  return n;
}

describe('搜索匹配', () => {
  const n = node('钛锭', 'item');
  n.id = 'n_ti';
  n.props = {
    value: { value: 9, type: 'number' },
    tags: { value: ['metal', 'plate'], type: 'json' },
  };

  it('匹配标题、id、kind、属性名与属性值', () => {
    expect(nodeMatches(n, '钛')).toBe(true);
    expect(nodeMatches(n, 'n_ti')).toBe(true);
    expect(nodeMatches(n, 'item')).toBe(true);
    expect(nodeMatches(n, 'value')).toBe(true);
    expect(nodeMatches(n, 'metal')).toBe(true);
    expect(nodeMatches(n, '9')).toBe(true);
  });

  it('不匹配时返回 false，空查询返回 true', () => {
    expect(nodeMatches(n, '钛矿')).toBe(false);
    expect(nodeMatches(n, '  ')).toBe(true);
  });
});

describe('分组与过滤', () => {
  function graph(): Graph {
    const g = emptyGraph();
    const b = node('B 钛板', 'recipe');
    const a = node('A 钛锭', 'item');
    const c = node('C 裸单元');
    const lonely = node('D 孤立', 'item');
    g.nodes = [b, a, c, lonely];
    const out = createPort('out');
    const input = createPort('in');
    a.ports = [out];
    b.ports = [input];
    g.edges = [createEdge({ node: a.id, port: out.id }, { node: b.id, port: input.id })];
    return g;
  }

  it('按 kind 分组，未分类排在最后，组内按标题排序', () => {
    const groups = groupByKind(graph().nodes);
    expect(groups.map((x) => x.kind)).toEqual(['item', 'recipe', '']);
    expect(groups[0].label).toBe('item');
    expect(groups[0].nodes.map((n) => n.title)).toEqual(['A 钛锭', 'D 孤立']);
    expect(groups[2].label).toBe('未分类');
  });

  it('kind 过滤只留下选中的 kind', () => {
    const g = graph();
    const list = visibleNodes(g, { ...EMPTY_FILTER, kinds: ['item'] });
    expect(list.map((n) => n.title)).toEqual(['A 钛锭', 'D 孤立']);
  });

  it('只看孤立：没有任何非孤儿连线', () => {
    const g = graph();
    const ids = isolatedNodeIds(g);
    expect(ids.size).toBe(2);
    const list = visibleNodes(g, { ...EMPTY_FILTER, onlyIsolated: true });
    expect(list.map((n) => n.title).sort()).toEqual(['C 裸单元', 'D 孤立']);
  });

  it('只看孤儿：被孤儿边牵连的节点', () => {
    const g = graph();
    g.edges[0].orphan = true;
    const ids = orphanNodeIds(g);
    expect(ids.size).toBe(2);
    expect(visibleNodes(g, { ...EMPTY_FILTER, onlyOrphan: true })).toHaveLength(2);
  });

  it('kindOptions 统计数量并忽略搜索词', () => {
    const options = kindOptions(graph());
    expect(options.find((o) => o.kind === 'item')?.count).toBe(2);
    expect(options[options.length - 1].label).toBe('未分类');
  });

  it('isFiltering 只在 kind/孤立/孤儿条件生效时为 true', () => {
    expect(isFiltering(EMPTY_FILTER)).toBe(false);
    expect(isFiltering({ kinds: [], onlyIsolated: false, onlyOrphan: false })).toBe(false);
    expect(isFiltering({ ...EMPTY_FILTER, kinds: ['item'] })).toBe(true);
    expect(isFiltering({ ...EMPTY_FILTER, onlyOrphan: true })).toBe(true);
  });
});
