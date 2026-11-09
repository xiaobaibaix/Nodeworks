export interface Rect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type DistributeAxis = 'x' | 'y';

type Pos = { x: number; y: number };

function bounds(rects: Rect[]) {
  return {
    left: Math.min(...rects.map((r) => r.x)),
    right: Math.max(...rects.map((r) => r.x + r.w)),
    top: Math.min(...rects.map((r) => r.y)),
    bottom: Math.max(...rects.map((r) => r.y + r.h)),
  };
}

/** 对齐只改变一条轴上的坐标，另一轴保持不动。少于 2 个返回空。 */
export function alignRects(rects: Rect[], mode: AlignMode): Record<string, Pos> {
  if (rects.length < 2) return {};
  const b = bounds(rects);
  const moves: Record<string, Pos> = {};
  for (const r of rects) {
    const pos = { x: r.x, y: r.y };
    switch (mode) {
      case 'left':
        pos.x = b.left;
        break;
      case 'hcenter':
        pos.x = (b.left + b.right) / 2 - r.w / 2;
        break;
      case 'right':
        pos.x = b.right - r.w;
        break;
      case 'top':
        pos.y = b.top;
        break;
      case 'vcenter':
        pos.y = (b.top + b.bottom) / 2 - r.h / 2;
        break;
      case 'bottom':
        pos.y = b.bottom - r.h;
        break;
    }
    moves[r.id] = pos;
  }
  return moves;
}

/**
 * 均分间距：首尾固定，中间节点按等间隙分布。
 * 少于 3 个节点没有中间项，返回空。
 */
export function distributeRects(rects: Rect[], axis: DistributeAxis): Record<string, Pos> {
  if (rects.length < 3) return {};
  const sorted = [...rects].sort((a, b) => (axis === 'x' ? a.x - b.x : a.y - b.y));
  const start = sorted[0];
  const end = sorted[sorted.length - 1];
  const total = sorted.reduce((sum, r) => sum + (axis === 'x' ? r.w : r.h), 0);
  const span =
    axis === 'x' ? end.x + end.w - start.x : end.y + end.h - start.y;
  const gap = (span - total) / (sorted.length - 1);

  const moves: Record<string, Pos> = {};
  let cursor = axis === 'x' ? start.x : start.y;
  for (const r of sorted) {
    const pos = { x: r.x, y: r.y };
    if (axis === 'x') pos.x = cursor;
    else pos.y = cursor;
    moves[r.id] = pos;
    cursor += (axis === 'x' ? r.w : r.h) + gap;
  }
  return moves;
}

/** 位置集合是否真的发生变化——避免空提交污染历史。 */
export function positionsChanged(
  from: Record<string, Pos>,
  graphNodes: Array<{ id: string; pos: Pos }>,
): boolean {
  return graphNodes.some((n) => {
    const prev = from[n.id];
    return prev ? prev.x !== n.pos.x || prev.y !== n.pos.y : false;
  });
}
