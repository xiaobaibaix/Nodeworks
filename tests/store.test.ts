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

  it('重复连线不会新增边，并选中已有的那条', () => {
    const a = createNode('A', { x: 0, y: 0 });
    const out = createPort('out', '产物');
    a.ports.push(out);
    const b = createNode('B', { x: 10, y: 0 });
    const input = createPort('in', '原料');
    b.ports.push(input);
    const edge = createEdge({ node: a.id, port: out.id }, { node: b.id, port: input.id });
    setGraph({ version: 1, nodes: [a, b], edges: [edge], kinds: {} });
    useGraph.getState().connect({ node: a.id, port: out.id }, { node: b.id, port: input.id });
    const state = useGraph.getState();
    expect(state.graph.edges).toHaveLength(1);
    expect(state.past).toHaveLength(0);
    expect(state.selectedEdge).toBe(edge.id);
    expect(state.selectedNodes).toEqual([]);
    expect(state.toast).toContain('已选中该连线');
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

describe('表格与影响面状态', () => {
  const twoNodes = (): Graph => ({
    version: 1 as const,
    edges: [],
    kinds: {},
    nodes: [
      { id: 'a', title: 'A', props: { value: { value: 1, type: 'number' } }, ports: [], pos: { x: 0, y: 0 } },
      { id: 'b', title: 'B', props: {}, ports: [], pos: { x: 100, y: 0 } },
    ],
  });

  it('批量改同一属性只记一条历史，撤销恢复旧值与缺失', () => {
    setGraph(twoNodes());
    useGraph.getState().setPropMany(['a', 'b'], 'value', 'number', 5);
    const after = useGraph.getState();
    expect(after.graph.nodes[0].props.value).toEqual({ value: 5, type: 'number' });
    expect(after.graph.nodes[1].props.value).toEqual({ value: 5, type: 'number' });
    expect(after.past).toHaveLength(1);
    expect(after.toast).toContain('已更新 2');

    after.undo();
    const undone = useGraph.getState().graph;
    expect(undone.nodes[0].props.value).toEqual({ value: 1, type: 'number' });
    expect(undone.nodes[1].props.value).toBeUndefined();
  });

  it('批量改属性会保留旧 meta 的其他字段', () => {
    setGraph({
      ...twoNodes(),
      nodes: [
        {
          id: 'a',
          title: 'A',
          props: { value: { value: 1, type: 'number', unit: '件' } },
          ports: [],
          pos: { x: 0, y: 0 },
        },
      ],
    });
    useGraph.getState().setPropMany(['a'], 'value', 'number', 2);
    expect(useGraph.getState().graph.nodes[0].props.value).toMatchObject({ value: 2, unit: '件' });
  });

  it('视图、焦点与列显隐', () => {
    const store = useGraph.getState();
    store.setView('table');
    expect(useGraph.getState().view).toBe('table');
    store.setView('graph');
    expect(useGraph.getState().view).toBe('graph');

    store.setFocus('n1');
    expect(useGraph.getState().focus).toBe('n1');
    store.setFocus(null);
    expect(useGraph.getState().focus).toBeNull();

    store.toggleColumn('prop:value');
    expect(useGraph.getState().hiddenColumns).toEqual(['prop:value']);
    store.toggleColumn('prop:value');
    expect(useGraph.getState().hiddenColumns).toEqual([]);
    store.toggleColumn('title');
    store.resetColumns();
    expect(useGraph.getState().hiddenColumns).toEqual([]);
  });

  it('表头排序同列切换升降序，换列重置为升序', () => {
    const store = useGraph.getState();
    store.setTableSort('prop:value');
    expect(useGraph.getState().tableSort).toEqual({ key: 'prop:value', dir: 'asc' });
    store.setTableSort('prop:value');
    expect(useGraph.getState().tableSort).toEqual({ key: 'prop:value', dir: 'desc' });
    store.setTableSort('title');
    expect(useGraph.getState().tableSort).toEqual({ key: 'title', dir: 'asc' });
    store.setTableSort(null);
    expect(useGraph.getState().tableSort).toBeNull();
  });

  it('影响面深度夹在 1..5', () => {
    const store = useGraph.getState();
    store.setImpactDepth(9);
    expect(useGraph.getState().impactDepth).toBe(5);
    store.setImpactDepth(0);
    expect(useGraph.getState().impactDepth).toBe(1);
    store.setImpactDepth(2.7);
    expect(useGraph.getState().impactDepth).toBe(2);
  });
});

describe('自动布局', () => {
  it('一次提交，撤销回到原坐标', () => {
    const a = { ...createNode('A', { x: 500, y: 500 }), id: 'A' };
    const b = { ...createNode('B', { x: 520, y: 520 }), id: 'B' };
    setGraph({
      version: 1,
      kinds: {},
      nodes: [a, b],
      edges: [createEdge({ node: 'A', port: 'p_out' }, { node: 'B', port: 'p_in' })],
    });
    useGraph.getState().autoLayout();
    const laid = useGraph.getState();
    expect(laid.past).toHaveLength(1);
    expect(laid.toast).toContain('已自动布局');
    expect(laid.graph.nodes.find((n) => n.id === 'A')?.pos).not.toEqual({ x: 500, y: 500 });
    useGraph.getState().undo();
    expect(useGraph.getState().graph.nodes.find((n) => n.id === 'A')?.pos).toEqual({ x: 500, y: 500 });
  });
});

describe('版本快照', () => {
  function tiny(): Graph {
    const a = { ...createNode('A', { x: 0, y: 0 }), id: 'A' };
    const b = { ...createNode('B', { x: 300, y: 0 }), id: 'B' };
    return {
      version: 1,
      kinds: {},
      nodes: [a, b],
      edges: [createEdge({ node: 'A', port: 'p_out' }, { node: 'B', port: 'p_in' })],
    };
  }

  it('保存、回滚、撤销', () => {
    setGraph(tiny());
    useGraph.getState().takeSnapshot('基线');
    const { snapshots } = useGraph.getState();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].label).toBe('基线');
    expect(useGraph.getState().toast).toContain('已保存快照');

    useGraph.getState().addNode({ x: 10, y: 10 });
    expect(useGraph.getState().graph.nodes).toHaveLength(3);
    const historyBefore = useGraph.getState().past.length;

    useGraph.getState().restoreSnapshot(snapshots[0].id);
    const restored = useGraph.getState();
    expect(restored.graph.nodes).toHaveLength(2);
    expect(restored.past).toHaveLength(historyBefore + 1);
    expect(restored.past[restored.past.length - 1].label).toContain('回滚到');
    expect(restored.snapshotOpen).toBe(false);
    expect(restored.toast).toContain('已回滚');

    useGraph.getState().undo();
    expect(useGraph.getState().graph.nodes).toHaveLength(3);
  });

  it('回滚时退出子图层并清空选择', () => {
    const g = tiny();
    const parent = { ...createNode('父', { x: 0, y: 0 }), id: 'P' };
    parent.subgraph = { version: 1, kinds: {}, nodes: [], edges: [] };
    g.nodes.push(parent);
    setGraph(g);
    useGraph.getState().takeSnapshot('带子图');
    useGraph.getState().enterSubgraph('P');
    useGraph.getState().select(['x'], null);
    expect(useGraph.getState().path).toEqual(['P']);

    useGraph.getState().restoreSnapshot(useGraph.getState().snapshots[0].id);
    const state = useGraph.getState();
    expect(state.path).toEqual([]);
    expect(state.selectedNodes).toEqual([]);
    expect(state.graph.nodes).toHaveLength(3);
  });

  it('删除快照', () => {
    setGraph(tiny());
    useGraph.getState().takeSnapshot('a');
    const id = useGraph.getState().snapshots[0].id;
    useGraph.getState().deleteSnapshot(id);
    expect(useGraph.getState().snapshots).toHaveLength(0);
    expect(useGraph.getState().toast).toContain('已删除快照');
  });

  it('默认名称带时间，最多保留 20 份', () => {
    setGraph(tiny());
    for (let i = 0; i < 25; i += 1) useGraph.getState().takeSnapshot();
    const { snapshots } = useGraph.getState();
    expect(snapshots).toHaveLength(20);
    expect(snapshots[0].label).toContain('快照');
  });
});

