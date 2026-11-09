import { describe, expect, it } from 'vitest';
import { copySelection, pasteClip } from '../src/model/clipboard';
import { createEdge, createNode, createPort, emptyGraph } from '../src/model/ops';
import type { Graph } from '../src/model/types';

function fixture(): { g: Graph; ids: [string, string] } {
  const g = emptyGraph();
  const a = createNode('A', { x: 10, y: 20 });
  const b = createNode('B', { x: 200, y: 20 });
  const out = createPort('out', '出');
  const input = createPort('in', '入');
  a.ports = [out];
  b.ports = [input];
  g.nodes = [a, b];
  g.edges = [createEdge({ node: a.id, port: out.id }, { node: b.id, port: input.id })];
  return { g, ids: [a.id, b.id] };
}

describe('复制选区', () => {
  it('只复制两端都在选区的非孤儿边', () => {
    const { g, ids } = fixture();
    const outside = createNode('C');
    g.nodes.push(outside);
    const clip = copySelection(g, ids);
    expect(clip.nodes).toHaveLength(2);
    expect(clip.edges).toHaveLength(1);
  });

  it('复制后改原图不会污染剪贴板', () => {
    const { g, ids } = fixture();
    const clip = copySelection(g, ids);
    g.nodes[0].title = '改过了';
    expect(clip.nodes[0].title).toBe('A');
  });
});

describe('粘贴', () => {
  it('节点、端口、连线都换新 id，位置整体偏移', () => {
    const { g, ids } = fixture();
    const clip = copySelection(g, ids);
    const pasted = pasteClip(clip, { x: 32, y: 64 });
    expect(pasted.nodes).toHaveLength(2);
    expect(pasted.edges).toHaveLength(1);

    const oldIds = new Set(clip.nodes.map((n) => n.id));
    for (const node of pasted.nodes) expect(oldIds.has(node.id)).toBe(false);
    expect(pasted.nodes[0].pos).toEqual({ x: 42, y: 84 });

    const edge = pasted.edges[0];
    expect(pasted.nodes.some((n) => n.id === edge.from.node)).toBe(true);
    expect(pasted.nodes.some((n) => n.id === edge.to.node)).toBe(true);
    const fromNode = pasted.nodes.find((n) => n.id === edge.from.node)!;
    const toNode = pasted.nodes.find((n) => n.id === edge.to.node)!;
    expect(fromNode.ports.some((p) => p.id === edge.from.port)).toBe(true);
    expect(toNode.ports.some((p) => p.id === edge.to.port)).toBe(true);
  });

  it('外部连线不会被复制', () => {
    const { g, ids } = fixture();
    const c = createNode('C');
    const out = createPort('out');
    c.ports = [out];
    g.nodes.push(c);
    g.edges.push(createEdge({ node: c.id, port: out.id }, { node: ids[0], port: g.nodes[1].ports[0].id }));
    const clip = copySelection(g, ids);
    expect(clip.edges).toHaveLength(1);
  });
});
