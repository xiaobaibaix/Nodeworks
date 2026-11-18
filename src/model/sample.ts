import { createEdge, createNode, createPort } from './ops';
import type { Graph } from './types';

export function sampleGraph(): Graph {
  const ore = createNode('钛矿', { x: 90, y: 180 });
  ore.kind = 'item';
  ore.props = {
    value: { value: 4, type: 'number', unit: 'cr' },
    tier: { value: 1, type: 'number' },
    tags: { value: ['ore', 'metal'], type: 'json' },
  };
  const inOre = createPort('in', '矿石');
  const outOre = createPort('out', '钛矿');
  ore.ports = [inOre, outOre];

  const ingot = createNode('钛锭', { x: 430, y: 180 });
  ingot.kind = 'item';
  ingot.props = {
    value: { value: 9, type: 'number', unit: 'cr' },
    tier: { value: 2, type: 'number' },
  };
  const inIngot = createPort('in', '矿石');
  const outIngot = createPort('out', '钛锭');
  ingot.ports = [inIngot, outIngot];

  const plate = createNode('钛板', { x: 770, y: 180 });
  plate.kind = 'item';
  plate.props = {
    value: { value: 18, type: 'number', unit: 'cr' },
    tier: { value: 2, type: 'number' },
  };
  const inPlate = createPort('in', '钛锭');
  plate.ports = [inPlate];

  const e1 = createEdge({ node: ore.id, port: outOre.id }, { node: ingot.id, port: inIngot.id });
  e1.label = '2 : 1';
  e1.props = { ratio: { value: 2, type: 'number' } };

  const e2 = createEdge({ node: ingot.id, port: outIngot.id }, { node: plate.id, port: inPlate.id });
  e2.label = '3 : 1';

  return {
    version: 1,
    nodes: [ore, ingot, plate],
    edges: [e1, e2],
    kinds: {
      item: {
        name: '物品',
        color: '#7dc4ff',
        defaults: {
          value: { value: 0, type: 'number', unit: 'cr' },
          tier: { value: 1, type: 'number' },
        },
        ports: [
          { dir: 'in', label: '输入', capacity: 'many' },
          { dir: 'out', label: '输出', capacity: 'many' },
        ],
      },
      recipe: {
        name: '配方',
        color: '#ffbe5c',
        defaults: {
          cycle: { value: 1, type: 'number', unit: 's' },
          power: { value: 0, type: 'number', unit: 'kW' },
        },
        ports: [
          { dir: 'in', label: '原料', capacity: 'many' },
          { dir: 'out', label: '产物', capacity: 'many' },
        ],
      },
      machine: {
        name: '机器',
        color: '#9ae6b4',
        defaults: {
          footprint: { value: '1x1', type: 'string' },
          power: { value: 0, type: 'number', unit: 'kW' },
        },
        ports: [
          { dir: 'in', label: '输入', capacity: 'many' },
          { dir: 'out', label: '输出', capacity: 'many' },
        ],
      },
    },
  };
}
