import { describe, expect, it } from 'vitest';
import { layeredLayout } from '../src/model/autolayout';
import type { Graph, UnitEdge, UnitNode } from '../src/model/types';

function node(id: string, y = 0): UnitNode {
  return {
    id,
    kind: 'item',
    title: id,
    props: {},
    ports: [{ id: 'p_in', dir: 'in', label: '入', capacity: 'many' }],
    pos: { x: 0, y },
  };
}

function edge(id: string, from: string, to: string): UnitEdge {
  return { id, from: { node: from, port: 'p_out' }, to: { node: to, port: 'p_in' } };
}

function graph(nodes: UnitNode[], edges: UnitEdge[] = []): Graph {
  return { version: 1, nodes, edges, kinds: {} };
}

describe('layeredLayout', () => {
  it('链式依赖按层从左到右排开', () => {
    const g = graph([node('A'), node('B'), node('C')], [
      edge('e1', 'A', 'B'),
      edge('e2', 'B', 'C'),
    ]);
    const { positions } = layeredLayout(g);
    expect(positions.A.x).toBeLessThan(positions.B.x);
    expect(positions.B.x).toBeLessThan(positions.C.x);
    expect(positions.A.y).toBe(positions.B.y);
  });

  it('同一层的分支纵向错开、横向对齐', () => {
    const g = graph([node('A'), node('B'), node('C')], [
      edge('e1', 'A', 'B'),
      edge('e2', 'A', 'C'),
    ]);
    const { positions } = layeredLayout(g);
    expect(positions.B.x).toBe(positions.C.x);
    expect(positions.B.y).not.toBe(positions.C.y);
  });

  it('菱形依赖把汇合点放到最后一层', () => {
    const g = graph([node('A'), node('B'), node('C'), node('D')], [
      edge('e1', 'A', 'B'),
      edge('e2', 'A', 'C'),
      edge('e3', 'B', 'D'),
      edge('e4', 'C', 'D'),
    ]);
    const { positions } = layeredLayout(g);
    expect(positions.D.x).toBeGreaterThan(positions.B.x);
    expect(positions.D.x).toBeGreaterThan(positions.C.x);
    expect(positions.B.x).toBe(positions.C.x);
  });

  it('环不会死循环，节点仍有有限坐标', () => {
    const g = graph([node('A'), node('B'), node('C')], [
      edge('e1', 'A', 'B'),
      edge('e2', 'B', 'C'),
      edge('e3', 'C', 'A'),
    ]);
    const { positions } = layeredLayout(g);
    expect(Object.keys(positions)).toHaveLength(3);
    for (const pos of Object.values(positions)) {
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
    }
    const xs = new Set([positions.A.x, positions.B.x, positions.C.x]);
    expect(xs.size).toBe(3);
  });

  it('孤立节点排到主图下方且互不重叠', () => {
    const g = graph([node('A'), node('B'), node('Z1'), node('Z2')], [edge('e1', 'A', 'B')]);
    const { positions } = layeredLayout(g);
    const mainBottom = Math.max(positions.A.y, positions.B.y);
    expect(positions.Z1.y).toBeGreaterThan(mainBottom);
    expect(positions.Z2.y).toBeGreaterThan(mainBottom);
    const sameRow = positions.Z1.y === positions.Z2.y;
    expect(sameRow).toBe(true);
    expect(positions.Z1.x).not.toBe(positions.Z2.x);
  });

  it('孤儿边不参与分层', () => {
    const g = graph([node('A'), node('B')], [{ ...edge('e1', 'A', 'B'), orphan: true }]);
    const { positions } = layeredLayout(g);
    // 两端都算孤立节点，落在下方网格而不是一左一右
    expect(positions.A.y).toBe(positions.B.y);
    expect(positions.A.x).not.toBe(positions.B.x);
  });

  it('结果是确定性的', () => {
    const g = graph([node('A'), node('B', 40), node('C', 90)], [
      edge('e1', 'A', 'B'),
      edge('e2', 'A', 'C'),
    ]);
    expect(layeredLayout(g).positions).toEqual(layeredLayout(g).positions);
  });
});
