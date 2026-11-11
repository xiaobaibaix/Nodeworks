import { useState } from 'react';
import { findNode, isPortEndpoint } from '../model/ops';
import { useCurrentGraph, useGraph } from '../store';

const NEW = '__new__';

export default function ReconnectWizard() {
  const pending = useGraph((s) => s.pendingPort);
  const graph = useCurrentGraph();
  const confirmRemovePort = useGraph((s) => s.confirmRemovePort);
  const cancelRemovePort = useGraph((s) => s.cancelRemovePort);
  const [choice, setChoice] = useState(NEW);

  if (!pending) return null;
  const node = findNode(graph, pending.nodeId);
  const port = node?.ports.find((p) => p.id === pending.portId);
  if (!node || !port) return null;

  const affected = graph.edges.filter((e) => isPortEndpoint(e, pending.nodeId, pending.portId));
  const candidates = node.ports.filter((p) => {
    if (p.id === port.id || p.dir !== port.dir) return false;
    if (p.dir === 'in' && p.capacity === 'one') {
      const occupied = graph.edges.filter(
        (e) => !e.orphan && e.to.node === node.id && e.to.port === p.id,
      ).length;
      return occupied === 0 && affected.length === 1;
    }
    return true;
  });
  const current = candidates.some((p) => p.id === choice) ? choice : NEW;

  const endpoint = (ep: { node: string; port: string }) => {
    const other = findNode(graph, ep.node);
    const otherPort = other?.ports.find((p) => p.id === ep.port);
    return `${other?.title ?? '?'}.${otherPort?.label ?? '?'}`;
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>端口「{port.label}」还有 {affected.length} 条连线</h2>
        <p className="hint">
          删除端口时这些边可以改接到同向的其它端口；也可以直接删边，或保留成孤儿边稍后处理。
        </p>

        <ul className="edge-list">
          {affected.map((e) => (
            <li key={e.id}>
              <span>{endpoint(e.from)}</span>
              <span className="arrow">→</span>
              <span>{endpoint(e.to)}</span>
            </li>
          ))}
        </ul>

        <label className="field">
          <span>改接到</span>
          <select value={current} onChange={(e) => setChoice(e.target.value)}>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
            <option value={NEW}>新建「{port.label}」端口</option>
          </select>
        </label>

        <div className="modal-actions">
          <button onClick={cancelRemovePort}>取消</button>
          <button className="danger" onClick={() => confirmRemovePort({ kind: 'drop' })}>
            删除端口和这些边
          </button>
          <button onClick={() => confirmRemovePort({ kind: 'orphan' })}>保留为孤儿边</button>
          <button
            className="primary"
            onClick={() =>
              current === NEW
                ? confirmRemovePort({ kind: 'new' })
                : confirmRemovePort({ kind: 'rewire', portId: current })
            }
          >
            改接后删除
          </button>
        </div>
      </div>
    </div>
  );
}
