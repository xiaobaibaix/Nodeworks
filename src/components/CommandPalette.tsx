import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useReactFlow } from '@xyflow/react';
import { kindLabel } from '../model/query';
import { downloadGraph, pickGraphFile } from '../persistence';
import { useCurrentGraph, useGraph } from '../store';

interface Item {
  id: string;
  label: string;
  hint?: string;
  group: '命令' | '单元';
  /** 只读预览时隐藏会改图的命令 */
  mutates?: boolean;
  run: () => void;
}

export default function CommandPalette() {
  const open = useGraph((s) => s.paletteOpen);
  const togglePalette = useGraph((s) => s.togglePalette);
  const graph = useCurrentGraph();
  const selected = useGraph((s) => s.selectedNodes);
  const preview = useGraph((s) => s.preview);
  const { fitView } = useReactFlow();

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const store = useGraph.getState();
    const list: Item[] = [];
    list.push({ id: 'new', label: '新建单元', hint: '空白单元', group: '命令', mutates: true, run: () => store.addNode() });
    list.push({ id: 'new-subgraph', label: '新建子图单元', hint: '双击进入编辑', group: '命令', mutates: true, run: () => store.addSubgraphNode() });
    for (const [key, def] of Object.entries(graph.kinds)) {
      list.push({
        id: `new:${key}`,
        label: `从模板新建：${def.name || key}`,
        hint: key,
        group: '命令',
        mutates: true,
        run: () => store.addNode(undefined, key),
      });
    }
    list.push({ id: 'save', label: '保存到文件', hint: 'project.graph.json', group: '命令', run: () => downloadGraph(useGraph.getState().graph) });
    list.push({
      id: 'open',
      label: '打开文件…',
      group: '命令',
      mutates: true,
      run: () => {
        void pickGraphFile()
          .then((g) => {
            useGraph.getState().load(g);
            useGraph.getState().toastOf('已载入图');
          })
          .catch((error: unknown) => {
            useGraph.getState().toastOf((error as Error).message);
          });
      },
    });
    list.push({ id: 'fit', label: '适应视图', group: '命令', run: () => void fitView({ padding: 0.25, duration: 300 }) });
    list.push({ id: 'undo', label: '撤销', hint: '⌘Z', group: '命令', mutates: true, run: () => useGraph.getState().undo() });
    list.push({ id: 'redo', label: '重做', hint: '⇧⌘Z', group: '命令', mutates: true, run: () => useGraph.getState().redo() });
    list.push({ id: 'copy', label: '复制选中单元', hint: '⌘C', group: '命令', run: () => useGraph.getState().copy() });
    list.push({ id: 'paste', label: '粘贴', hint: '⌘V', group: '命令', mutates: true, run: () => useGraph.getState().paste() });
    if (selected.length === 1) {
      const node = graph.nodes.find((n) => n.id === selected[0]);
      const def = node?.kind ? graph.kinds[node.kind] : undefined;
      if (node && def) {
        list.push({
          id: 'apply-template',
          label: `应用模板「${def.name || node.kind}」到 ${node.title}`,
          group: '命令',
          mutates: true,
          run: () => store.applyKindTemplate(node.id),
        });
      }
    }
    if (graph.edges.some((e) => e.orphan)) {
      list.push({ id: 'orphans', label: '清理孤儿边', group: '命令', mutates: true, run: () => store.clearOrphans() });
    }
    if (selected.length) {
      list.push({
        id: 'delete',
        label: `删除选中 ${selected.length} 个单元`,
        group: '命令',
        mutates: true,
        run: () => useGraph.getState().removeNodes(useGraph.getState().selectedNodes),
      });
    }
    for (const node of graph.nodes) {
      list.push({
        id: `node:${node.id}`,
        label: node.title,
        hint: `${kindLabel(node.kind ?? '')} · ${node.id}`,
        group: '单元',
        run: () => {
          useGraph.getState().select([node.id], null);
          void fitView({ nodes: [{ id: node.id }], duration: 300, maxZoom: 1.15, padding: 2.2 });
        },
      });
    }
    return list;
  }, [graph, selected, fitView]);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          (!preview || !item.mutates) &&
          (!needle || `${item.label} ${item.hint ?? ''}`.toLowerCase().includes(needle)),
      ),
    [items, needle, preview],
  );

  useEffect(() => setActive(0), [needle]);
  if (!open) return null;

  const index = filtered.length ? Math.min(active, filtered.length - 1) : 0;

  const runItem = (item: Item | undefined) => {
    if (!item) return;
    togglePalette(false);
    item.run();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (filtered.length ? (a + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (filtered.length ? (a - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runItem(filtered[index]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      togglePalette(false);
    }
  };

  return (
    <div
      className="palette-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) togglePalette(false);
      }}
    >
      <div className="palette">
        <input
          ref={inputRef}
          value={query}
          placeholder="搜索命令或单元…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="palette-list">
          {filtered.length === 0 && <div className="hint palette-empty">没有匹配项</div>}
          {filtered.map((item, i) => (
            <Fragment key={item.id}>
              {(i === 0 || filtered[i - 1].group !== item.group) && (
                <div className="palette-group">{item.group}</div>
              )}
              <div
                className={`palette-item${i === index ? ' active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  runItem(item);
                }}
              >
                <span className="palette-label">{item.label}</span>
                {item.hint && <span className="palette-hint">{item.hint}</span>}
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
