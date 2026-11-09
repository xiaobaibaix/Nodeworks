import { describe, expect, it } from 'vitest';
import {
  addEdgeOp, addNodeOp, addPortOp, createEdge, createNode, createPort, emptyGraph,
  findPort, orphanEdges, removeNodeOp, removePortEdgesOp, removePortOp, replacePortInEdgesOp,
  setNodePosOp, validateConnection, withKindDefaults,
} from '../src/model/ops';
import type { Graph, UnitNode } from '../src/model/types';

function fixture(): {
  g: Graph;
  a: UnitNode;
  b: UnitNode;
  out: string;
  input: string;
} {
  const g = emptyGraph();
  const a = createNode('A', { x: 0, y: 0 });
  const b = createNode('B', { x: 200, y: 0 });
  const out = createPort('out', '出');
  const input = createPort('in', '入', 'many');
  a.ports = [out];
  b.ports = [input];
  g.nodes = [a, b];
  return { g, a, b, out: out.id, input: input.id };
}

describe('连接校验', () => {
  it('只能从输出口连到输入口', () => {
    const { g, a, b, input } = fixture();
    expect(validateConnection(g, { node: a.id, port: input }, { node: b.id, port: input })).toBe('端点不存在');
  });

  it('不能连到自己', () => {
    const g = emptyGraph();
    const a = createNode('A');
    const out = createPort('out');
    const input = createPort('in');
    a.ports = [out, input];
    g.nodes = [a];
    expect(validateConnection(g, { node: a.id, port: out.id }, { node: a.id, port: input.id })).toBe('不能连到自己');
  });

  it('单条输入口拒绝第二条线', () => {
    const g = emptyGraph();
    const a = createNode('A');
    const b = createNode('B');
    const out = createPort('out');
    const single = createPort('in', '入', 'one');
    a.ports = [out];
    b.ports = [single];
    g.nodes = [a, b];
    const first = createEdge({ node: a.id, port: out.id }, { node: b.id, port: single.id });
    g.edges = [first];
    expect(validateConnection(g, { node: a.id, port: out.id }, { node: b.id, port: single.id })).toBe('这条线已经存在');
  });

  it('重复连线会被拒绝', () => {
    const { g, a, b, out, input } = fixture();
    const edge = createEdge({ node: a.id, port: out }, { node: b.id, port: input });
    g.edges = [edge];
    expect(validateConnection(g, { node: a.id, port: out }, { node: b.id, port: input })).toBe('这条线已经存在');
  });

  it('合法连线返回 null', () => {
    const { g, a, b, out, input } = fixture();
    expect(validateConnection(g, { node: a.id, port: out }, { node: b.id, port: input })).toBeNull();
  });
});

describe('结构操作', () => {
  it('删端口把关联边标成孤儿，但边不丢', () => {
    const { g, a, b, out, input } = fixture();
    const edge = createEdge({ node: a.id, port: out }, { node: b.id, port: input });
    const withEdge = addEdgeOp(g, edge);
    const next = removePortOp(withEdge, a.id, out);
    expect(findPort(next, a.id, out)).toBeUndefined();
    expect(next.edges).toHaveLength(1);
    expect(orphanEdges(next)).toHaveLength(1);
  });

  it('删节点会连带删掉所有关联边', () => {
    const { g, a, b, out, input } = fixture();
    const edge = createEdge({ node: a.id, port: out }, { node: b.id, port: input });
    const withEdge = addEdgeOp(g, edge);
    const next = removeNodeOp(withEdge, a.id);
    expect(next.nodes.map((n) => n.id)).toEqual([b.id]);
    expect(next.edges).toHaveLength(0);
  });

  it('加节点和加端口不修改原图', () => {
    const g = emptyGraph();
    const node = createNode('X');
    const next = addNodeOp(g, node);
    expect(g.nodes).toHaveLength(0);
    expect(next.nodes).toHaveLength(1);
    const port = createPort('in');
    const afterPort = addPortOp(next, node.id, port);
    expect(afterPort.nodes[0].ports).toHaveLength(1);
    expect(next.nodes[0].ports).toHaveLength(0);
  });

  it('移动节点不修改原位置对象', () => {
    const { g, a } = fixture();
    const next = setNodePosOp(g, a.id, { x: 42, y: 43 });
    expect(g.nodes[0].pos).toEqual({ x: 0, y: 0 });
    expect(next.nodes[0].pos).toEqual({ x: 42, y: 43 });
  });
});

describe('批量操作与端口改接', () => {
  it('removePortEdgesOp 只删该端口上的边', () => {
    const { g, a, b, out, input } = fixture();
    const edge = createEdge({ node: a.id, port: out }, { node: b.id, port: input });
    const next = removePortEdgesOp(addEdgeOp(g, edge), a.id, out);
    expect(next.edges).toHaveLength(0);
  });

  it('replacePortInEdgesOp 改接端点并丢弃重复边', () => {
    const { g, a, b, input } = fixture();
    const o1 = createPort('out', '旧');
    const o2 = createPort('out', '新');
    a.ports = [o1, o2];
    const e1 = createEdge({ node: a.id, port: o1.id }, { node: b.id, port: input });
    const e2 = createEdge({ node: a.id, port: o2.id }, { node: b.id, port: input });
    const withEdges = addEdgeOp(addEdgeOp(g, e1), e2);
    const next = replacePortInEdgesOp(withEdges, a.id, o1.id, o2.id);
    expect(next.edges).toHaveLength(1);
    expect(next.edges[0].from.port).toBe(o2.id);
    expect(next.edges[0].to.port).toBe(input);
  });

  it('withKindDefaults 补齐属性与端口但不覆盖已有值', () => {
    const node = createNode('X');
    node.props = { value: { value: 42, type: 'number' } };
    const existing = createPort('in', '输入');
    node.ports = [existing];
    const next = withKindDefaults(node, {
      name: '物品',
      defaults: {
        value: { value: 0, type: 'number' },
        tier: { value: 1, type: 'number' },
      },
      ports: [
        { dir: 'in', label: '输入', capacity: 'many' },
        { dir: 'out', label: '输出', capacity: 'many' },
      ],
    });
    expect(next.props.value.value).toBe(42);
    expect(next.props.tier.value).toBe(1);
    expect(next.ports).toHaveLength(2);
    expect(next.ports.filter((p) => p.dir === 'in')).toHaveLength(1);
  });
});
