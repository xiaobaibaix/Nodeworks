import { describe, expect, it } from 'vitest';
import { laneBands, laneGroups, laneLayout } from '../src/model/lanes';
import type { Graph, UnitNode } from '../src/model/types';

function node(id: string, title: string, tier: string, x = 0, y = 0): UnitNode {
  return {
    id,
    title,
    props: { 层级: { value: tier, type: 'string' } },
    ports: [{ id: `${id}_out`, dir: 'out', label: '产出', capacity: 'many' }],
    pos: { x, y },
  };
}

function graph(nodes: UnitNode[]): Graph {
  return { version: 1, nodes, edges: [], kinds: {} };
}

describe('lanes', () => {
  it('按固定层级顺序分组，未知层级排在后面', () => {
    const g = graph([
      node('a', '钢', '材料'),
      node('b', '铁', '原矿'),
      node('c', '轴承', '部件'),
      node('d', '神秘', '自定义'),
    ]);
    expect(laneGroups(g).map((group) => group.key)).toEqual(['原矿', '材料', '部件', '自定义']);
    expect(laneGroups(g)[0].nodes.map((n) => n.title)).toEqual(['铁']);
  });

  it('同层排成一列，不同层分列', () => {
    const g = graph([node('a', '铁', '原矿'), node('b', '铜', '原矿'), node('c', '钢', '材料')]);
    const { positions } = laneLayout(g);
    expect(positions.a.x).toBe(positions.b.x);
    expect(positions.b.y).toBeGreaterThan(positions.a.y);
    expect(positions.c.x).toBeGreaterThan(positions.a.x);
  });

  it('分区框覆盖该层所有节点', () => {
    const g = graph([node('a', '铁', '原矿', 10, 20), node('b', '铜', '原矿', 10, 260), node('c', '钢', '材料', 400, 20)]);
    const bands = laneBands(g);
    expect(bands).toHaveLength(2);
    expect(bands[0].ids.sort()).toEqual(['a', 'b']);
    expect(bands[0].width).toBeGreaterThan(240);
    expect(bands[1].x).toBeGreaterThan(bands[0].x);
  });
});
