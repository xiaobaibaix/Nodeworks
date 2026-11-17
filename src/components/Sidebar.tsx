import { useEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  groupByKind, isolatedNodeIds, kindOptions, nodeMatches, orphanNodeIds, visibleNodes,
} from '../model/query';
import { useCurrentGraph, useGraph } from '../store';
import { type ProjectFolder } from '../model/project';

function highlight(text: string, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return text;
  const lower = text.toLowerCase();
  const parts: Array<string | JSX.Element> = [];
  let cursor = 0;
  while (cursor <= text.length) {
    const at = lower.indexOf(needle, cursor);
    if (at < 0) {
      parts.push(text.slice(cursor));
      break;
    }
    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push(<mark key={at}>{text.slice(at, at + needle.length)}</mark>);
    cursor = at + needle.length;
  }
  return <>{parts}</>;
}


function IconFolder({ open }: { open?: boolean }) {
  return (
    <svg className="tree-ic folder" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      {open ? (
        <path d="M1.5 3.2h4.1l1.3 1.6H14a1 1 0 0 1 .96 1.28l-1.3 6A1 1 0 0 1 12.7 13H2.3a1 1 0 0 1-.97-.76L.37 4.6A1 1 0 0 1 1.5 3.2z" />
      ) : (
        <path d="M1.5 3h4.2l1.3 1.6H14a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H1.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      )}
    </svg>
  );
}

function IconFile() {
  return (
    <svg className="tree-ic file" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M3 2.2h6.2L13 6v7.8a.8.8 0 0 1-.8.8H3.8a.8.8 0 0 1-.8-.8V2.2z" />
      <path d="M9 2.2V6h3.8" fill="none" stroke="#0f1318" strokeWidth="1" />
    </svg>
  );
}

export default function Sidebar() {
  const graph = useCurrentGraph();
  const filter = useGraph((s) => s.filter);
  const setFilter = useGraph((s) => s.setFilter);
  const selectedNodes = useGraph((s) => s.selectedNodes);
  const select = useGraph((s) => s.select);
  const togglePalette = useGraph((s) => s.togglePalette);
  const projectGraphs = useGraph((s) => s.projectGraphs);
  const activeGraphId = useGraph((s) => s.activeGraphId);
  const switchGraph = useGraph((s) => s.switchGraph);
  const addGraph = useGraph((s) => s.addGraph);
  const importGraph = useGraph((s) => s.importGraph);
  const folderName = useGraph((s) => s.folderName);
  const fileName = useGraph((s) => s.fileName);
  const unbindFolder = useGraph((s) => s.unbindFolder);
  const reloadFolder = useGraph((s) => s.reloadFolder);
  const renameGraph = useGraph((s) => s.renameGraph);
  const removeGraph = useGraph((s) => s.removeGraph);
  const { fitView } = useReactFlow();
  const activeName = projectGraphs.find((pg) => pg.id === activeGraphId)?.name ?? '';
  const folders = useGraph((s) => s.folders);
  const addFolder = useGraph((s) => s.addFolder);
  const renameFolder = useGraph((s) => s.renameFolder);
  const removeFolder = useGraph((s) => s.removeFolder);

  const activeFolderId = projectGraphs.find((pg) => pg.id === activeGraphId)?.folderId ?? null;
  const folderRank = (f: ProjectFolder) => {
    const m = /^f_lv_(\d+)$/.exec(f.id);
    if (!m) return 1000;
    const level = Number(m[1]);
    return level === 0 ? 999 : level;
  };
  const folderChildren = (parentId: string | null) =>
    folders
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => folderRank(a) - folderRank(b) || a.name.localeCompare(b.name, 'zh'));
  const graphsIn = (folderId: string) =>
    projectGraphs
      .filter((pg) => pg.folderId === folderId)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  const folderPath = (folderId: string) => {
    const names: string[] = [];
    let cur = folders.find((f) => f.id === folderId);
    let guard = 0;
    while (cur && guard++ < 20) {
      names.unshift(cur.name);
      cur = folders.find((f) => f.id === cur?.parentId);
    }
    return names.join(' / ');
  };
  const countIn = (folderId: string): number =>
    graphsIn(folderId).length + folderChildren(folderId).reduce((n, f) => n + countIn(f.id), 0);

  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [selFolder, setSelFolder] = useState<string | null>(null);
  const [stuckFolder, setStuckFolder] = useState<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => visibleNodes(graph, filter), [graph, filter]);
  const listed = useMemo(
    () => visible.filter((n) => nodeMatches(n, filter.query)),
    [visible, filter.query],
  );
  const groups = useMemo(() => groupByKind(listed), [listed]);
  const kinds = useMemo(() => kindOptions(graph), [graph]);
  const isolated = useMemo(() => isolatedNodeIds(graph), [graph]);
  const orphan = useMemo(() => orphanNodeIds(graph), [graph]);

  useEffect(() => {
    setCursor(-1);
  }, [filter.query, filter.kinds, filter.onlyIsolated, filter.onlyOrphan]);

  useEffect(() => {
    setOpenFolders((prev) => {
      if (prev.size) return prev;
      return new Set(folders.filter((f) => !f.parentId).map((f) => f.id));
    });
  }, [folders]);

  useEffect(() => {
    setSelFolder(activeFolderId);
  }, [activeFolderId]);

  useEffect(() => {
    if (!activeFolderId) return;
    setOpenFolders((prev) => {
      const next = new Set(prev);
      let cur = folders.find((f) => f.id === activeFolderId);
      let guard = 0;
      while (cur && guard++ < 20) {
        next.add(cur.id);
        cur = folders.find((f) => f.id === cur?.parentId);
      }
      return next;
    });
  }, [activeFolderId, folders]);

  const toggleFolder = (id: string) => {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const syncStuck = () => {
    const el = treeRef.current;
    if (!el) return;
    if (el.scrollTop < 4) { setStuckFolder(null); return; }
    const top = el.getBoundingClientRect().top;
    let current: string | null = null;
    el.querySelectorAll<HTMLElement>('.graph-folder-head').forEach((head) => {
      const rect = head.getBoundingClientRect();
      if (rect.top <= top + 2 && rect.bottom > top + 2) current = head.dataset.fid ?? null;
    });
    setStuckFolder(current);
  };

  useEffect(() => { syncStuck(); }, [openFolders, folders]);

  const focusNode = (id: string) => {
    select([id], null);
    void fitView({ nodes: [{ id }], duration: 300, maxZoom: 1.15, padding: 2.2 });
  };

  const jump = (delta: number) => {
    if (!listed.length) return;
    const next = (cursor + delta + listed.length) % listed.length;
    setCursor(next);
    focusNode(listed[next].id);
  };

  const toggleKind = (kind: string) => {
    const active = filter.kinds.includes(kind);
    setFilter({
      kinds: active ? filter.kinds.filter((k) => k !== kind) : [...filter.kinds, kind],
    });
  };

  const filtering = filter.kinds.length > 0 || filter.onlyIsolated || filter.onlyOrphan;

  const openChain = (folderId: string | null) => {
    if (!folderId) return;
    setOpenFolders((prev) => {
      const next = new Set(prev);
      let cur = folders.find((f) => f.id === folderId);
      let guard = 0;
      while (cur && guard++ < 20) {
        next.add(cur.id);
        cur = folders.find((f) => f.id === cur?.parentId);
      }
      return next;
    });
  };

  const createGraphHere = () => {
    const target = selFolder ?? activeFolderId ?? null;
    addGraph(undefined, target ?? undefined);
    openChain(target);
  };

  const createFolderHere = () => {
    const name = window.prompt('新建分组名称', '新分组');
    if (!name?.trim()) return;
    addFolder(name.trim(), selFolder);
    openChain(selFolder);
  };

  const collapseAll = () => setOpenFolders(new Set());

  const renderFolder = (folder: ProjectFolder, depth: number) => {
    const kids = folderChildren(folder.id);
    const gs = graphsIn(folder.id);
    const open = openFolders.has(folder.id);
    return (
      <div key={folder.id} className="graph-folder">
        <div
          className={`graph-folder-head${open ? ' open' : ''}${folder.id === selFolder ? ' sel' : ''}`}
          data-fid={folder.id}
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => {
            setSelFolder(folder.id);
            toggleFolder(folder.id);
          }}
        >
          <span className="graph-folder-caret">{open ? '▾' : '▸'}</span>
          <IconFolder open={open} />
          <span className="graph-folder-name">{folder.name}</span>
          <span className="graph-tree-count">{countIn(folder.id)}</span>
          <span className="graph-folder-actions" onClick={(e) => e.stopPropagation()}>
            <button
              title="重命名分组"
              onClick={() => {
                const name = window.prompt('分组名称', folder.name);
                if (name?.trim()) renameFolder(folder.id, name.trim());
              }}
            >
              ✎
            </button>
            <button
              title="删除分组（里面的图移到上一级）"
              onClick={() => {
                if (window.confirm(`删除分组「${folder.name}」？里面的图会移到上一级，不会被删除。`)) {
                  removeFolder(folder.id);
                }
              }}
            >
              ×
            </button>
          </span>
        </div>
        {open && (
          <div className="graph-folder-body">
            {kids.map((k) => renderFolder(k, depth + 1))}
            {gs.map((pg) => (
              <button
                key={pg.id}
                className={`graph-tree-item${pg.id === activeGraphId ? ' on' : ''}`}
                style={{ paddingLeft: 22 + (depth + 1) * 16 }}
                title={pg.name}
                onClick={() => {
                  switchGraph(pg.id);
                  setSelFolder(pg.folderId ?? null);
                }}
              >
                <IconFile />
                <span className="graph-tree-name">{pg.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="sidebar">
      <header className="sidebar-head">
        <span>大纲</span>
        <button className="kbd" title="命令面板" onClick={() => togglePalette(true)}>⌘K</button>
      </header>

      <div className="tree-tools" role="toolbar" aria-label="图列表操作">
          <button title="新建图（在当前选中的分组里）" aria-label="新建图" onClick={createGraphHere}>
            <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2.2h5.4l3.4 3.4v8.2H4z" /><path d="M9.4 2.2v3.4h3.4" /><path d="M6.5 9.2h4.2M8.6 7.1v4.2" /></svg>
          </button>
          <button title="新建分组（在当前选中的分组里）" aria-label="新建分组" onClick={createFolderHere}>
            <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4.3h4l1.1 1.4h6.7v6.6H2z" /><path d="M6.4 8.8h3.2M8 7.2v3.2" /></svg>
          </button>
          <button title="全部折叠" aria-label="全部折叠" onClick={collapseAll}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5.6L8 10l5-4.4" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
          </button>
          <span className="tree-tools-gap" />
          <button title="重命名当前图" aria-label="重命名当前图" onClick={() => {
            const name = window.prompt('图名称', activeName);
            if (name?.trim()) renameGraph(name.trim());
          }}>
            <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><path d="M3 13l1-3.6 7-7a1.4 1.4 0 0 1 2 2l-7 7L3 13z" /><path d="M9.7 3.5l2.8 2.8" /></svg>
          </button>
          <button title="删除当前图" aria-label="删除当前图" disabled={projectGraphs.length <= 1} onClick={removeGraph}>
            <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.6 8.2h5.8l.6-8.2" /><path d="M6.6 7v3.4M9.4 7v3.4" /></svg>
          </button>
          <button title="导入图（graph JSON 作为新图加入当前项目）" aria-label="导入图" onClick={() => void importGraph()}>
            <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v7.2M5.2 6.6L8 9.4l2.8-2.8" /><path d="M3 10.5v2.7h10v-2.7" /></svg>
          </button>
        </div>
      <div className="graph-tree" role="tree" aria-label="图列表" ref={treeRef} onScroll={syncStuck}>
          {projectGraphs
            .filter((pg) => !pg.folderId)
            .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
            .map((pg) => (
              <button
                key={pg.id}
                className={`graph-tree-item${pg.id === activeGraphId ? ' on' : ''}`}
                style={{ paddingLeft: 22 }}
                title={pg.name}
                onClick={() => {
                  switchGraph(pg.id);
                  setSelFolder(null);
                }}
              >
                <IconFile />
                <span className="graph-tree-name">{pg.name}</span>
              </button>
            ))}
          {folderChildren(null).map((f) => renderFolder(f, 0))}
          {stuckFolder && (() => {
            const hit = folders.find((f) => f.id === stuckFolder);
            if (!hit) return null;
            return (
              <button
                className="graph-folder-sticky"
                onClick={() => toggleFolder(hit.id)}
                title="点击折叠/展开这一组"
              >
                <span className="graph-folder-caret">▾</span>
                <span className="graph-folder-sticky-name">{folderPath(hit.id)}</span>
                <span className="graph-tree-count">{countIn(hit.id)}</span>
              </button>
            );
          })()}
          {projectGraphs
            .filter((pg) => !pg.folderId)
            .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
            .map((pg) => (
              <button
                key={pg.id}
                className={`graph-tree-item${pg.id === activeGraphId ? ' on' : ''}`}
                style={{ paddingLeft: 22 }}
                title={pg.name}
                onClick={() => {
                  switchGraph(pg.id);
                  setSelFolder(null);
                }}
              >
                <IconFile />
                <span className="graph-tree-name">{pg.name}</span>
              </button>
            ))}
        </div>

      {(folderName || fileName) && (
        <div className="folder-bound" title={folderName ? '当前项目与这个文件夹双向同步' : '保存会覆盖这个 JSON 文件'}>
          <span>{folderName ? `目录：${folderName}` : `文件：${fileName}`}</span>
          {folderName && (
            <button
              className="tip"
              data-tip="从目录重新载入"
              aria-label="从目录重新载入"
              onClick={() => void reloadFolder()}
            >
              ↻
            </button>
          )}
          <button
            className="tip"
            data-tip={folderName ? '取消目录绑定' : '关闭这个文件'}
            aria-label={folderName ? '取消目录绑定' : '关闭这个文件'}
            onClick={unbindFolder}
          >
            ×
          </button>
        </div>
      )}

      <div className="search-box">
        <span className="search-icon" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
        </span>
        <input
          ref={inputRef}
          value={filter.query}
          placeholder="搜索标题 / id / 属性"
          onChange={(e) => setFilter({ query: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              jump(e.shiftKey ? -1 : 1);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setFilter({ query: '' });
            }
          }}
        />
        <button
          className="search-clear"
          title="清空搜索"
          aria-label="清空搜索"
          onClick={() => {
            setFilter({ query: '' });
            inputRef.current?.focus();
          }}
          disabled={!filter.query}
        >
          ×
        </button>
      </div>
      <div className="search-meta">
        <span>{filter.query ? `匹配 ${listed.length} / ${visible.length}` : `显示 ${visible.length} / ${graph.nodes.length}`}</span>
        {filter.query && <span className="dim">Enter 跳转</span>}
      </div>

      <div className="chips-head">
        <span>筛选</span>
        {filtering && (
          <button
            className="link"
            onClick={() => setFilter({ kinds: [], onlyIsolated: false, onlyOrphan: false })}
          >
            清除
          </button>
        )}
      </div>
      <div className="chips">
        {kinds.map((k) => (
          <button
            key={k.kind || '__none'}
            className={`chip${filter.kinds.includes(k.kind) ? ' active' : ''}`}
            onClick={() => toggleKind(k.kind)}
          >
            {k.label}
            <span className="chip-count">{k.count}</span>
          </button>
        ))}
        <button
          className={`chip${filter.onlyIsolated ? ' active' : ''}`}
          onClick={() => setFilter({ onlyIsolated: !filter.onlyIsolated })}
        >
          只看孤立
        </button>
        <button
          className={`chip${filter.onlyOrphan ? ' active' : ''}`}
          onClick={() => setFilter({ onlyOrphan: !filter.onlyOrphan })}
        >
          只看孤儿
        </button>
      </div>

      <div className="outline">
        {groups.length === 0 && <div className="hint">没有匹配的单元</div>}
        {groups.map((group) => {
          const closed = collapsed.includes(group.kind);
          return (
            <section className="kind-group" key={group.kind || '__none'}>
              <button
                className="kind-head"
                onClick={() =>
                  setCollapsed((list) =>
                    list.includes(group.kind)
                      ? list.filter((k) => k !== group.kind)
                      : [...list, group.kind],
                  )
                }
              >
                <span className={`caret${closed ? ' closed' : ''}`}>▾</span>
                <span className="kind-name">{group.label}</span>
                <span className="kind-count">{group.nodes.length}</span>
              </button>
              {!closed && (
                <ul className="outline-list">
                  {group.nodes.map((node) => (
                    <li key={node.id}>
                      <button
                        className={`outline-item${selectedNodes.includes(node.id) ? ' active' : ''}`}
                        title={node.id}
                        onClick={() => focusNode(node.id)}
                      >
                        <span className="outline-title">
                          {highlight(node.title, filter.query)}
                        </span>
                        {isolated.has(node.id) && <span className="tag">孤立</span>}
                        {orphan.has(node.id) && <span className="tag warn">孤儿</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
