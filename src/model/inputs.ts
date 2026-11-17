import type { Graph } from './types';
import { uid } from './ops';

/**
 * 输入端口固定单条连线：把已有端口上的多条连线拆到同向的新端口上。
 * 旧数据里输入口可能是 many、或者一个口上挂了多条线，打开时做一次迁移。
 */
export function enforceSingleInputs(graph: Graph): Graph {
  let changed = false;
  const edges = graph.edges.map((e) => ({ ...e }));
  const nodes = graph.nodes.map((node) => {
    const ports = node.ports.map((p) => {
      if (p.dir === 'in' && p.capacity !== 'one') {
        changed = true;
        return { ...p, capacity: 'one' as const };
      }
      return p;
    });
    for (const port of ports) {
      if (port.dir !== 'in') continue;
      const linked = edges.filter(
        (e) => !e.orphan && e.to.node === node.id && e.to.port === port.id,
      );
      for (let i = 1; i < linked.length; i += 1) {
        let n = 2;
        let label = `${port.label} ${n}`;
        while (ports.some((p) => p.dir === 'in' && p.label === label)) {
          n += 1;
          label = `${port.label} ${n}`;
        }
        const next = { id: uid('p'), dir: 'in' as const, label, capacity: 'one' as const };
        ports.push(next);
        linked[i].to = { ...linked[i].to, port: next.id };
        changed = true;
      }
    }
    const subgraph = node.subgraph ? enforceSingleInputs(node.subgraph) : undefined;
    if (subgraph && subgraph !== node.subgraph) changed = true;
    return subgraph && subgraph !== node.subgraph
      ? { ...node, ports, subgraph }
      : { ...node, ports };
  });
  return changed ? { ...graph, nodes, edges } : graph;
}
