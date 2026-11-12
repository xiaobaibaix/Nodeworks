import type { Endpoint, Graph, KindDef, PropMeta, ResourceItem, ResourceType, UnitEdge, UnitNode, UnitPort } from './types';

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyGraph(): Graph {
  return { version: 1, nodes: [], edges: [], kinds: {} };
}

export function createNode(title = '新单元', pos = { x: 120, y: 120 }): UnitNode {
  return { id: uid('n'), title, props: {}, ports: [], pos };
}

export function createPort(
  dir: 'in' | 'out',
  label?: string,
  capacity: 'one' | 'many' = 'many',
): UnitPort {
  return { id: uid('p'), dir, label: label ?? (dir === 'in' ? '输入' : '输出'), capacity };
}

export function createEdge(from: Endpoint, to: Endpoint): UnitEdge {
  return { id: uid('e'), from: { ...from }, to: { ...to } };
}

export function findNode(g: Graph, id: string): UnitNode | undefined {
  return g.nodes.find((n) => n.id === id);
}

export function findPort(g: Graph, nodeId: string, portId: string): UnitPort | undefined {
  return findNode(g, nodeId)?.ports.find((p) => p.id === portId);
}

export function findEdge(g: Graph, id: string): UnitEdge | undefined {
  return g.edges.find((e) => e.id === id);
}

export function validateConnection(g: Graph, from: Endpoint, to: Endpoint): string | null {
  const a = findPort(g, from.node, from.port);
  const b = findPort(g, to.node, to.port);
  if (!a || !b) return '端点不存在';
  if (a.dir !== 'out' || b.dir !== 'in') return '只能从输出口连到输入口';
  if (from.node === to.node) return '不能连到自己';
  const dup = g.edges.some(
    (e) =>
      !e.orphan &&
      e.from.node === from.node &&
      e.from.port === from.port &&
      e.to.node === to.node &&
      e.to.port === to.port,
  );
  if (dup) return '这条线已经存在';
  if (b.capacity === 'one' && g.edges.some((e) => !e.orphan && e.to.node === to.node && e.to.port === to.port)) {
    return '该输入口只允许一条连线';
  }
  return null;
}

export function addNodeOp(g: Graph, node: UnitNode): Graph {
  return { ...g, nodes: [...g.nodes, node] };
}

export function removeNodeOp(g: Graph, id: string): Graph {
  return {
    ...g,
    nodes: g.nodes.filter((n) => n.id !== id),
    edges: g.edges.filter((e) => e.from.node !== id && e.to.node !== id),
  };
}

export function renameNodeOp(g: Graph, id: string, title: string): Graph {
  return { ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, title } : n)) };
}

export function setKindOp(g: Graph, id: string, kind: string): Graph {
  return { ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, kind } : n)) };
}

export function setNodePosOp(g: Graph, id: string, pos: { x: number; y: number }): Graph {
  return { ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, pos: { ...pos } } : n)) };
}

export function moveNodesOp(g: Graph, moves: Record<string, { x: number; y: number }>): Graph {
  if (!Object.keys(moves).length) return g;
  return {
    ...g,
    nodes: g.nodes.map((n) => (moves[n.id] ? { ...n, pos: { ...moves[n.id] } } : n)),
  };
}

export function replaceNodeOp(g: Graph, node: UnitNode): Graph {
  return { ...g, nodes: g.nodes.map((n) => (n.id === node.id ? node : n)) };
}

export function removeNodesOp(g: Graph, ids: string[]): Graph {
  const doomed = new Set(ids);
  return {
    ...g,
    nodes: g.nodes.filter((n) => !doomed.has(n.id)),
    edges: g.edges.filter((e) => !doomed.has(e.from.node) && !doomed.has(e.to.node)),
  };
}

export function setKindsOp(g: Graph, kinds: Graph['kinds']): Graph {
  return { ...g, kinds };
}

export function setPropOp(g: Graph, nodeId: string, key: string, prop: PropMeta): Graph {
  return {
    ...g,
    nodes: g.nodes.map((n) => (n.id === nodeId ? { ...n, props: { ...n.props, [key]: prop } } : n)),
  };
}

export function removePropOp(g: Graph, nodeId: string, key: string): Graph {
  return {
    ...g,
    nodes: g.nodes.map((n) => {
      if (n.id !== nodeId) return n;
      const props = { ...n.props };
      delete props[key];
      return { ...n, props };
    }),
  };
}

export function addPortOp(g: Graph, nodeId: string, port: UnitPort): Graph {
  return {
    ...g,
    nodes: g.nodes.map((n) => (n.id === nodeId ? { ...n, ports: [...n.ports, port] } : n)),
  };
}

