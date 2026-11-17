import { useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useGraph } from '../store';
import type { ProjectFolder } from '../model/project';

interface Props {
  at: { x: number; y: number };
  onClose: () => void;
}

function folderPath(folders: ProjectFolder[], id: string | null | undefined): string {
  if (!id) return '根目录';
  const byId = new Map(folders.map((f) => [f.id, f]));
  const parts: string[] = [];
  let cur = byId.get(id);
  let guard = 0;
  while (cur && guard++ < 20) {
    parts.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return parts.join(' / ') || '根目录';
}

/** 右键菜单里的“子图”入口：搜索已有图并作为下游连接，或新建一张下游图。 */
export function SubgraphDialog({ at, onClose }: Props) {
  const projectGraphs = useGraph((s) => s.projectGraphs);
  const folders = useGraph((s) => s.folders);
  const activeId = useGraph((s) => s.activeGraphId);
  const selected = useGraph((s) => s.selectedNodes);
  const addGraphRef = useGraph((s) => s.addGraphRef);
  const createDownstream = useGraph((s) => s.createDownstream);
  const { screenToFlowPosition } = useReactFlow();
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [folderId, setFolderId] = useState<string>('');
  const [dir, setDir] = useState<'in' | 'out'>('in');

  const pos = useMemo(
    () => screenToFlowPosition({ x: at.x, y: at.y }),
    [at.x, at.y, screenToFlowPosition],
  );
  const autoFrom = selected.length === 1 ? selected[0] : undefined;
  const items = projectGraphs
    .filter((p) => p.id !== activeId)
    .filter((p) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return `${p.name} ${folderPath(folders, p.folderId)}`.toLowerCase().includes(q);
    });

  const place = (graphId: string) => {
    addGraphRef(graphId, pos, dir, dir === 'in' ? autoFrom : undefined);
    onClose();
  };
  const create = () => {
    const label = name.trim();
    if (!label) return;
    createDownstream(label, pos, folderId || null, dir);
    onClose();
  };

  return (
    <div className="subgraph-modal" role="dialog" aria-label="选择子图" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="subgraph-card">
        <header className="subgraph-head">
          <h3>放置子图</h3>
          <button className="icon" onClick={onClose} title="关闭">×</button>
        </header>
        <div className="subgraph-dir" role="group" aria-label="子图方向">
          <button className={dir === 'in' ? 'on' : ''} onClick={() => setDir('in')}>作为下游（输入口）</button>
          <button className={dir === 'out' ? 'on' : ''} onClick={() => setDir('out')}>作为上游（输出口）</button>
        </div>
        <p className="subgraph-hint">
          {dir === 'in'
            ? '下游是“消费本图产物”的图：放下的节点带一个「产物」输入口。'
            : '上游是“本图要用的产物”来源：放下的节点带一个「产物」输出口。'}
          {autoFrom ? ' 会自动从当前选中的单元接一条线。' : ' 选中一个单元后再打开，可自动接线。'}
        </p>
        <input
          className="subgraph-search"
          autoFocus
          value={query}
          placeholder="搜索已有的图 / 分组…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && items[0]) place(items[0].id);
          }}
        />
        <div className="subgraph-list">
          {items.slice(0, 40).map((p) => (
            <button key={p.id} className="subgraph-item" onClick={() => place(p.id)}>
              <span className="subgraph-name">{p.name}</span>
              <span className="subgraph-path">{folderPath(folders, p.folderId)} · {p.graph.nodes.length} 单元</span>
            </button>
          ))}
          {!items.length && <div className="subgraph-empty">没有匹配的图</div>}
        </div>
        <div className="subgraph-create">
          <div className="subgraph-create-title">或者新建一张下游图</div>
          <div className="subgraph-create-row">
            <input value={name} placeholder="图名，例如 装配线" onChange={(e) => setName(e.target.value)} />
            <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">根目录</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{folderPath(folders, f.id)}</option>
              ))}
            </select>
            <button className="primary" disabled={!name.trim()} onClick={create}>新建并放下</button>
          </div>
        </div>
      </div>
    </div>
  );
}
