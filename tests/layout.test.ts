import { describe, expect, it } from 'vitest';
import {
  alignRects, distributeRects, positionsChanged, type Rect,
} from '../src/model/layout';

const rects: Rect[] = [
  { id: 'a', x: 0, y: 0, w: 100, h: 50 },
  { id: 'b', x: 300, y: 120, w: 200, h: 80 },
  { id: 'c', x: 600, y: 40, w: 100, h: 50 },
];

describe('对齐', () => {
  it('左对齐只改 x，y 不动', () => {
    const moves = alignRects(rects, 'left');
    expect(moves.a).toEqual({ x: 0, y: 0 });
    expect(moves.b).toEqual({ x: 0, y: 120 });
    expect(moves.c).toEqual({ x: 0, y: 40 });
  });

  it('右对齐贴住最右边界', () => {
    const moves = alignRects(rects, 'right');
    expect(moves.a.x).toBe(600);
    expect(moves.b.x).toBe(500);
    expect(moves.c.x).toBe(600);
  });

  it('水平居中按各宽度的中心对齐', () => {
    const moves = alignRects(rects, 'hcenter');
    expect(moves.a.x).toBe(300);
    expect(moves.b.x).toBe(250);
    expect(moves.c.x).toBe(300);
  });

  it('顶对齐/垂直居中/底对齐', () => {
    expect(alignRects(rects, 'top').b).toEqual({ x: 300, y: 0 });
    const bottom = alignRects(rects, 'bottom');
    expect(bottom.a.y).toBe(150);
    expect(bottom.b.y).toBe(120);
    expect(bottom.c.y).toBe(150);
    const center = alignRects(rects, 'vcenter');
    expect(center.a.y).toBe(75);
    expect(center.b.y).toBe(60);
  });

  it('少于两个返回空', () => {
    expect(alignRects([rects[0]], 'left')).toEqual({});
    expect(alignRects([], 'left')).toEqual({});
  });
});

describe('分布', () => {
  it('首尾固定，中间等间隙', () => {
    const moves = distributeRects(rects, 'x');
    expect(moves.a.x).toBe(0);
    expect(moves.c.x).toBe(600);
    expect(moves.b.x).toBe(250);
  });

  it('纵轴分布同理', () => {
    const moves = distributeRects(rects, 'y');
    expect(moves.a.y).toBe(0);
    expect(moves.c.y).toBe(60);
    expect(moves.b.y).toBe(120);
  });

  it('少于三个没有中间项', () => {
    expect(distributeRects(rects.slice(0, 2), 'x')).toEqual({});
  });
});

describe('位置变化检测', () => {
  it('任一节点位置变化即为 true', () => {
    const nodes = [
      { id: 'a', pos: { x: 0, y: 0 } },
      { id: 'b', pos: { x: 1, y: 0 } },
    ];
    expect(positionsChanged({ a: { x: 0, y: 0 }, b: { x: 0, y: 0 } }, nodes)).toBe(true);
    expect(positionsChanged({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, nodes)).toBe(false);
  });
});
