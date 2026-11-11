import { useMemo } from 'react';
import { impactOf } from '../model/impact';
import { useCurrentGraph, useGraph } from '../store';

export default function ImpactPanel() {
  const graph = useCurrentGraph();
  const selected = useGraph((s) => s.selectedNodes);
  const impactOn = useGraph((s) => s.impactOn);
  const depth = useGraph((s) => s.impactDepth);
  const setDepth = useGraph((s) => s.setImpactDepth);
  const setImpactOn = useGraph((s) => s.setImpactOn);
  const select = useGraph((s) => s.select);

  const id = impactOn && selected.length === 1 ? selected[0] : null;
  const impact = useMemo(() => (id ? impactOf(graph, id, depth) : null), [graph, id, depth]);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);

  if (!impactOn) return null;

  const title = (nodeId: string) => byId.get(nodeId)?.title ?? nodeId;
  const kind = (nodeId: string) => byId.get(nodeId)?.kind || 'unit';

  const levels: Array<{ key: string; label: string; ids: string[] }> = [];
  impact?.levels.up.forEach((ids, index) => {
    levels.push({ key: `up-${index}`, label: `上游 ${index + 1} 层`, ids });
  });
  impact?.levels.down.forEach((ids, index) => {
    levels.push({ key: `down-${index}`, label: `下游 ${index + 1} 层`, ids });
  });

  return (
    <aside className="impact-panel">
      <header className="impact-head">
        <span>影响面</span>
        <select
          value={depth}
          onChange={(e) => setDepth(Number(e.target.value))}
          title="上下游层数"
        >
          {[1, 2, 3, 4, 5].map((d) => (
            <option key={d} value={d}>{d} 层</option>
          ))}
        </select>
        <button className="link" onClick={() => setImpactOn(false)}>关闭</button>
      </header>

      {!impact || !id ? (
        <div className="hint">选中一个单元，查看它的上下游依赖。</div>
      ) : (
        <>
          <div className="impact-counts">
            <span>上游 <b>{impact.up.length}</b></span>
            <span>下游 <b>{impact.down.length}</b></span>
            <span>相关连线 <b>{impact.edges.length}</b></span>
          </div>
          {levels.length === 0 && <div className="hint">这个单元没有上下游连线。</div>}
          {levels.map((level) => (
            <section key={level.key} className="impact-level">
              <div className="impact-level-head">
                {level.label}
                <span className="dim"> {level.ids.length}</span>
              </div>
              <ul>
                {level.ids.map((nodeId) => (
                  <li key={nodeId}>
                    <button
                      className="impact-item"
                      title={nodeId}
                      onClick={() => select([nodeId], null)}
                    >
                      <span className={`impact-kind${byId.get(nodeId)?.kind ? '' : ' plain'}`}>
                        {kind(nodeId)}
                      </span>
                      <span className="impact-title">{title(nodeId)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <footer className="impact-foot dim">
            只读派生，不会改动任何数值。点条目可切换起点。
          </footer>
        </>
      )}
    </aside>
  );
}
