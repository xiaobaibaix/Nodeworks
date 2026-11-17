import { describe, expect, it } from 'vitest';
import { enforceSingleInputs } from '../src/model/inputs';
import { createEdge, createNode, createPort, emptyGraph, validateConnection } from '../src/model/ops';
import type { Graph } from '../src/model/types';

function twoIntoOne(): Graph {
  const g = emptyGraph();
  const a = createNode('A', { x: 0, y: 0 });
  const b = createNode('B', { x: 0, y: 100 });
  const c = createNode('C', { x: 240, y: 0 });
  const ao = createPort('out', '出', 'many');
  const bo = createPort('out', '出', 'many');
  const ci = createPort('in', '原料', 'many');
  a.ports = [ao];
  b.ports = [bo];
  c.ports = [ci];
  g.nodes = [a, b, c];
  g.edges = [
    createEdge({ node: a.id, port: ao.id }, { node: c.id, port: ci.id }),
    createEdge({ node: b.id, port: bo.id }, { node: c.id, port: ci.id }),
  ];
  return g;
}

describe('输入端口单条连线迁移', () => {
  it('把多个输入拆到新端口，全部输入 capacity=one', () => {
    const next = enforceSingleInputs(twoIntoOne());
    const c = next.nodes.find((n) => n.title === 'C')!;
    const ins = c.ports.filter((p) => p.dir === 'in');
    expect(ins).toHaveLength(2);
    expect(ins.every((p) => p.capacity === 'one')).toBe(true);
    expect(ins[1].label).toBe('原料 2');
    expect(new Set(next.edges.map((e) => e.to.port)).size).toBe(2);
  });

  it('已经合规的图不产生变化（幂等）', () => {
    const once = enforceSingleInputs(twoIntoOne());
    expect(enforceSingleInputs(once)).toBe(once);
  });

  it('单条输入口拒绝第二条连线', () => {
    const g = twoIntoOne();
    g.nodes[2].ports[0].capacity = 'one';
    g.edges = [g.edges[0]];
    expect(
      validateConnection(
        g,
        { node: g.nodes[1].id, port: g.nodes[1].ports[0].id },
        { node: g.nodes[2].id, port: g.nodes[2].ports[0].id },
      ),
    ).toBe('该输入口只允许一条连线');
  });
});
