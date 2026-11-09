import { beforeEach, describe, expect, it } from 'vitest';
import { createEdge, createNode, createPort } from '../src/model/ops';
import type { Graph } from '../src/model/types';
import { useGraph } from '../src/store';
import { resetStore } from './helpers';

function setGraph(graph: Graph): void {
  useGraph.setState({ graph });
}

beforeEach(() => resetStore());

describe('新节点与模板', () => {
  it('从 kind 模板新建会带上默认属性与端口', () => {
    setGraph({
      version: 1,
      nodes: [],
      edges: [],
      kinds: {
        recipe: {
          name: '配方',
          defaults: { cycle: { value: 1, type: 'number' } },
          ports: [{ dir: 'in', label: '原料', capacity: 'many' }],
        },
      },
    });
    useGraph.getState().addNode({ x: 10, y: 10 }, 'recipe');
    const { graph, past, selectedNodes } = useGraph.getState();
    const node = graph.nodes[0];
    expect(node.kind).toBe('recipe');
    expect(node.props.cycle.value).toBe(1);
    expect(node.ports).toHaveLength(1);
    expect(node.ports[0].label).toBe('原料');
    expect(past).toHaveLength(1);
    expect(selectedNodes).toEqual([node.id]);
  });

  it('撤销新建会删掉节点', () => {
    useGraph.getState().addNode({ x: 0, y: 0 });
    expect(useGraph.getState().graph.nodes).toHaveLength(1);
    useGraph.getState().undo();
    expect(useGraph.getState().graph.nodes).toHaveLength(0);
    useGraph.getState().redo();
    expect(useGraph.getState().graph.nodes).toHaveLength(1);
  });
});

describe('属性编辑合并历史', () => {
  it('500ms 内同字段连续编辑只留一条历史，撤销回到最初', () => {
    useGraph.getState().addNode({ x: 0, y: 0 });
    const id = useGraph.getState().graph.nodes[0].id;
    useGraph.getState().setProp(id, 'value', 1);
    useGraph.getState().setProp(id, 'value', 2);
    const state = useGraph.getState();
    expect(state.graph.nodes[0].props.value.value).toBe(2);
    expect(state.past).toHaveLength(2); // 新建 + 合并后的属性编辑
    useGraph.getState().undo();
    expect(useGraph.getState().graph.nodes[0].props.value).toBeUndefined();
  });
});

describe('删除端口的重连向导', () => {
  function fixture() {
    const a = createNode('A');
    const b = createNode('B');
    const out = createPort('out', '出');
    const input = createPort('in', '入');
    a.ports = [out];
    b.ports = [input];
    const edge = createEdge({ node: a.id, port: out.id }, { node: b.id, port: input.id });
    setGraph({ version: 1, nodes: [a, b], edges: [edge], kinds: {} });
    return { a, b, out, input, edge };
  }

  it('有连线时不直接删，先挂起重连向导', () => {
    const { a, out } = fixture();
    useGraph.getState().requestRemovePort(a.id, out.id);
    const state = useGraph.getState();
    expect(state.pendingPort).toEqual({ nodeId: a.id, portId: out.id });
    expect(state.graph.nodes[0].ports).toHaveLength(1);
    expect(state.past).toHaveLength(0);
  });

  it('新建同 label 端口并改接，撤销后恢复原端口与边', () => {
    const { a, out, input, edge } = fixture();
    useGraph.getState().requestRemovePort(a.id, out.id);
    useGraph.getState().confirmRemovePort({ kind: 'new' });
    const after = useGraph.getState();
    const node = after.graph.nodes.find((n) => n.id === a.id)!;
    expect(node.ports).toHaveLength(1);
    expect(node.ports[0].id).not.toBe(out.id);
    expect(node.ports[0].label).toBe('出');
    expect(after.graph.edges[0].from.port).toBe(node.ports[0].id);
    expect(after.graph.edges[0].to).toEqual(edge.to);
    expect(after.pendingPort).toBeNull();

    useGraph.getState().undo();
    const back = useGraph.getState().graph.nodes.find((n) => n.id === a.id)!;
    expect(back.ports.map((p) => p.id)).toEqual([out.id]);
    expect(useGraph.getState().graph.edges).toEqual([edge]);
    expect(input.id).toBe(edge.to.port);
  });

  it('改接到已有同向端口', () => {
    const { a, out } = fixture();
    const spare = createPort('out', '备用');
    useGraph.setState({
      graph: {
        ...useGraph.getState().graph,
        nodes: useGraph
          .getState()
          .graph.nodes.map((n) => (n.id === a.id ? { ...n, ports: [...n.ports, spare] } : n)),
      },
    });
    useGraph.getState().requestRemovePort(a.id, out.id);
    useGraph.getState().confirmRemovePort({ kind: 'rewire', portId: spare.id });
    const graph = useGraph.getState().graph;
    expect(graph.nodes.find((n) => n.id === a.id)!.ports.map((p) => p.id)).toEqual([spare.id]);
    expect(graph.edges[0].from.port).toBe(spare.id);
  });

  it('保留为孤儿边：端口没了，边还在但标 orphan', () => {
    const { a, out } = fixture();
    useGraph.getState().requestRemovePort(a.id, out.id);
    useGraph.getState().confirmRemovePort({ kind: 'orphan' });
    const graph = useGraph.getState().graph;
    expect(graph.nodes.find((n) => n.id === a.id)!.ports).toHaveLength(0);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].orphan).toBe(true);
  });
});

