import { beforeEach, describe, expect, it } from 'vitest';
import { createNode, createPort } from '../src/model/ops';
import type { Graph } from '../src/model/types';
import { graphOf, useGraph } from '../src/store';
import { resetStore } from './helpers';

const empty = (): Graph => ({ version: 1, nodes: [], edges: [], kinds: {} });

beforeEach(() => resetStore());

describe('子图导航与路径化编辑', () => {
  it('新建子图单元后双击进入，层内编辑落到嵌套图', () => {
    useGraph.getState().addSubgraphNode({ x: 0, y: 0 });
    const root = useGraph.getState().graph;
    const node = root.nodes[0];
    expect(node.subgraph).toBeDefined();
    expect(node.ports.map((p) => p.dir).sort()).toEqual(['in', 'out']);

    useGraph.getState().enterSubgraph(node.id);
    expect(useGraph.getState().path).toEqual([node.id]);
    expect(graphOf(useGraph.getState())).toBe(node.subgraph);

    useGraph.getState().addNode({ x: 5, y: 5 });
    const state = useGraph.getState();
    expect(graphOf(state).nodes).toHaveLength(1);
    expect(state.graph.nodes[0].subgraph!.nodes).toHaveLength(1);
    expect(state.past).toHaveLength(2);

    useGraph.getState().undo();
    expect(useGraph.getState().graph.nodes[0].subgraph!.nodes).toHaveLength(0);
  });

  it('goToPath 回到上层并清空选择', () => {
    useGraph.getState().addSubgraphNode();
    const id = useGraph.getState().graph.nodes[0].id;
    useGraph.getState().enterSubgraph(id);
    useGraph.getState().addNode();
    useGraph.getState().select([graphOf(useGraph.getState()).nodes[0].id], null);

    useGraph.getState().goToPath(0);
    const state = useGraph.getState();
    expect(state.path).toEqual([]);
    expect(state.selectedNodes).toEqual([]);
    expect(graphOf(state).nodes).toHaveLength(1);
  });

  it('撤销把当前层删掉时会自动退回可用的父层', () => {
    useGraph.getState().addSubgraphNode();
    const outer = useGraph.getState().graph.nodes[0].id;
    useGraph.getState().enterSubgraph(outer);
    useGraph.getState().addSubgraphNode();
    const inner = graphOf(useGraph.getState()).nodes[0].id;
    useGraph.getState().enterSubgraph(inner);
    expect(useGraph.getState().path).toEqual([outer, inner]);

    useGraph.getState().undo(); // 撤销内层子图单元的创建
    expect(useGraph.getState().path).toEqual([outer]);
  });

  it('只读预览保留选择但取消待处理的端口删除', () => {
    useGraph.getState().addNode();
    const id = useGraph.getState().graph.nodes[0].id;
    useGraph.getState().select([id], null);
    useGraph.setState({ pendingPort: { nodeId: id, portId: 'p' } });
    useGraph.getState().setPreview(true);
    const state = useGraph.getState();
    expect(state.preview).toBe(true);
    expect(state.selectedNodes).toEqual([id]);
    expect(state.pendingPort).toBeNull();
  });
});

describe('子图端口映射', () => {
  it('映射到同向内部端口并写入历史', () => {
    const inner = createNode('内部');
    inner.ports = [createPort('out', '产物')];
    useGraph.getState().addSubgraphNode();
    const outerId = useGraph.getState().graph.nodes[0].id;
    useGraph.setState((s) => ({
      graph: {
        ...s.graph,
        nodes: s.graph.nodes.map((n) =>
          n.id === outerId ? { ...n, subgraph: { ...empty(), nodes: [inner] } } : n,
        ),
      },
    }));
    const outerOut = useGraph.getState().graph.nodes[0].ports.find((p) => p.dir === 'out')!;
    useGraph.getState().setSubgraphMap(outerId, outerOut.id, { node: inner.id, port: inner.ports[0].id });
    expect(useGraph.getState().graph.nodes[0].subgraphMap?.[outerOut.id]).toEqual({
      node: inner.id,
      port: inner.ports[0].id,
    });
    expect(useGraph.getState().past).toHaveLength(2); // 新建子图 + 映射
    useGraph.getState().undo();
    expect(useGraph.getState().graph.nodes[0].subgraphMap).toBeUndefined();
  });

  it('拒绝映射到反向内部端口并给出提示', () => {
    const inner = createNode('内部');
    inner.ports = [createPort('in', '入口')];
    useGraph.getState().addSubgraphNode();
    const outerId = useGraph.getState().graph.nodes[0].id;
    useGraph.setState((s) => ({
      graph: {
        ...s.graph,
        nodes: s.graph.nodes.map((n) =>
          n.id === outerId ? { ...n, subgraph: { ...empty(), nodes: [inner] } } : n,
        ),
      },
    }));
    const outerOut = useGraph.getState().graph.nodes[0].ports.find((p) => p.dir === 'out')!;
    useGraph.getState().setSubgraphMap(outerId, outerOut.id, { node: inner.id, port: inner.ports[0].id });
    expect(useGraph.getState().graph.nodes[0].subgraphMap).toBeUndefined();
    expect(useGraph.getState().toast).toContain('同方向');
    expect(useGraph.getState().past).toHaveLength(1); // 只有新建子图
  });
});
