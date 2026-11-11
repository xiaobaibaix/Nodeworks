import { addEdgeOp, addPortOp, createEdge, createPort, setSubgraphMapOp } from './ops';
import type { Endpoint, Graph, UnitEdge, UnitNode } from './types';

/** 另一张顶层子图里的一个输入端口（跨子图连线的落点）。 */
export interface CrossTarget {
  hostId: string;
  hostTitle: string;
  nodeId: string;
  nodeTitle: string;
  portId: string;
  portLabel: string;
}

/** 列出除 sourceHostId 之外、所有顶层子图内部的输入端口。 */
export function crossTargets(root: Graph, sourceHostId: string): CrossTarget[] {
  const list: CrossTarget[] = [];
  for (const host of root.nodes) {
    if (host.id === sourceHostId || !host.subgraph) continue;
    for (const node of host.subgraph.nodes) {
      for (const port of node.ports) {
        if (port.dir !== 'in') continue;
        list.push({
          hostId: host.id,
          hostTitle: host.title,
          nodeId: node.id,
          nodeTitle: node.title,
          portId: port.id,
          portLabel: port.label,
        });
      }
    }
  }
  return list.sort((a, b) =>
    `${a.hostTitle}/${a.nodeTitle}/${a.portLabel}`.localeCompare(
      `${b.hostTitle}/${b.nodeTitle}/${b.portLabel}`,
      'zh',
    ),
  );
}

function uniqueLabel(host: UnitNode, base: string): string {
  const used = new Set(host.ports.map((p) => p.label));
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base} ${i}`)) i += 1;
  return `${base} ${i}`;
}

export interface CrossPlan {
  graph: Graph;
  edge: UnitEdge;
  sourcePortId: string;
  targetPortId: string;
}

/**
 * 把「子图 A 的内部输出」连到「子图 B 的内部输入」：
 * 在两台宿主上各加一个外层端口并写 subgraphMap，再在根层连一条普通边。
 * 这样每层都只画本层边，内部通过既有的外层端口代理看到连线。
 */
export function planCrossLink(
  root: Graph,
  sourceHostId: string,
  source: Endpoint,
  target: CrossTarget,
): CrossPlan | null {
  const host = root.nodes.find((n) => n.id === sourceHostId);
  const other = root.nodes.find((n) => n.id === target.hostId);
  if (!host?.subgraph || !other?.subgraph || host.id === other.id) return null;
  const sourceNode = host.subgraph.nodes.find((n) => n.id === source.node);
  const sourcePort = sourceNode?.ports.find((p) => p.id === source.port);
  const targetNode = other.subgraph.nodes.find((n) => n.id === target.nodeId);
  const targetPort = targetNode?.ports.find((p) => p.id === target.portId);
  if (!sourceNode || !sourcePort || !targetNode || !targetPort) return null;
  if (sourcePort.dir !== 'out' || targetPort.dir !== 'in') return null;

  const sourcePortId = uniqueLabel(host, `${sourceNode.title} · ${sourcePort.label}`);
  const targetPortId = uniqueLabel(other, `${targetNode.title} · ${targetPort.label}`);
  const outerOut = createPort('out', sourcePortId);
  const outerIn = createPort('in', targetPortId);

  let next = addPortOp(root, host.id, outerOut);
  next = addPortOp(next, other.id, outerIn);
  next = setSubgraphMapOp(next, host.id, {
    ...(host.subgraphMap ?? {}),
    [outerOut.id]: { node: sourceNode.id, port: sourcePort.id },
  });
  next = setSubgraphMapOp(next, other.id, {
    ...(other.subgraphMap ?? {}),
    [outerIn.id]: { node: targetNode.id, port: targetPort.id },
  });

  const edge = createEdge(
    { node: host.id, port: outerOut.id },
    { node: other.id, port: outerIn.id },
  );
  edge.label = '跨子图';
  next = addEdgeOp(next, edge);
  return { graph: next, edge, sourcePortId: outerOut.id, targetPortId: outerIn.id };
}
