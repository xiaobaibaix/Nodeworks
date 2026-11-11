import { useEffect, useState } from 'react';
import {
  diffCount, diffGraphs, formatTime, formatValue, isDiffEmpty, SNAPSHOT_LIMIT,
} from '../model/snapshot';
import { useGraph } from '../store';

export default function SnapshotDialog() {
  const open = useGraph((s) => s.snapshotOpen);
  const setOpen = useGraph((s) => s.openSnapshots);
  const snapshots = useGraph((s) => s.snapshots);
  const graph = useGraph((s) => s.graph);
  const takeSnapshot = useGraph((s) => s.takeSnapshot);
  const restoreSnapshot = useGraph((s) => s.restoreSnapshot);
  const deleteSnapshot = useGraph((s) => s.deleteSnapshot);
  const [label, setLabel] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLabel('');
    setConfirmId(null);
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal snapshot-modal">
        <h2>快照</h2>
        <p className="hint">
          快照是整张图的本地副本，回滚只改数据、可以 ⌘Z 撤销。当前 {graph.nodes.length} 个单元 /{' '}
          {graph.edges.length} 条连线；最多保留 {SNAPSHOT_LIMIT} 份。
        </p>

        <div className="snapshot-save">
          <input
            value={label}
            placeholder="快照名称（可留空）"
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') takeSnapshot(label);
            }}
          />
          <button className="primary" onClick={() => takeSnapshot(label)}>
            保存当前快照
          </button>
        </div>

        {snapshots.length === 0 ? (
          <p className="ok">还没有快照。改到满意时存一份，之后可以对比、回滚。</p>
        ) : (
          <ul className="snapshot-list">
            {snapshots.map((snap) => {
              const diff = diffGraphs(snap.graph, graph);
              const empty = isDiffEmpty(diff);
              return (
                <li key={snap.id} className="snapshot-row">
                  <div className="snapshot-head">
                    <span className="snapshot-label">{snap.label}</span>
                    <span className="snapshot-time">{formatTime(snap.at)}</span>
                    <span className="snapshot-count">
                      {snap.graph.nodes.length} 单元 / {snap.graph.edges.length} 连线
                    </span>
                    <span className={empty ? 'snapshot-diff same' : 'snapshot-diff'}>
                      {empty ? '与当前一致' : `与当前差 ${diffCount(diff)} 处`}
                    </span>
                  </div>

                  {!empty && (
                    <details className="snapshot-changes">
                      <summary>查看变化</summary>
                      <ul>
                        {diff.nodesAdded > 0 && <li>新增 {diff.nodesAdded} 个单元</li>}
                        {diff.nodesRemoved > 0 && <li>删除 {diff.nodesRemoved} 个单元</li>}
                        {diff.edgesAdded > 0 && <li>新增 {diff.edgesAdded} 条连线</li>}
                        {diff.edgesRemoved > 0 && <li>删除 {diff.edgesRemoved} 条连线</li>}
                        {diff.nodesChanged > 0 && (
                          <li>
                            修改 {diff.nodesChanged} 个单元
                            {diff.movedNodes > 0 ? `（${diff.movedNodes} 个移动了位置）` : ''}
                          </li>
                        )}
                        {diff.edgesChanged > 0 && <li>修改 {diff.edgesChanged} 条连线</li>}
                        {diff.titleChanges.slice(0, 5).map((c) => (
                          <li key={c.nodeId}>
                            标题：{c.from || '未命名'} → {c.to || '未命名'}
                          </li>
                        ))}
                        {diff.propChanges.slice(0, 5).map((c) => (
                          <li key={`${c.nodeId}-${c.prop}`}>
                            {c.nodeTitle}.{c.prop}：{formatValue(c.from)} → {formatValue(c.to)}
                          </li>
                        ))}
                        {diff.propChanges.length > 5 && (
                          <li>另有 {diff.propChanges.length - 5} 项属性变化…</li>
                        )}
                      </ul>
                    </details>
                  )}

                  <div className="snapshot-actions">
                    {confirmId === snap.id ? (
                      <>
                        <button className="danger" onClick={() => deleteSnapshot(snap.id)}>
                          确认删除
                        </button>
                        <button onClick={() => setConfirmId(null)}>取消</button>
                      </>
                    ) : (
                      <>
                        <button
                          className="primary"
                          onClick={() => restoreSnapshot(snap.id)}
                          title="用这份快照替换当前根图（可撤销）"
                        >
                          回滚
                        </button>
                        <button onClick={() => setConfirmId(snap.id)}>删除</button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="modal-actions">
          <button onClick={() => setOpen(false)}>关闭</button>
        </div>
      </div>
    </div>
  );
}
