import { describe, expect, it } from 'vitest';
import { impactOf } from '../src/model/impact';
import type { Graph, UnitEdge, UnitNode } from '../src/model/types';

function node(id: string): UnitNode {
  return { id, title: id, props: {}, ports: [], pos: { x: 0, y: 0 } };
}

function edge(from: string, to: string, orphan = false): UnitEdge {
  return {
    id: `${from}-${to}`,
    from: { node: from, port: 'out' },
    to: { node: to, port: 'in' },
    ...(orphan ? { orphan: true } : {}),
  };
}

function graph(nodes: string[], edges: UnitEdge[]): Graph {
  return { version: 1, nodes: nodes.map(node), edges, kinds: {} };
}

describe('影响面 impactOf', () => {
  it('链式上下游按层展开', () => {
    const g = graph(['a', 'b', 'c', 'd'], [edge('a', 'b'), edge('b', 'c'), edge('c', 'd')]);
    const impact = impactOf(g, 'b', 2);
    expect(impact.nodes.sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(impact.up).toEqual(['a']);
    expect(impact.down).toEqual(['c', 'd']);
    expect(impact.levels.up).toEqual([['a']]);
    expect(impact.levels.down).toEqual([['c'], ['d']]);
    expect(impact.edges.sort()).toEqual(['a-b', 'b-c', 'c-d']);
  });

  it('深度限制只看 N 层', () => {
    const g = graph(['a', 'b', 'c', 'd'], [edge('a', 'b'), edge('b', 'c'), edge('c', 'd')]);
    const impact = impactOf(g, 'a', 1);
    expect(impact.nodes.sort()).toEqual(['a', 'b']);
    expect(impact.down).toEqual(['b']);
    expect(impact.levels.up).toEqual([]);
  });

  it('忽略孤儿边', () => {
    const g = graph(['a', 'b', 'x'], [edge('a', 'b'), edge('a', 'x', true)]);
    const impact = impactOf(g, 'a', 3);
    expect(impact.nodes.sort()).toEqual(['a', 'b']);
    expect(impact.edges).toEqual(['a-b']);
  });

  it('环安全，不重复收集节点', () => {
    const g = graph(['a', 'b', 'c'], [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')]);
    const impact = impactOf(g, 'a', 5);
    expect(impact.nodes.sort()).toEqual(['a', 'b', 'c']);
    expect(impact.down).toEqual(['b', 'c']);
    expect(impact.up).toEqual(['c', 'b']);
    expect(new Set(impact.nodes).size).toBe(impact.nodes.length);
  });

  it('没有相关边时只有起点', () => {
    const g = graph(['a', 'b'], []);
    const impact = impactOf(g, 'a', 2);
    expect(impact).toMatchObject({ root: 'a', nodes: ['a'], edges: [], up: [], down: [] });
  });

  it('深度夹在 1..5', () => {
    const g = graph(['a', 'b', 'c'], [edge('a', 'b'), edge('b', 'c')]);
    expect(impactOf(g, 'a', 0).down).toEqual(['b']);
    expect(impactOf(g, 'a', 99).down).toEqual(['b', 'c']);
  });
});