export function setPortOp(g: Graph, nodeId: string, portId: string, patch: Partial<UnitPort>): Graph {
  return {
    ...g,
    nodes: g.nodes.map((n) =>
      n.id === nodeId
        ? { ...n, ports: n.ports.map((p) => (p.id === portId ? { ...p, ...patch, id: p.id } : p)) }
        : n,
    ),
  };
}

export function removePortOp(g: Graph, nodeId: string, portId: string): Graph {
  return {
    ...g,
    nodes: g.nodes.map((n) =>
      n.id === nodeId ? { ...n, ports: n.ports.filter((p) => p.id !== portId) } : n,
    ),
    edges: g.edges.map((e) => {
      const hit =
        (e.from.node === nodeId && e.from.port === portId) ||
        (e.to.node === nodeId && e.to.port === portId);
      return hit ? { ...e, orphan: true } : e;
    }),
  };
}

export function clearOrphanOp(g: Graph, nodeId: string, portId: string): Graph {
  return {
    ...g,
    edges: g.edges.map((e) => {
      const hit =
        (e.from.node === nodeId && e.from.port === portId) ||
        (e.to.node === nodeId && e.to.port === portId);
      if (!hit) return e;
      const next = { ...e };
      delete next.orphan;
      return next;
    }),
  };
}

export function addEdgeOp(g: Graph, edge: UnitEdge): Graph {
  return { ...g, edges: [...g.edges, edge] };
}

export function removeEdgeOp(g: Graph, id: string): Graph {
  return { ...g, edges: g.edges.filter((e) => e.id !== id) };
}

export function setEdgeLabelOp(g: Graph, id: string, label: string): Graph {
  return { ...g, edges: g.edges.map((e) => (e.id === id ? { ...e, label } : e)) };
}

export function isPortEndpoint(edge: UnitEdge, nodeId: string, portId: string): boolean {
  return (
    (edge.from.node === nodeId && edge.from.port === portId) ||
    (edge.to.node === nodeId && edge.to.port === portId)
  );
}

/** 直接删掉某端口上的所有连线（重连向导的「删除这些边」）。 */
export function removePortEdgesOp(g: Graph, nodeId: string, portId: string): Graph {
  return {
    ...g,
    edges: g.edges.filter((e) => !isPortEndpoint(e, nodeId, portId)),
  };
}

/**
 * 把某端口上的连线整体改接到另一个同向端口。
 * 若改接后与既有连线完全重复，丢弃重复项而不是制造两条一样的线。
 */
export function replacePortInEdgesOp(
  g: Graph,
  nodeId: string,
  fromPortId: string,
  toPortId: string,
): Graph {
  const key = (e: UnitEdge) =>
    `${e.from.node}:${e.from.port}>${e.to.node}:${e.to.port}`;
  const seen = new Set(
    g.edges.filter((e) => !isPortEndpoint(e, nodeId, fromPortId)).map(key),
  );
  const edges: UnitEdge[] = [];
  for (const e of g.edges) {
    if (!isPortEndpoint(e, nodeId, fromPortId)) {
      edges.push(e);
      continue;
    }
    const next: UnitEdge = {
      ...e,
      from:
        e.from.node === nodeId && e.from.port === fromPortId
          ? { ...e.from, port: toPortId }
          : e.from,
      to:
        e.to.node === nodeId && e.to.port === fromPortId
          ? { ...e.to, port: toPortId }
          : e.to,
    };
    delete next.orphan;
    if (seen.has(key(next))) continue;
    seen.add(key(next));
    edges.push(next);
  }
  return { ...g, edges };
}

/** 用 kind 模板补齐缺省属性与端口；已有属性/同名同向端口保留，不覆盖用户数据。 */
export function withKindDefaults(node: UnitNode, def: KindDef): UnitNode {
  const ports = [...node.ports];
  for (const port of def.ports ?? []) {
    const exists = ports.some((p) => p.dir === port.dir && p.label === port.label);
    if (!exists) ports.push(createPort(port.dir, port.label, port.capacity));
  }
  const props = { ...node.props };
  for (const [key, meta] of Object.entries(def.defaults ?? {})) {
    if (!(key in props)) props[key] = JSON.parse(JSON.stringify(meta)) as PropMeta;
  }
  return { ...node, props, ports };
}

export function createNodeFromKind(
  kind: string,
  def: KindDef,
  pos = { x: 120, y: 120 },
): UnitNode {
  const node = createNode(def.name || kind, pos);
  node.kind = kind;
  return withKindDefaults(node, def);
}

export function orphanEdges(g: Graph): UnitEdge[] {
  return g.edges.filter((e) => e.orphan);
}

/** 设置某节点的子图端口映射；传空对象表示清空。 */
export function setSubgraphMapOp(
  g: Graph,
  nodeId: string,
  map: Record<string, Endpoint>,
): Graph {
  return {
    ...g,
    nodes: g.nodes.map((n) => {
      if (n.id !== nodeId) return n;
      if (!Object.keys(map).length) {
        const next = { ...n };
        delete next.subgraphMap;
        return next;
      }
      return { ...n, subgraphMap: map };
    }),
  };
}

