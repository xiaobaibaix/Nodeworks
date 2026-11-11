import { describe, expect, it } from 'vitest';
import { emptyGraph, createNode } from '../src/model/ops';
import {
  canEnter, graphAtPath, normalizePath, pathTrail, updateAtPath,
} from '../src/model/path';
import { emptySubgraph } from '../src/model/schema';
import type { Graph } from '../src/model/types';

function nested(): Graph {
  const c = createNode('C');
  const cg: Graph = { ...emptyGraph(), nodes: [c] };
  const b = { ...createNode('B'), subgraph: cg };
  const bg: Graph = { ...emptyGraph(), nodes: [b] };
  const a = { ...createNode('A'), subgraph: bg };
  return { ...emptyGraph(), nodes: [a] };
}

describe('子图路径', () => {
  it('按 path 取出对应层', () => {
    const root = nested();
    const a = root.nodes[0];
    const b = a.subgraph!.nodes[0];
    expect(graphAtPath(root, [])?.nodes.map((n) => n.title)).toEqual(['A']);
    expect(graphAtPath(root, [a.id])?.nodes.map((n) => n.title)).toEqual(['B']);
    expect(graphAtPath(root, [a.id, b.id])?.nodes.map((n) => n.title)).toEqual(['C']);
  });

  it('断链返回 null', () => {
    expect(graphAtPath(nested(), ['nope'])).toBeNull();
  });

  it('只改目标层，父层逐级浅拷贝', () => {
    const root = nested();
    const a = root.nodes[0];
    const next = updateAtPath(root, [a.id], (g) => ({
      ...g,
      nodes: [...g.nodes, createNode('D')],
    }));
    expect(next).not.toBe(root);
    expect(next.nodes[0]).not.toBe(a);
    expect(next.nodes[0].subgraph!.nodes).toHaveLength(2);
    // 原对象不被修改
    expect(a.subgraph!.nodes).toHaveLength(1);
  });

  it('路径非法时原样返回', () => {
    const root = nested();
    const same = updateAtPath(root, ['nope'], (g) => ({ ...g, nodes: [] }));
    expect(same).toBe(root);
  });

  it('面包屑与规范化路径', () => {
    const root = nested();
    const a = root.nodes[0];
    const b = a.subgraph!.nodes[0];
    expect(pathTrail(root, [a.id, b.id]).map((t) => t.title)).toEqual(['A', 'B']);
    expect(normalizePath(root, [a.id, 'ghost', b.id])).toEqual([a.id]);
  });

  it('判断节点能否进入', () => {
    const root = nested();
    const a = root.nodes[0];
    expect(canEnter(root, [], a.id)).toBe(true);
    expect(canEnter(root, [], 'nope')).toBe(false);
  });

  it('空子图工厂是合法图', () => {
    expect(emptySubgraph()).toEqual({ version: 1, nodes: [], edges: [], kinds: {} });
  });
});
