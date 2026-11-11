import { describe, expect, it } from 'vitest';
import {
  cellText,
  columnsOf,
  filterNodes,
  groupNodes,
  parseCell,
  propNames,
  sortNodes,
  type TableColumn,
} from '../src/model/table';
import type { Graph, UnitNode } from '../src/model/types';

function node(partial: Partial<UnitNode> & { id: string }): UnitNode {
  return { title: partial.id, props: {}, ports: [], pos: { x: 0, y: 0 }, ...partial };
}

const valueColumn: TableColumn = { key: 'prop:value', label: 'value', kind: 'prop', prop: 'value' };
const titleColumn: TableColumn = { key: 'title', label: '标题', kind: 'title' };
const portsColumn: TableColumn = { key: 'ports', label: '端口', kind: 'ports' };

const graph: Graph = {
  version: 1,
  edges: [],
  kinds: {},
  nodes: [
    node({ id: 'a', title: '钛矿', kind: 'item', props: { value: { value: 4, type: 'number' }, tier: { value: 1, type: 'number' } } }),
    node({ id: 'b', title: '钛锭', kind: 'recipe', props: { value: { value: 9, type: 'number' } } }),
    node({ id: 'c', title: '钛板', kind: 'item', props: { value: { value: 2, type: 'number' } } }),
    node({ id: 'd', title: '未分类单元', props: {} }),
  ],
};

describe('表格列与单元格', () => {
  it('属性名取并集并排序', () => {
    expect(propNames(graph)).toEqual(['tier', 'value']);
  });

  it('列顺序为 标题/kind/属性…/端口', () => {
    expect(columnsOf(graph).map((column) => column.key)).toEqual([
      'title',
      'kind',
      'prop:tier',
      'prop:value',
      'ports',
    ]);
  });

  it('端口列显示入/出数量', () => {
    const withPorts = node({
      id: 'p',
      ports: [
        { id: 'i1', dir: 'in', label: '原料', capacity: 'many' },
        { id: 'i2', dir: 'in', label: '燃料', capacity: 'one' },
        { id: 'o1', dir: 'out', label: '产物', capacity: 'many' },
      ],
    });
    expect(cellText(withPorts, portsColumn)).toBe('2 入 / 1 出');
  });

  it('parseCell 按类型解析，非法数字保留原文', () => {
    expect(parseCell('3.5', 'number')).toBe(3.5);
    expect(parseCell('  ', 'number')).toBe('');
    expect(parseCell('abc', 'number')).toBe('abc');
    expect(parseCell('是', 'boolean')).toBe(true);
    expect(parseCell('no', 'boolean')).toBe(false);
    expect(parseCell('随便', 'boolean')).toBe('随便');
    expect(parseCell('文本', undefined)).toBe('文本');
  });
});

describe('排序、过滤与分组', () => {
  it('数字列按数值排序，缺失值恒最后', () => {
    const asc = sortNodes(graph.nodes, valueColumn, 'asc');
    expect(asc.map((n) => n.id)).toEqual(['c', 'a', 'b', 'd']);
    const desc = sortNodes(graph.nodes, valueColumn, 'desc');
    expect(desc.map((n) => n.id)).toEqual(['b', 'a', 'c', 'd']);
    expect(sortNodes(graph.nodes, valueColumn, 'asc').map((n) => n.id).at(-1)).toBe('d');
  });

  it('标题列按中文排序', () => {
    expect(sortNodes(graph.nodes, titleColumn, 'asc').map((n) => n.title)).toEqual([
      '钛板',
      '钛锭',
      '钛矿',
      '未分类单元',
    ]);
  });

  it('过滤匹配标题、id、kind 与属性值', () => {
    expect(filterNodes(graph.nodes, '钛锭').map((n) => n.id)).toEqual(['b']);
    expect(filterNodes(graph.nodes, 'recipe').map((n) => n.id)).toEqual(['b']);
    expect(filterNodes(graph.nodes, '钛板').map((n) => n.id)).toEqual(['c']);
    expect(filterNodes(graph.nodes, '')).toHaveLength(4);
  });

  it('分组按 kind 排序，未分类最后', () => {
    const groups = groupNodes(graph.nodes);
    expect(groups.map((group) => group.label)).toEqual(['item', 'recipe', '未分类']);
    expect(groups[0].rows.map((n) => n.id)).toEqual(['a', 'c']);
    expect(groups[2].kind).toBe('');
  });
});