/**
 * 按端口方向把一条边摆正：source 必须是 out，target 必须是 in。
 * 历史数据/导入数据里如果存反了（in→out），React Flow 找不到 source handle，
 * 整条线会静默不渲染；渲染层用这个函数归一化。端口缺失时返回 null。
 */
export function orientEdge(
  g: Graph,
  edge: UnitEdge,
): { from: Endpoint; to: Endpoint } | null {
  const a = findPort(g, edge.from.node, edge.from.port);
  const b = findPort(g, edge.to.node, edge.to.port);
  if (!a || !b) return null;
  if (a.dir === 'out' && b.dir === 'in') return { from: edge.from, to: edge.to };
  if (a.dir === 'in' && b.dir === 'out') return { from: edge.to, to: edge.from };
  return null;
}

/** 把子图层里外层输入/输出代理的位置写回父节点（纯数据，不参与端口映射）。 */
export function setBoundaryPosOp(
  g: Graph,
  nodeId: string,
  side: 'in' | 'out',
  pos: { x: number; y: number },
): Graph {
  return {
    ...g,
    nodes: g.nodes.map((n) => {
      if (n.id !== nodeId) return n;
      return {
        ...n,
        boundaryPos: { ...n.boundaryPos, [side]: { x: Math.round(pos.x), y: Math.round(pos.y) } },
      };
    }),
  };
}

export function createResource(type: ResourceType, label?: string): ResourceItem {
  const names: Record<ResourceType, string> = {
    image: '图标', model: '模型', audio: '音频', other: '资源',
  };
  return {
    id: uid('r'),
    type,
    label: label ?? names[type],
    path: type === 'image' ? 'assets/icon.png' : type === 'model' ? 'assets/model.glb' : '',
  };
}

export function addResourceOp(g: Graph, nodeId: string, item: ResourceItem): Graph {
  return {
    ...g,
    nodes: g.nodes.map((n) => {
      if (n.id !== nodeId) return n;
      return { ...n, resources: [...(n.resources ?? []), item] };
    }),
  };
}

export function setResourceOp(
  g: Graph,
  nodeId: string,
  resourceId: string,
  patch: Partial<Omit<ResourceItem, 'id'>>,
): Graph {
  return {
    ...g,
    nodes: g.nodes.map((n) => {
      if (n.id !== nodeId) return n;
      return {
        ...n,
        resources: (n.resources ?? []).map((r) =>
          r.id === resourceId ? { ...r, ...patch, id: resourceId } : r,
        ),
      };
    }),
  };
}

export function removeResourceOp(g: Graph, nodeId: string, resourceId: string): Graph {
  return {
    ...g,
    nodes: g.nodes.map((n) => {
      if (n.id !== nodeId) return n;
      const next = (n.resources ?? []).filter((r) => r.id !== resourceId);
      const copy = { ...n };
      if (next.length) copy.resources = next;
      else delete copy.resources;
      return copy;
    }),
  };
}

/** 只改某个节点下的某条资源项，其它节点/资源原样保留。 */
function mapResource(
  g: Graph,
  nodeId: string,
  resourceId: string,
  fn: (r: ResourceItem) => ResourceItem,
): Graph {
  return {
    ...g,
    nodes: g.nodes.map((n) => {
      if (n.id !== nodeId || !n.resources) return n;
      return {
        ...n,
        resources: n.resources.map((r) => (r.id === resourceId ? fn(r) : r)),
      };
    }),
  };
}

/** 给资源项挂一个子资源（图片容器里的一条视图）。 */
export function addResourceViewOp(
  g: Graph,
  nodeId: string,
  resourceId: string,
  view: ResourceItem,
): Graph {
  return mapResource(g, nodeId, resourceId, (r) => ({ ...r, views: [...(r.views ?? []), view] }));
}

export function setResourceViewOp(
  g: Graph,
  nodeId: string,
  resourceId: string,
  viewId: string,
  patch: Partial<Omit<ResourceItem, 'id'>>,
): Graph {
  return mapResource(g, nodeId, resourceId, (r) => ({
    ...r,
    views: (r.views ?? []).map((v) => (v.id === viewId ? { ...v, ...patch, id: viewId } : v)),
  }));
}

export function removeResourceViewOp(
  g: Graph,
  nodeId: string,
  resourceId: string,
  viewId: string,
): Graph {
  return mapResource(g, nodeId, resourceId, (r) => {
    const views = (r.views ?? []).filter((v) => v.id !== viewId);
    const copy = { ...r };
    if (views.length) copy.views = views;
    else delete copy.views;
    return copy;
  });
}
