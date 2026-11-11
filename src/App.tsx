import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, useNodesInitialized, useReactFlow,
  type Connection, type Edge, type EdgeChange, type Node, type NodeChange,
} from '@xyflow/react';
import BoundaryNode from './components/BoundaryNode';
import Breadcrumbs from './components/Breadcrumbs';
import CommandPalette from './components/CommandPalette';
import CrossLinkDialog from './components/CrossLinkDialog';
import ExportDialog from './components/ExportDialog';
import ImpactPanel from './components/ImpactPanel';
import Inspector from './components/Inspector';
import MultiBar from './components/MultiBar';
import OrphanBanner from './components/OrphanBanner';
import ReconnectWizard from './components/ReconnectWizard';
import Sidebar from './components/Sidebar';
import SnapshotDialog from './components/SnapshotDialog';
import TableView from './components/TableView';
import Toolbar from './components/Toolbar';
import UnitNode from './components/UnitNode';
import { isFiltering, nodeMatches, visibleNodes } from './model/query';
import { impactOf } from './model/impact';
import { graphAtPath } from './model/path';
import type { Endpoint } from './model/types';
import { orientEdge } from './model/ops';
import { downloadGraph } from './persistence';
import { graphOf, useCurrentGraph, useGraph } from './store';

const nodeTypes = { unit: UnitNode, boundary: BoundaryNode };

/** 子图层里代表“外层端口”的合成节点：只做可视与接线，不写进图数据。 */
const OUTER_IN = '__outer_in';
const OUTER_OUT = '__outer_out';
/** 子图层里“连接到其它子图”的落点合成节点。 */
const CROSS_ID = '__cross__';
const CROSS_IN = '__cross_in';
const MAP_EDGE_STYLE = { stroke: '#7c8798', strokeDasharray: '4 3' };

type Pos = { x: number; y: number };

