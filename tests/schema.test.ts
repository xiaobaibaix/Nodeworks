import { describe, expect, it } from 'vitest';
import { parseGraph } from '../src/model/schema';
import { sampleGraph } from '../src/model/sample';
import { emptyGraph, createNode, createPort } from '../src/model/ops';

describe('图序列化', () => {
  it('示例图能往返序列化', () => {
    const source = sampleGraph();
    const parsed = parseGraph(JSON.parse(JSON.stringify(source)));
    expect(parsed).toEqual(source);
  });

  it('拒绝未知版本', () => {
    const bad = { ...sampleGraph(), version: 2 };
    expect(() => parseGraph(bad)).toThrow(/图数据不合法/);
  });

  it('拒绝坏端口', () => {
    const bad = sampleGraph();
    // @ts-expect-error 故意写坏
    bad.nodes[0].ports[0].dir = 'sideways';
    expect(() => parseGraph(bad)).toThrow(/图数据不合法/);
  });

  it('递归校验子图', () => {
    const inner = { ...emptyGraph(), nodes: [createNode('内层')] };
    const outer = { ...emptyGraph(), nodes: [{ ...createNode('外层'), subgraph: inner }] };
    expect(parseGraph(outer)).toEqual(outer);

    const broken = { ...outer, nodes: [{ ...outer.nodes[0], subgraph: { ...inner, nodes: [{ ...inner.nodes[0], title: 42 }] } }] };
    expect(() => parseGraph(broken)).toThrow(/nodes\.0\.subgraph\.nodes\.0\.title/);
  });

  it('子图端口映射必须指向存在的内部端点', () => {
    const innerPort = createPort('out', '产出');
    const inPort = createPort('in', '入口');
    const inner = { ...emptyGraph(), nodes: [{ ...createNode('内层'), ports: [innerPort, inPort] }] };
    const outerPort = createPort('out', '产出');
    const base = { ...createNode('外层'), ports: [outerPort], subgraph: inner };
    const good = {
      ...emptyGraph(),
      nodes: [{ ...base, subgraphMap: { [outerPort.id]: { node: inner.nodes[0].id, port: innerPort.id } } }],
    };
    expect(parseGraph(good)).toEqual(good);

    const missing = {
      ...emptyGraph(),
      nodes: [{ ...base, subgraphMap: { [outerPort.id]: { node: 'ghost', port: innerPort.id } } }],
    };
    expect(() => parseGraph(missing)).toThrow(/不存在的内部端点/);

    const wrongDir = {
      ...emptyGraph(),
      nodes: [{
        ...base,
        subgraphMap: { [outerPort.id]: { node: inner.nodes[0].id, port: inPort.id } },
      }],
    };
    expect(() => parseGraph(wrongDir)).toThrow(/方向不一致/);
  });
});