describe('多选、删除与复制粘贴', () => {
  it('删除多个节点只记一条历史，撤销全部回来', () => {
    const a = createNode('A');
    const b = createNode('B');
    const out = createPort('out');
    const input = createPort('in');
    a.ports = [out];
    b.ports = [input];
    setGraph({
      version: 1,
      nodes: [a, b],
      edges: [createEdge({ node: a.id, port: out.id }, { node: b.id, port: input.id })],
      kinds: {},
    });
    useGraph.getState().removeNodes([a.id, b.id]);
    expect(useGraph.getState().graph.nodes).toHaveLength(0);
    expect(useGraph.getState().past).toHaveLength(1);
    useGraph.getState().undo();
    expect(useGraph.getState().graph.nodes).toHaveLength(2);
    expect(useGraph.getState().graph.edges).toHaveLength(1);
  });

  it('粘贴产生新 id、位置偏移，并选中新节点', () => {
    const a = createNode('A', { x: 0, y: 0 });
    const b = createNode('B', { x: 100, y: 0 });
    const out = createPort('out');
    const input = createPort('in');
    a.ports = [out];
    b.ports = [input];
    setGraph({
      version: 1,
      nodes: [a, b],
      edges: [createEdge({ node: a.id, port: out.id }, { node: b.id, port: input.id })],
      kinds: {},
    });
    useGraph.getState().select([a.id, b.id], null);
    useGraph.getState().copy();
    useGraph.getState().paste();
    const state = useGraph.getState();
    expect(state.graph.nodes).toHaveLength(4);
    expect(state.graph.edges).toHaveLength(2);
    const pasted = state.graph.nodes.slice(2);
    expect(pasted[0].pos).toEqual({ x: 32, y: 32 });
    expect(state.selectedNodes).toEqual(pasted.map((n) => n.id));
  });

  it('多节点移动生成一条历史，撤销回到原位', () => {
    const a = createNode('A', { x: 0, y: 0 });
    const b = createNode('B', { x: 10, y: 10 });
    setGraph({ version: 1, nodes: [a, b], edges: [], kinds: {} });
    useGraph.getState().moveNodes({ [a.id]: { x: 50, y: 50 }, [b.id]: { x: 60, y: 60 } }, '对齐');
    expect(useGraph.getState().past).toHaveLength(1);
    useGraph.getState().undo();
    expect(useGraph.getState().graph.nodes[0].pos).toEqual({ x: 0, y: 0 });
    expect(useGraph.getState().graph.nodes[1].pos).toEqual({ x: 10, y: 10 });
  });
});