function Canvas() {
  const graph = useCurrentGraph();
  const filter = useGraph((s) => s.filter);
  const selectedNodes = useGraph((s) => s.selectedNodes);
  const selectedEdge = useGraph((s) => s.selectedEdge);
  const select = useGraph((s) => s.select);
  const connect = useGraph((s) => s.connect);
  const silentMoveMany = useGraph((s) => s.silentMoveMany);
  const commitMoveMany = useGraph((s) => s.commitMoveMany);
  const removeNodes = useGraph((s) => s.removeNodes);
  const removeEdge = useGraph((s) => s.removeEdge);
  const preview = useGraph((s) => s.preview);
  const enterSubgraph = useGraph((s) => s.enterSubgraph);
  const path = useGraph((s) => s.path);
  const rootGraph = useGraph((s) => s.graph);
  const impactOn = useGraph((s) => s.impactOn);
  const impactDepth = useGraph((s) => s.impactDepth);
  const focus = useGraph((s) => s.focus);
  const setFocus = useGraph((s) => s.setFocus);
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const didFit = useRef(false);

  const [crossSource, setCrossSource] = useState<Endpoint | null>(null);
  const [crossPos, setCrossPos] = useState<Pos | null>(null);
  const silentMoveBoundary = useGraph((s) => s.silentMoveBoundary);
  const commitMoveBoundary = useGraph((s) => s.commitMoveBoundary);
  const dragFrom = useRef<Record<string, Pos>>({});
  const dragAnchor = useRef<string | null>(null);
  // 受控 nodes 每次重渲染都会重新 adopt；React Flow 在 adopt 时用 userNode.measured 覆盖内部测量，
  // 不带上 measured 就会把节点打回“未测量”，边会短暂消失。这里把最近一次测到的尺寸记下来带回。
  const measured = useRef<Record<string, { width: number; height: number }>>({});
  const [measuredVersion, bumpMeasured] = useReducer((n: number) => n + 1, 0);

  const visible = useMemo(() => visibleNodes(graph, filter), [graph, filter]);
  const visibleIds = useMemo(() => new Set(visible.map((n) => n.id)), [visible]);
  const filtering = isFiltering(filter);
  const needle = filter.query.trim();
  const matchIds = useMemo(
    () => new Set(graph.nodes.filter((n) => nodeMatches(n, needle)).map((n) => n.id)),
    [graph.nodes, needle],
  );
  const impact = useMemo(
    () => (impactOn && selectedNodes.length === 1 ? impactOf(graph, selectedNodes[0], impactDepth) : null),
    [impactOn, selectedNodes, impactDepth, graph],
  );
  const impactNodes = useMemo(() => new Set(impact?.nodes ?? []), [impact]);
  const impactEdges = useMemo(() => new Set(impact?.edges ?? []), [impact]);

  useEffect(() => {
    if (!nodesInitialized || didFit.current || graph.nodes.length === 0) return;
    didFit.current = true;
    void fitView({ padding: 0.25, duration: 200 });
  }, [nodesInitialized, fitView, graph.nodes.length]);

  const lastPath = useRef(path.join('/'));
  useEffect(() => {
    const key = path.join('/');
    if (key === lastPath.current) return;
    lastPath.current = key;
    if (!nodesInitialized) return;
    const timer = setTimeout(() => void fitView({ padding: 0.22, duration: 250, maxZoom: 1.6 }), 50);
    return () => clearTimeout(timer);
  }, [path, nodesInitialized, fitView]);

  useEffect(() => {
    setCrossPos(null);
  }, [path]);

  useEffect(() => {
    if (!focus) return;
    const exists = graph.nodes.some((n) => n.id === focus);
    setFocus(null);
    if (!exists) return;
    void fitView({ nodes: [{ id: focus }], duration: 300, maxZoom: 1.15, padding: 2.2 });
  }, [focus, graph.nodes, fitView, setFocus]);

  // 当前层所属的子图节点（用于在内部画出“外层端口”）。
  const parent = useMemo(() => {
    if (!path.length) return null;
    const parentGraph = graphAtPath(rootGraph, path.slice(0, -1));
    return parentGraph?.nodes.find((n) => n.id === path[path.length - 1]) ?? null;
  }, [path, rootGraph]);

  const nodes: Node[] = useMemo(() => {
    const list: Node[] = graph.nodes.map((n) => ({
      id: n.id,
      type: 'unit',
      position: n.pos,
      ...(measured.current[n.id] ? { measured: measured.current[n.id] } : {}),
      selected: selectedNodes.includes(n.id),
      hidden: filtering && !visibleIds.has(n.id),
      data: {
        node: n,
        dimmed: (Boolean(needle) && !matchIds.has(n.id)) || (impact ? !impactNodes.has(n.id) : false),
        matched: Boolean(needle) && matchIds.has(n.id),
        impact: Boolean(impact && impactNodes.has(n.id)),
      },
    }));
    if (parent) {
      const xs = graph.nodes.map((n) => n.pos.x);
      const ys = graph.nodes.map((n) => n.pos.y);
      const minX = xs.length ? Math.min(...xs) : 0;
      const maxX = xs.length ? Math.max(...xs) : 240;
      const midY = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
      const mapped = Object.keys(parent.subgraphMap ?? {});
      const outer = (id: string, side: 'in' | 'out', x: number): Node => ({
        id,
        type: 'boundary',
        position: parent.boundaryPos?.[side] ?? { x, y: midY },
        draggable: !preview,
        selectable: false,
        deletable: false,
        connectable: !preview,
        data: {
          side,
          title: parent.title,
          ports: parent.ports.filter((p) => (side === 'in' ? p.dir === 'in' : p.dir === 'out')),
          mapped,
        },
      });
      list.push(outer(OUTER_IN, 'in', minX - 280));
      list.push(outer(OUTER_OUT, 'out', maxX + 90));
      if (path.length === 1 && !preview) {
        list.push({
          id: CROSS_ID,
          type: 'unit',
          position: crossPos ?? { x: maxX + 360, y: midY },
          draggable: !preview,
          selectable: false,
          deletable: false,
          connectable: true,
          data: {
            node: {
              id: CROSS_ID,
              title: '连接到其它子图…',
              props: {},
              ports: [{ id: CROSS_IN, dir: 'in' as const, label: '拖到这里', capacity: 'one' as const }],
              pos: { x: maxX + 360, y: midY },
            },
            cross: true,
          },
        });
      }
    }
    return list;
  }, [graph.nodes, selectedNodes, filtering, visibleIds, needle, matchIds, impact, impactNodes, measuredVersion, parent, preview, crossPos]);

  const edges: Edge[] = useMemo(() => {
    const list: Edge[] = [];
    for (const e of graph.edges) {
      if (e.orphan) continue;
      // 反着存的边（in→out）React Flow 找不到 source handle，会整条不画；先摆正再渲染。
      const o = orientEdge(graph, e);
      if (!o) continue;
      list.push({
        id: e.id,
        source: o.from.node,
        target: o.to.node,
        sourceHandle: o.from.port,
        targetHandle: o.to.port,
        label: e.label,
        type: 'smoothstep',
        animated: false,
        selected: selectedEdge === e.id,
        hidden: filtering && (!visibleIds.has(e.from.node) || !visibleIds.has(e.to.node)),
        ...(impact
          ? { style: impactEdges.has(e.id) ? { stroke: '#f0a25c', strokeWidth: 2 } : { opacity: 0.12 } }
          : {}),
      });
    }
    if (parent) {
      // 映射边：外层输入 → 内部消费口；内部产出 → 外层输出。虚线，不可选/删。
      for (const [portId, ep] of Object.entries(parent.subgraphMap ?? {})) {
        const outerPort = parent.ports.find((p) => p.id === portId);
        const innerPort = parent.subgraph?.nodes.find((n) => n.id === ep.node)?.ports.find((p) => p.id === ep.port);
        if (!outerPort || !innerPort) continue;
        if (filtering && !visibleIds.has(ep.node)) continue;
        list.push(
          outerPort.dir === 'in'
            ? {
                id: `__map:${portId}`,
                source: OUTER_IN,
                sourceHandle: portId,
                target: ep.node,
                targetHandle: ep.port,
                type: 'smoothstep',
                style: MAP_EDGE_STYLE,
                selectable: false,
                deletable: false,
              }
            : {
                id: `__map:${portId}`,
                source: ep.node,
                sourceHandle: ep.port,
                target: OUTER_OUT,
                targetHandle: portId,
                type: 'smoothstep',
                style: MAP_EDGE_STYLE,
                selectable: false,
                deletable: false,
              },
        );
      }
    }
    return list;
  }, [graph, selectedEdge, filtering, visibleIds, impact, impactEdges, parent, preview]);

  const setOuterMap = useGraph((s) => s.setOuterMap);
  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || !c.sourceHandle || !c.targetHandle) return;
      // 从外层端口代理接线 = 建立“外层端口 ↔ 内部端口”的映射，不新增本层边。
      if (c.source === OUTER_IN) {
        setOuterMap(c.sourceHandle, { node: c.target, port: c.targetHandle });
        return;
      }
      if (c.target === OUTER_OUT) {
        setOuterMap(c.targetHandle, { node: c.source, port: c.sourceHandle });
        return;
      }
      if (c.target === CROSS_ID) {
        setCrossSource({ node: c.source, port: c.sourceHandle });
        return;
      }
      connect({ node: c.source, port: c.sourceHandle }, { node: c.target, port: c.targetHandle });
    },
    [connect, setOuterMap],
  );

  const onNodeDragStart = useCallback((_: unknown, node: Node) => {
    // 合成节点（外层端口代理 / 跨子图落点）不属于当前层图，单独记录拖拽起点。
    if (node.id === CROSS_ID) {
      dragAnchor.current = null;
      return;
    }
    if (node.id === OUTER_IN || node.id === OUTER_OUT) {
      dragFrom.current = { [node.id]: { ...node.position } };
      dragAnchor.current = node.id;
      return;
    }
    const state = useGraph.getState();
    const ids = state.selectedNodes.includes(node.id) ? state.selectedNodes : [node.id];
    const from: Record<string, Pos> = {};
    for (const id of ids) {
      const model = graphOf(state).nodes.find((n) => n.id === id);
      if (model) from[id] = { ...model.pos };
    }
    dragFrom.current = from;
    dragAnchor.current = node.id;
  }, []);

  const onNodeDrag = useCallback(
    (_: unknown, node: Node) => {
      if (node.id === CROSS_ID) {
        setCrossPos({ x: node.position.x, y: node.position.y });
        return;
      }
      if (node.id === OUTER_IN || node.id === OUTER_OUT) {
        silentMoveBoundary(node.id === OUTER_IN ? 'in' : 'out', node.position);
        return;
      }
      const from = dragFrom.current;
      const anchor = dragAnchor.current;
      if (!anchor || !from[anchor]) return;
      const dx = node.position.x - from[anchor].x;
      const dy = node.position.y - from[anchor].y;
      const ids = Object.keys(from);
      if (ids.length <= 1) {
        silentMoveMany({ [node.id]: node.position });
        return;
      }
      const moves: Record<string, Pos> = {};
      for (const id of ids) moves[id] = { x: from[id].x + dx, y: from[id].y + dy };
      silentMoveMany(moves);
    },
    [silentMoveMany, silentMoveBoundary],
  );

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      if (node.id === CROSS_ID) return;
      if (node.id === OUTER_IN || node.id === OUTER_OUT) {
        const from = dragFrom.current[node.id];
        dragFrom.current = {};
        dragAnchor.current = null;
        if (from) commitMoveBoundary(node.id === OUTER_IN ? 'in' : 'out', from, node.position);
        return;
      }
      const from = dragFrom.current;
      const anchor = dragAnchor.current;
      dragFrom.current = {};
      dragAnchor.current = null;
      if (!anchor || !from[anchor]) return;
      const dx = node.position.x - from[anchor].x;
      const dy = node.position.y - from[anchor].y;
      const to: Record<string, Pos> = {};
      for (const id of Object.keys(from)) to[id] = { x: from[id].x + dx, y: from[id].y + dy };
      commitMoveMany(from, to);
    },
    [commitMoveMany, commitMoveBoundary],
  );

  // React Flow 受控模式下 select 变更只会通过 onNodesChange/onEdgesChange 发出；
  // 不接这两个回调，点击/框选就完全不会选中任何东西。
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      let learned = false;
      for (const c of changes) {
        if (c.type === 'dimensions' && c.dimensions) {
          const prev = measured.current[c.id];
          if (!prev || prev.width !== c.dimensions.width || prev.height !== c.dimensions.height) {
            measured.current[c.id] = { ...c.dimensions };
            learned = true;
          }
        }
      }
      if (learned) bumpMeasured();
      const selections = changes.filter(
        (c): c is Extract<NodeChange, { type: 'select' }> => c.type === 'select',
      );
      if (!selections.length) return;
      const state = useGraph.getState();
      const next = new Set(state.selectedNodes);
      for (const c of selections) {
        if (c.selected) next.add(c.id);
        else next.delete(c.id);
      }
      const ids = [...next];
      select(ids, ids.length ? null : state.selectedEdge);
    },
    [select],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const selections = changes.filter(
        (c): c is Extract<EdgeChange, { type: 'select' }> => c.type === 'select',
      );
      if (!selections.length) return;
      const chosen = selections.find((c) => c.selected);
      if (chosen) {
        select([], chosen.id);
        return;
      }
      const current = useGraph.getState().selectedEdge;
      if (current && selections.some((c) => c.id === current)) select([], null);
    },
    [select],
  );

  return (
    <>
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      colorMode="dark"
      onConnect={onConnect}
      connectionRadius={44}
      onNodeDragStart={onNodeDragStart}
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onDelete={({ nodes: gone, edges: alsoGone }) => {
        if (preview) return;
        if (!gone.length) {
          alsoGone.forEach((e) => removeEdge(e.id));
          return;
        }
        const doomed = new Set(gone.map((n) => n.id));
        // React Flow 会先单独回调关联边，再回调节点；只接 onDelete 才能把一次删除合并成一条历史。
        const standalone = alsoGone.filter((e) => !doomed.has(e.source) && !doomed.has(e.target));
        removeNodes([...doomed]);
        standalone.forEach((e) => removeEdge(e.id));
      }}
      minZoom={0.15}
      maxZoom={2.5}
      nodesDraggable={!preview}
      nodesConnectable={!preview}
      elementsSelectable
      onNodeDoubleClick={(_, node) => {
        const inner = (node.data as { node?: { subgraph?: unknown } } | undefined)?.node?.subgraph;
        if (inner) enterSubgraph(node.id);
      }}
      deleteKeyCode={preview ? null : ['Backspace', 'Delete']}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={24} size={1} />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => {
          const kind = (n.data as { node?: { kind?: string } } | undefined)?.node?.kind ?? '';
          return graph.kinds[kind]?.color ?? '#4b5563';
        }}
        maskColor="rgba(9, 11, 14, 0.72)"
      />
    </ReactFlow>
    <CrossLinkDialog source={crossSource} onClose={() => setCrossSource(null)} />
    </>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const graph = useGraph((s) => s.graph);
  const view = useGraph((s) => s.view);

  useEffect(() => {
    useGraph.getState().boot();
    setReady(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => useGraph.getState().saveToCache(), 250);
    return () => clearTimeout(timer);
  }, [graph]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const typing = Boolean(
        target && target.closest('input, textarea, select, [contenteditable="true"]'),
      );
      const key = e.key.toLowerCase();
      const state = useGraph.getState();

      if (mod && key === 'k') {
        e.preventDefault();
        state.togglePalette();
        return;
      }
      if (mod && key === 's') {
        e.preventDefault();
        downloadGraph(state.graph);
        return;
      }
      if (mod && e.shiftKey && key === 'l') {
        e.preventDefault();
        if (!state.preview) state.autoLayout();
        return;
      }
      if (e.key === 'Escape') {
        if (state.paletteOpen) {
          state.togglePalette(false);
        } else if (state.snapshotOpen) {
          state.openSnapshots(false);
        } else if (state.exportOpen) {
          state.setExportOpen(false);
        } else if (state.pendingPort) {
          state.cancelRemovePort();
        } else if (!typing) {
          state.select([], null);
        }
        return;
      }
      if (typing) return;
      if (state.preview) return; // 预览只读：不响应撤销/复制/粘贴等写操作
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) state.redo();
        else state.undo();
        return;
      }
      if (mod && key === 'c') {
        e.preventDefault();
        state.copy();
        return;
      }
      if (mod && key === 'v') {
        e.preventDefault();
        state.paste();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <ReactFlowProvider>
      <div className="app">
        <Toolbar />
        <div className="body">
          <Sidebar />
          <div className={`canvas${view === 'table' ? ' table-canvas' : ''}`}>
            {view === 'table' ? <TableView /> : ready && <Canvas />}
            {view === 'graph' && <Breadcrumbs />}
            {view === 'graph' && <MultiBar />}
            {view === 'graph' && <ImpactPanel />}
          </div>
          <Inspector />
        </div>
        <OrphanBanner />
        <CommandPalette />
        <ReconnectWizard />
        <ExportDialog />
        <SnapshotDialog />
      </div>
    </ReactFlowProvider>
  );
}
