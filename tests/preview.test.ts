import { describe, expect, it } from 'vitest';
import { miniPreview } from '../src/model/preview';
import type { Graph } from '../src/model/types';

function graph(): Graph {
  return {
    version: 1,
    kinds: { item: { name: '物品', color: '#f0a25c' } },
    nodes: [
      { id: 'a', kind: 'item', title: 'A', props: {}, ports: [], pos: { x: 100, y: 80 } },
      { id: 'b', kind: 'other', title: 'B', props: {}, ports: [], pos: { x: 500, y: 300 } },
    ],
    edges: [
      {
        id: 'e1',
        from: { node: 'a', port: 'o' },
        to: { node: 'b', port: 'i' },
      },
      {
        id: 'e2',
        from: { node: 'a', port: 'o' },
        to: { node: 'b', port: 'i' },
        orphan: true,
      },
    ],
  };
}

describe('miniPreview', () => {
  it('空图返回空预览', () => {
    expect(miniPreview({ version: 1, kinds: {}, nodes: [], edges: [] })).toEqual({
      nodes: [],
      edges: [],
    });
  });

  it('所有节点落在画布范围内', () => {
    const preview = miniPreview(graph(), 200, 54);
    expect(preview.nodes).toHaveLength(2);
    for (const node of preview.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.x + node.w).toBeLessThanOrEqual(200.001);
      expect(node.y + node.h).toBeLessThanOrEqual(54.001);
      expect(node.w).toBeGreaterThan(0);
    }
  });

  it('相对位置与真实布局一致', () => {
    const preview = miniPreview(graph(), 200, 54);
    expect(preview.nodes[0].x).toBeLessThan(preview.nodes[1].x);
    expect(preview.nodes[0].y).toBeLessThan(preview.nodes[1].y);
  });

  it('缩略图节点带源单元 id，供点击进入', () => {
    expect(miniPreview(graph()).nodes.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('跳过孤儿边，节点填色取 kind 颜色', () => {
    const preview = miniPreview(graph(), 200, 54);
    expect(preview.edges).toHaveLength(1);
    expect(preview.nodes[0].fill).toBe('#f0a25c');
    expect(preview.nodes[1].fill).toBe('#5b6678');
  });
});
