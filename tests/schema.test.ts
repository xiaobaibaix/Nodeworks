import { describe, expect, it } from 'vitest';
import { parseGraph } from '../src/model/schema';
import { sampleGraph } from '../src/model/sample';

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
});
