import { estimateSize } from './autolayout';
import type { Graph, UnitNode } from './types';

type Pos = { x: number; y: number };

/** 用于分区的属性名；值不是字符串时归入「其它」。 */
export const LANE_PROP = '层级';

/** 已知分区的显示顺序，其余按名称排在后面。 */
export const LANE_ORDER = [
  '原矿', '材料', '部件', '模块',
  '采掘', '选矿', '冶炼', '化工', '制造', '电力', '物流', '巨型',
  '机器', '阶段', '其它',
];

export interface LaneGroup {
  key: string;
  nodes: UnitNode[];
}

export interface LaneBand {
  key: string;
  label: string;
  ids: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

export function laneKey(node: UnitNode): string {
  const value = node.props?.[LANE_PROP]?.value;
  return typeof value === 'string' && value.trim() ? value.trim() : '其它';
}

export function laneGroups(graph: Graph): LaneGroup[] {
  const map = new Map<string, UnitNode[]>();
  for (const node of graph.nodes) {
    const key = laneKey(node);
    const list = map.get(key);
    if (list) list.push(node);
    else map.set(key, [node]);
  }
  const keys = [...map.keys()].sort((a, b) => {
    const ia = LANE_ORDER.indexOf(a);
    const ib = LANE_ORDER.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.localeCompare(b, 'zh');
  });
  return keys.map((key) => ({
    key,
    nodes: [...(map.get(key) ?? [])].sort((a, b) => a.title.localeCompare(b.title, 'zh')),
  }));
}

/**
 * 按层级把节点排成若干竖列：每列一个分区，列内按标题排序。
 * 返回的 bands 与排好的坐标一致，供画布上的分区框使用。
 */
export function laneLayout(
  graph: Graph,
  options: { gapX?: number; gapY?: number; top?: number; left?: number; perColumn?: number } = {},
): { positions: Record<string, Pos>; bands: LaneBand[] } {
  const gapX = options.gapX ?? 110;
  const gapY = options.gapY ?? 34;
  const top = options.top ?? 96;
  const left = options.left ?? 80;
  const perColumn = Math.max(1, options.perColumn ?? 9);
  const groups = laneGroups(graph);
  const positions: Record<string, Pos> = {};
  const bands: LaneBand[] = [];
  let x = left;
  for (const group of groups) {
    const columns: UnitNode[][] = [];
    for (let i = 0; i < group.nodes.length; i += perColumn) columns.push(group.nodes.slice(i, i + perColumn));
    const columnWidth = 240;
    const innerGap = 36;
    let maxHeight = 0;
    columns.forEach((column, columnIndex) => {
      let y = top + 44;
      column.forEach((node) => {
        const size = estimateSize(node);
        positions[node.id] = {
          x: Math.round(x + columnIndex * (columnWidth + innerGap)),
          y: Math.round(y),
        };
        y += size.height + gapY;
      });
      maxHeight = Math.max(maxHeight, y - gapY - (top + 44));
    });
    const width = columns.length * columnWidth + (columns.length - 1) * innerGap;
    bands.push({
      key: group.key,
      label: group.key,
      ids: group.nodes.map((node) => node.id),
      x: x - 20,
      y: top - 12,
      width: width + 40,
      height: maxHeight + 44,
    });
    x += width + gapX;
  }
  return { positions, bands };
}

/** 用节点当前位置反推分区框，拖动节点后框会跟着走。 */
export function laneBands(graph: Graph): LaneBand[] {
  const groups = laneGroups(graph);
  if (groups.length < 2) return [];
  return groups.map((group) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of group.nodes) {
      const size = estimateSize(node);
      minX = Math.min(minX, node.pos.x);
      minY = Math.min(minY, node.pos.y);
      maxX = Math.max(maxX, node.pos.x + size.width);
      maxY = Math.max(maxY, node.pos.y + size.height);
    }
    return {
      key: group.key,
      label: group.key,
      ids: group.nodes.map((node) => node.id),
      x: minX - 20,
      y: minY - 40,
      width: maxX - minX + 40,
      height: maxY - minY + 60,
    };
  });
}
