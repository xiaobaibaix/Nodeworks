import { useEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  groupByKind, isolatedNodeIds, kindOptions, nodeMatches, orphanNodeIds, visibleNodes,
} from '../model/query';
import { useCurrentGraph, useGraph } from '../store';

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
  const folderName = useGraph((s) => s.folderName);
  const fileName = useGraph((s) => s.fileName);
  const unbindFolder = useGraph((s) => s.unbindFolder);
  const reloadFolder = useGraph((s) => s.reloadFolder);
  const renameGraph = useGraph((s) => s.renameGraph);
  const removeGraph = useGraph((s) => s.removeGraph);
  const { fitView } = useReactFlow();
  const activeName = projectGraphs.find((pg) => pg.id === activeGraphId)?.name ?? '';

  const [collapsed, setCollapsed] = useState<string[]>([]);
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

  const lastDragAt = useRef(0);

  useEffect(() => {
    setCursor(-1);
  }, [filter.query, filter.kinds, filter.onlyIsolated, filter.onlyOrphan]);

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

  function startDrag(kind: string) {
    return (e: React.PointerEvent<HTMLButtonElement>) => {
      // 鼠标走原生 HTML5 拖放（更可靠）；触屏/手写笔走 Pointer 拖拽。
      if (e.pointerType === 'mouse') return;
      if (e.button !== 0) return;
      e.preventDefault();
      lastDragAt.current = Date.now();
      const ghost = document.createElement('div');
      ghost.className = 'kind-ghost';
      ghost.textContent = kind === '__subgraph' ? '子图' : kind ? (graph.kinds[kind]?.name || kind) : '单元';
      document.body.appendChild(ghost);
      const move = (ev: PointerEvent) => {
        ghost.style.left = `${ev.clientX}px`;
        ghost.style.top = `${ev.clientY}px`;
      };
      move(e.nativeEvent);
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        ghost.remove();
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        if (el && el.closest('.react-flow')) {
          window.dispatchEvent(new CustomEvent('nodeworks:create-node', {
            detail: { kind, clientX: ev.clientX, clientY: ev.clientY },
          }));
        }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    };
  }

  function dragStartEvent(e: React.DragEvent<HTMLButtonElement>, kind: string) {
    lastDragAt.current = Date.now();
    e.dataTransfer.setData('text/nodeworks-kind', kind);
    e.dataTransfer.effectAllowed = 'copy';
  }

  function clickCreate(kind: string) {
    if (Date.now() - lastDragAt.current < 400) return;
    const box = document.querySelector('.react-flow')?.getBoundingClientRect();
    if (!box) {
      useGraph.getState().toastOf('先切回画布视图再创建');
      return;
    }
    window.dispatchEvent(new CustomEvent('nodeworks:create-node', {
      detail: { kind, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 },
    }));
  }

  return (
    <aside className="sidebar">
      <header className="sidebar-head">
        <span>大纲</span>
        <button className="kbd" title="命令面板" onClick={() => togglePalette(true)}>⌘K</button>
      </header>

      <div className="graph-bar" title="一个 project 管多张根图，模板共享">
        <select
          value={activeGraphId}
          aria-label="切换图"
          onChange={(e) => {
            if (e.target.value === '__new') addGraph();
            else switchGraph(e.target.value);
          }}
        >
          {projectGraphs.map((pg) => (
            <option key={pg.id} value={pg.id}>{pg.name}</option>
          ))}
          <option value="__new">＋ 新建图…</option>
        </select>
        <button
          title="重命名当前图"
          onClick={() => {
            const name = window.prompt('图名称', activeName);
            if (name) renameGraph(name);
          }}
        >
          ✎
        </button>
        <button title="删除当前图" onClick={removeGraph} disabled={projectGraphs.length <= 1}>
          −
        </button>
      </div>

      {(folderName || fileName) && (
        <div className="folder-bound" title={folderName ? '当前项目与这个文件夹双向同步' : '保存会覆盖这个 JSON 文件'}>
          <span>{folderName ? `目录：${folderName}` : `文件：${fileName}`}</span>
          {folderName && (
            <button title="从目录重新载入（外部改动后用）" onClick={() => void reloadFolder()}>↻</button>
          )}
          <button title={folderName ? '取消目录绑定' : '关闭这个文件'} onClick={unbindFolder}>×</button>
        </div>
      )}

      <div className="kind-tray" aria-label="拖到画布创建单元">
        <span className="tray-label">拖到画布 / 点击</span>
        <button className="chip" draggable onClick={() => clickCreate('')} onDragStart={(e) => dragStartEvent(e, '')} onPointerDown={startDrag('')}>单元</button>
        <button className="chip" draggable onClick={() => clickCreate('__subgraph')} onDragStart={(e) => dragStartEvent(e, '__subgraph')} onPointerDown={startDrag('__subgraph')}>子图</button>
        {Object.entries(graph.kinds).map(([key, def]) => (
          <button
            key={key}
            className="chip"
            draggable
            onDragStart={(e) => dragStartEvent(e, key)}
            onPointerDown={startDrag(key)}
            onClick={() => clickCreate(key)}
            title={`新建${def.name || key}`}
          >
            {def.name || key}
          </button>
        ))}
      </div>

      <div className="search-box">
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
        {filtering && (
          <button
            className="chip clear"
            onClick={() => setFilter({ kinds: [], onlyIsolated: false, onlyOrphan: false })}
          >
            清除
          </button>
        )}
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