describe('多图容器', () => {
  function makeGraph(title: string): Graph {
    return {
      version: 1,
      kinds: {},
      nodes: [{ ...createNode(title, { x: 0, y: 0 }), id: 'n1' }],
      edges: [],
    };
  }

  function seedProject(): void {
    const a = makeGraph('A');
    const b = makeGraph('B');
    useGraph.setState({
      graph: a,
      projectGraphs: [
        { id: 'a', name: '图 A', graph: a },
        { id: 'b', name: '图 B', graph: b },
      ],
      activeGraphId: 'a',
      past: [],
      future: [],
    });
  }

  it('切换图会重置历史与选择', () => {
    seedProject();
    useGraph.getState().addNode({ x: 5, y: 5 });
    useGraph.getState().select(['n1'], null);
    expect(useGraph.getState().past).toHaveLength(1);

    useGraph.getState().switchGraph('b');
    const state = useGraph.getState();
    expect(state.graph.nodes[0].title).toBe('B');
    expect(state.past).toHaveLength(0);
    expect(state.selectedNodes).toEqual([]);
    expect(state.toast).toContain('图 B');

    useGraph.getState().switchGraph('a');
    expect(useGraph.getState().graph.nodes).toHaveLength(2);
  });

  it('新建图会带上并共享 kinds', () => {
    seedProject();
    const withKind: Graph = {
      ...makeGraph('A'),
      kinds: { item: { name: '物品' } },
    };
    useGraph.setState({ graph: withKind });
    useGraph.getState().addGraph('新图');
    const state = useGraph.getState();
    expect(state.projectGraphs).toHaveLength(3);
    const added = state.projectGraphs.find((pg) => pg.id === state.activeGraphId);
    expect(added?.name).toBe('新图');
    expect(added?.graph.kinds.item).toEqual({ name: '物品' });
    expect(state.graph.nodes).toHaveLength(0);
  });

  it('重命名与删除当前图', () => {
    seedProject();
    useGraph.getState().renameGraph('钛生产线');
    expect(useGraph.getState().projectGraphs[0].name).toBe('钛生产线');
    useGraph.getState().removeGraph();
    const state = useGraph.getState();
    expect(state.projectGraphs).toHaveLength(1);
    expect(state.activeGraphId).toBe('b');
    expect(state.graph.nodes[0].title).toBe('B');
  });
});
