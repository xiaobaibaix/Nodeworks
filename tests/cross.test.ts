import { beforeEach, describe, expect, it } from 'vitest';
import { crossTargets, planCrossLink } from '../src/model/cross';
import type { Graph, UnitNode } from '../src/model/types';
import { useGraph } from '../src/store';
import { resetStore } from './helpers';

function node(id: string, title: string, ports: UnitNode['ports'], subgraph?: Graph): UnitNode {
  return { id, title, props: {}, ports, pos: { x: 0, y: 0 }, subgraph };
}

function twoSubgraphs(): Graph {
  return {
    version: 1,
    kinds: {},
    edges: [],
    nodes: [
      node('a', '甲子图', [], {
        version: 1,
        kinds: {},
        edges: [],
        nodes: [node('a1', '甲一', [{ id: 'ao', dir: 'out', label: '出', capacity: 'one' }])],
      }),
      node('b', '乙子图', [], {
        version: 1,
        kinds: {},
        edges: [],
        nodes: [
          node('b1', '乙一', [{ id: 'bi', dir: 'in', label: '入', capacity: 'many' }]),
          node('b2', '乙二', [{ id: 'bo', dir: 'out', label: '出', capacity: 'one' }]),
        ],
      }),
    ],
  };
}

beforeEach(() => resetStore());

describe('跨子图连线模型', () => {
  it('只列出其它子图内部的输入端口', () => {
    const list = crossTargets(twoSubgraphs(), 'a');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ hostId: 'b', nodeId: 'b1', portId: 'bi', portLabel: '入' });
  });

  it('planCrossLink 在两边建外层端口、写映射并连一条根层边', () => {
    const root = twoSubgraphs();
    const target = crossTargets(root, 'a')[0];
    const plan = planCrossLink(root, 'a', { node: 'a1', port: 'ao' }, target);
    expect(plan).not.toBeNull();
    if (!plan) return;
    const a = plan.graph.nodes.find((n) => n.id === 'a')!;
    const b = plan.graph.nodes.find((n) => n.id === 'b')!;
    expect(a.ports).toHaveLength(1);
    expect(a.subgraphMap?.[a.ports[0].id]).toEqual({ node: 'a1', port: 'ao' });
    expect(b.ports).toHaveLength(1);
    expect(b.subgraphMap?.[b.ports[0].id]).toEqual({ node: 'b1', port: 'bi' });
    expect(plan.graph.edges).toHaveLength(1);
    expect(plan.graph.edges[0]).toMatchObject({
      from: { node: 'a', port: a.ports[0].id },
      to: { node: 'b', port: b.ports[0].id },
    });
    // 源端口不存在 / 方向不是 out 时拒绝
    expect(planCrossLink(root, 'a', { node: 'a1', port: 'bi' }, target)).toBeNull();
  });

  it('store 动作只记一条历史，撤销后端口/映射/边全部还原', () => {
    useGraph.setState({ graph: twoSubgraphs(), path: ['a'] });
    const target = crossTargets(twoSubgraphs(), 'a')[0];
    useGraph.getState().linkCrossSubgraph({ node: 'a1', port: 'ao' }, target);
    const after = useGraph.getState();
    expect(after.graph.edges).toHaveLength(1);
    expect(after.past).toHaveLength(1);
    after.undo();
    const back = useGraph.getState();
    expect(back.graph.edges).toHaveLength(0);
    expect(back.graph.nodes.find((n) => n.id === 'a')?.ports).toHaveLength(0);
    expect(back.graph.nodes.find((n) => n.id === 'b')?.ports).toHaveLength(0);
  });
});
