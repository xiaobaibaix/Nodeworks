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

/** 拖图时用一张“子图节点”卡片作为拖拽影像，而不是文件树行。 */
function setGraphDragImage(e: React.DragEvent, name: string, count: number) {
  const ghost = document.createElement('div');
  ghost.className = 'graph-ghost';
  const kind = document.createElement('div');
  kind.className = 'graph-ghost-kind';
  kind.textContent = '子图';
  const title = document.createElement('div');
  title.className = 'graph-ghost-title';
  title.textContent = name;
  const meta = document.createElement('div');
  meta.className = 'graph-ghost-meta';
  meta.textContent = `子图 · ${count} 个单元`;
  ghost.append(kind, title, meta);
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 24, 22);
  window.setTimeout(() => ghost.remove(), 0);
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
  const renameGraph = useGraph((s) => s.renameGraph);
  const removeGraph = useGraph((s) => s.removeGraph);
  const { fitView } = useReactFlow();
  const folders = useGraph((s) => s.folders);
  const addFolder = useGraph((s) => s.addFolder);
  const renameFolder = useGraph((s) => s.renameFolder);
  const removeFolder = useGraph((s) => s.removeFolder);
  const folderName = useGraph((s) => s.folderName);
  const fileName = useGraph((s) => s.fileName);

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
  const [stuckFolder, setStuckFolder] = useState<{ id: string; push: number } | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState(-1);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; folderId: string | null; graphId?: string } | null>(null);
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
    const stickyH = 28;
    const heads = Array.from(el.querySelectorAll<HTMLElement>('.graph-folder-head'));
    let current: string | null = null;
    let best = -Infinity;
    heads.forEach((head) => {
      const rect = head.getBoundingClientRect();
      if (rect.top > top + 1 || rect.top <= best) return;
      // 只有内容还露在吸顶条下面时，这个分组才配当吸顶标题；
      // 滚过去的是一个已经看完的空分组时，应退回上一级。
      const body = head.parentElement?.querySelector<HTMLElement>(':scope > .graph-folder-body');
      if (!body || body.getBoundingClientRect().bottom <= top + stickyH) return;
      best = rect.top;
      current = head.dataset.fid ?? null;
    });
    if (!current) {
      // 根层级分组的最后一块内容滚完后，标题不应该瞬间消失，
      // 而是像原生 section header 一样被下一个标题顶出去。
      const rootPassed = heads.filter((head) => {
        const rect = head.getBoundingClientRect();
        const fid = head.dataset.fid ?? '';
        return rect.top <= top + 1 && (folders.find((f) => f.id === fid)?.parentId ?? null) === null;
      });
      const last = rootPassed[rootPassed.length - 1];
      if (!last) { setStuckFolder(null); return; }
      const idx = heads.indexOf(last);
      const next = heads.slice(idx + 1).find((head) => head.getBoundingClientRect().top > top + 1);
      let push = 0;
      if (next) {
        const nextTop = next.getBoundingClientRect().top;
        push = Math.max(0, Math.min(stickyH, stickyH - (nextTop - top)));
      }
      setStuckFolder({ id: last.dataset.fid ?? '', push });
      return;
    }
    setStuckFolder({ id: current, push: 0 });
  };

  useEffect(() => { syncStuck(); }, [openFolders, folders]);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu]);

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
            treeRef.current?.focus();
            setSelFolder(folder.id);
            toggleFolder(folder.id);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setSelFolder(folder.id);
            setCtxMenu({ x: e.clientX, y: e.clientY, folderId: folder.id });
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
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-nodeworks-graph', pg.id);
                  e.dataTransfer.effectAllowed = 'copy';
                  setGraphDragImage(e, pg.name, pg.graph.nodes.length);
                }}
                style={{ paddingLeft: 22 + (depth + 1) * 16 }}
                title={pg.name}
                onClick={() => {
                  treeRef.current?.focus();
                  switchGraph(pg.id);
                  setSelFolder(pg.folderId ?? null);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCtxMenu({ x: e.clientX, y: e.clientY, folderId: pg.folderId ?? null, graphId: pg.id });
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

  const TREE_H_KEY = 'nodeworks.treeheight.v1';
  const [treeH, setTreeH] = useState(() => {
    if (typeof window === 'undefined') return 360;
    const saved = Number(localStorage.getItem(TREE_H_KEY));
    return Number.isFinite(saved) && saved > 100 ? saved : Math.round(window.innerHeight * 0.42);
  });
  const dragRef = useRef<{ y: number; h: number } | null>(null);
  const treeHRef = useRef(treeH);
  const applyTreeH = (h: number) => { treeHRef.current = h; setTreeH(h); };
  const clampTree = (h: number) => Math.max(120, Math.min(h, (typeof window === 'undefined' ? 900 : window.innerHeight) - 260));

  const createGraphIn = (folderId: string | null) => {
    setSelFolder(folderId);
    addGraph(undefined, folderId ?? undefined);
    setCtxMenu(null);
  };
  const createFolderIn = (folderId: string | null) => {
    const name = window.prompt('分组名称', '新分组');
    setCtxMenu(null);
    if (!name?.trim()) return;
    setSelFolder(folderId);
    addFolder(name.trim(), folderId);
  };
  const renameGraphById = (id: string) => {
    const pg = projectGraphs.find((g) => g.id === id);
    const name = window.prompt('图名称', pg?.name ?? '');
    setCtxMenu(null);
    if (!name?.trim()) return;
    if (id !== activeGraphId) switchGraph(id);
    renameGraph(name.trim());
  };
  const deleteGraphById = (id: string) => {
    setCtxMenu(null);
    if (id !== activeGraphId) switchGraph(id);
    removeGraph();
  };
  const renameFolderById = (id: string) => {
    const folder = folders.find((f) => f.id === id);
    const name = window.prompt('分组名称', folder?.name ?? '');
    setCtxMenu(null);
    if (name?.trim()) renameFolder(id, name.trim());
  };
  const deleteFolderById = (id: string) => {
    setCtxMenu(null);
    if (!window.confirm('删除这个分组？里面的图会移到上一级。')) return;
    removeFolder(id);
    setSelFolder((cur) => (cur === id ? null : cur));
  };

  return (
    <aside className="sidebar">
      <header className="sidebar-head">
        <span>大纲</span>
        <button className="kbd" title="命令面板" onClick={() => togglePalette(true)}>⌘K</button>
      </header>

      <div className="tree-tools" role="toolbar" aria-label="图列表操作">
          <span className="tree-project-name" title={folderName ?? fileName ?? '未绑定项目'}>
            {folderName ?? fileName ?? '未绑定项目'}
          </span>
          <span className="tree-tools-gap" />
          <button title="新建图（在当前选中的分组里）" aria-label="新建图" onClick={createGraphHere}>
            <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2.2h5.4l3.4 3.4v8.2H4z" /><path d="M9.4 2.2v3.4h3.4" /><path d="M6.5 9.2h4.2M8.6 7.1v4.2" /></svg>
          </button>
          <button title="全部折叠" aria-label="全部折叠" onClick={collapseAll}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5.6L8 10l5-4.4" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
          </button>
        </div>
      <div
        className="graph-tree"
        role="tree"
        aria-label="图列表"
        tabIndex={0}
        ref={treeRef}
        onScroll={syncStuck}
        style={{ height: treeH }}
        onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, folderId: null }); }}
        onKeyDown={(e) => {
          const tag = (e.target as HTMLElement).tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA') return;
          if (e.key === 'Escape') { setCtxMenu(null); return; }
          if (e.key !== 'Delete' && e.key !== 'Backspace') return;
          e.preventDefault();
          e.stopPropagation();
          if (selFolder) {
            deleteFolderById(selFolder);
          } else if (projectGraphs.length > 1) {
            removeGraph();
          }
        }}
      >
          {stuckFolder && (() => {
            const hit = folders.find((f) => f.id === stuckFolder.id);
            if (!hit) return null;
            return (
              <button
                key={hit.id}
                className="graph-folder-sticky"
                style={{ ['--push' as string]: `${stuckFolder.push}px` }}
                onClick={() => toggleFolder(hit.id)}
                title="点击折叠/展开这一组"
              >
                <span className="graph-folder-caret">▾</span>
                <IconFolder open={openFolders.has(hit.id)} />
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
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-nodeworks-graph', pg.id);
                  e.dataTransfer.effectAllowed = 'copy';
                  setGraphDragImage(e, pg.name, pg.graph.nodes.length);
                }}
                style={{ paddingLeft: 22 }}
                title={pg.name}
                onClick={() => {
                  treeRef.current?.focus();
                  switchGraph(pg.id);
                  setSelFolder(null);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCtxMenu({ x: e.clientX, y: e.clientY, folderId: pg.folderId ?? null, graphId: pg.id });
                }}
              >
                <IconFile />
                <span className="graph-tree-name">{pg.name}</span>
              </button>
            ))}
          {folderChildren(null).map((f) => renderFolder(f, 0))}

          {projectGraphs
            .filter((pg) => !pg.folderId)
            .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
            .map((pg) => (
              <button
                key={pg.id}
                className={`graph-tree-item${pg.id === activeGraphId ? ' on' : ''}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-nodeworks-graph', pg.id);
                  e.dataTransfer.effectAllowed = 'copy';
                  setGraphDragImage(e, pg.name, pg.graph.nodes.length);
                }}
                style={{ paddingLeft: 22 }}
                title={pg.name}
                onClick={() => {
                  treeRef.current?.focus();
                  switchGraph(pg.id);
                  setSelFolder(null);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCtxMenu({ x: e.clientX, y: e.clientY, folderId: pg.folderId ?? null, graphId: pg.id });
                }}
              >
                <IconFile />
                <span className="graph-tree-name">{pg.name}</span>
              </button>
            ))}
        </div>


      <div
        className="sidebar-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label="调整大纲与搜索区高度"
        title="拖动调整两栏占比，双击复位"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragRef.current = { y: e.clientY, h: treeH };
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return;
          applyTreeH(clampTree(dragRef.current.h + (e.clientY - dragRef.current.y)));
        }}
        onPointerUp={() => {
          if (!dragRef.current) return;
          dragRef.current = null;
          localStorage.setItem(TREE_H_KEY, String(treeHRef.current));
        }}
        onDoubleClick={() => {
          const h = Math.round(window.innerHeight * 0.42);
          applyTreeH(h);
          localStorage.setItem(TREE_H_KEY, String(h));
        }}
      />
      <div className="sidebar-lower">
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
      </div>
      {ctxMenu && (
        <div
          className="tree-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {ctxMenu.graphId ? (
            <>
              <button onClick={() => renameGraphById(ctxMenu.graphId!)}>重命名图</button>
              <button className="danger" onClick={() => deleteGraphById(ctxMenu.graphId!)}>删除图</button>
            </>
          ) : (
            <>
              <button onClick={() => createGraphIn(ctxMenu.folderId)}>新建图</button>
              <button onClick={() => createFolderIn(ctxMenu.folderId)}>新建分组</button>
              {!ctxMenu.folderId && (
                <button onClick={() => useGraph.getState().rebuildLevelFolders()}>按层级重建分组</button>
              )}
              {ctxMenu.folderId && <div className="tree-menu-sep" />}
              {ctxMenu.folderId && <button onClick={() => renameFolderById(ctxMenu.folderId!)}>重命名分组</button>}
              {ctxMenu.folderId && <button className="danger" onClick={() => deleteFolderById(ctxMenu.folderId!)}>删除分组</button>}
            </>
          )}
        </div>
      )}
    </aside>
  );
}
