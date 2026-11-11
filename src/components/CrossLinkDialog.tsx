import { useMemo, useState } from 'react';
import { crossTargets, type CrossTarget } from '../model/cross';
import type { Endpoint } from '../model/types';
import { useGraph } from '../store';

interface Props {
  source: Endpoint | null;
  onClose: () => void;
}

/** 跨子图连线落点选择：列出其它顶层子图内部的输入端口。 */
export default function CrossLinkDialog({ source, onClose }: Props) {
  const root = useGraph((s) => s.graph);
  const path = useGraph((s) => s.path);
  const link = useGraph((s) => s.linkCrossSubgraph);
  const [query, setQuery] = useState('');

  const targets = useMemo(() => {
    if (!source || path.length !== 1) return [];
    return crossTargets(root, path[0]);
  }, [root, path, source]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter((t) =>
      [t.hostTitle, t.nodeTitle, t.portLabel].join(' ').toLowerCase().includes(q),
    );
  }, [targets, query]);

  if (!source) return null;

  const groups = filtered.reduce<Record<string, CrossTarget[]>>((acc, t) => {
    (acc[t.hostId] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal cross-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>跨子图连线</h2>
        <p className="hint">
          从「{source.node}」的输出口出发，选另一张子图内部的输入端口。会自动在两边子图卡片上创建外层端口并建立映射。
        </p>
        <input
          className="cross-search"
          autoFocus
          placeholder="搜索子图 / 单元 / 端口"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="cross-list">
          {Object.keys(groups).length === 0 ? (
            <p className="empty">
              没有可连的目标。目标是「其它顶层子图内部节点的输入端口」；先创建子图并往里加单元。
            </p>
          ) : (
            Object.entries(groups).map(([hostId, list]) => (
              <section key={hostId} className="cross-group">
                <h3>{list[0].hostTitle}</h3>
                {list.map((t) => (
                  <button
                    key={`${t.hostId}/${t.nodeId}/${t.portId}`}
                    className="cross-target"
                    onClick={() => {
                      link(source, t);
                      onClose();
                    }}
                  >
                    <span>{t.nodeTitle}</span>
                    <span className="muted">{t.portLabel}</span>
                  </button>
                ))}
              </section>
            ))
          )}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}
