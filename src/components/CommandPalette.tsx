import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useReactFlow } from '@xyflow/react';
import { kindLabel } from '../model/query';
import { importProject } from '../model/mapping';
import { downloadProject, pickJsonFile } from '../persistence';
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
    list.push({
      id: 'new-project',
      label: '新建项目',
      hint: '清空当前编辑，开一张空白图',
      group: '命令',
      mutates: true,
      run: () => useGraph.getState().openNewProject(),
    });
    list.push({
      id: 'new-project-folder',
      label: '新建项目并选择文件夹…',
      hint: '新建空白项目后立刻存成目录项目',
      group: '命令',
      mutates: true,
      run: () => {
        const store = useGraph.getState();
        store.newProject();
        if (useGraph.getState().graph) void useGraph.getState().saveToFolder();
      },
    });
    list.push({
      id: 'save',
      label: '保存项目',
      hint: useGraph.getState().folderName ? '写回绑定目录' : '下载 nodeworks.project.json',
      group: '命令',
      run: () => useGraph.getState().saveCurrentProject(),
    });
    list.push({
      id: 'save-file',
      label: '下载项目文件…',
      hint: 'nodeworks.project.json',
      group: '命令',
      run: () => downloadProject(useGraph.getState().currentProject()),
    });
    list.push({
      id: 'open',
      label: '打开单文件项目…',
      group: '命令',
      mutates: true,
      run: () => {
        void pickJsonFile()
          .then((raw) => useGraph.getState().loadFile(raw))
          .catch((error: unknown) => {
            useGraph.getState().toastOf((error as Error).message);
          });
      },
    });
    list.push({
      id: 'open-folder',
      label: '打开项目文件夹…',
      hint: '选择含 project.json 的文件夹',
      group: '命令',
      mutates: true,
      run: () => {
        void useGraph.getState().openFolder();
      },
    });
    list.push({
      id: 'save-folder',
      label: '另存为目录项目…',
      hint: 'project.json + graphs/ + nodes/',
      group: '命令',
      run: () => {
        void useGraph.getState().saveToFolder();
      },
    });
    list.push({
      id: 'export-project',
      label: '导出契约（dry-run）',
      hint: 'Forgeworks project.json',
      group: '命令',
      run: () => useGraph.getState().setExportOpen(true),
    });
    list.push({
      id: 'graph-import',
      label: '导入图…',
      hint: '选择 graph JSON，加入当前项目',
      group: '命令',
      mutates: true,
      run: () => void useGraph.getState().importGraph(),
    });
    list.push({
      id: 'graph-new',
      label: '新建图',
      hint: '同一 project，模板共享',
      group: '命令',
      mutates: true,
      run: () => useGraph.getState().addGraph(),
    });
    list.push({
      id: 'graph-rename',
      label: '重命名当前图…',
      group: '命令',
      run: () => {
        const st = useGraph.getState();
        const current = st.projectGraphs.find((pg) => pg.id === st.activeGraphId);
        const name = window.prompt('图名称', current?.name ?? '');
        if (name) st.renameGraph(name);
      },
    });
    list.push({
      id: 'graph-delete',
      label: '删除当前图…',
      hint: '至少保留一张',
      group: '命令',
      mutates: true,
      run: () => useGraph.getState().removeGraph(),
    });
    list.push({
      id: 'snapshots',
      label: '快照与回滚…',
      hint: '本地版本副本',
      group: '命令',
      run: () => useGraph.getState().openSnapshots(true),
    });
    list.push({
      id: 'snapshot-save',
      label: '保存当前快照',
      hint: '整图副本，可回滚',
      group: '命令',
      run: () => useGraph.getState().takeSnapshot(),
    });
    list.push({
      id: 'import-project',
      label: '导入 project.json…',
      hint: '按附录 A 反向导入',
      group: '命令',
      mutates: true,
      run: () => {
        void pickJsonFile()
          .then((raw) => {
            const res = importProject(raw, useGraph.getState().mapping);
            if (res.report.errors > 0) {
              useGraph.getState().toastOf(`导入有 ${res.report.errors} 个错误，未载入`);
              return;
            }
            useGraph.getState().load(res.graph);
            useGraph.getState().toastOf(
              `已导入 ${res.graph.nodes.length} 个单元` +
                (res.report.warnings ? `（${res.report.warnings} 条提示）` : ''),
            );
          })
          .catch((error: unknown) => {
            useGraph.getState().toastOf((error as Error).message);
          });
      },
    });
    list.push({
      id: 'auto-layout',
      label: '自动布局（分层）',
      hint: '⌘⇧L',
      group: '命令',
      mutates: true,
      run: () => useGraph.getState().autoLayout(),
    });
    list.push({ id: 'fit', label: '适应视图', group: '命令', run: () => { useGraph.getState().setView('graph'); void fitView({ padding: 0.25, duration: 300 }); } });
    list.push({ id: 'view-graph', label: '切换到画布视图', group: '命令', run: () => useGraph.getState().setView('graph') });
    list.push({ id: 'view-table', label: '切换到表格视图', hint: '批量编辑属性', group: '命令', run: () => useGraph.getState().setView('table') });
    list.push({
      id: 'impact',
      label: '影响面：高亮上下游',
      hint: selected.length === 1 ? '只读派生' : '先选一个单元',
      group: '命令',
      run: () => {
        if (useGraph.getState().selectedNodes.length !== 1) {
          useGraph.getState().toastOf('先选中一个单元，再打开影响面');
          return;
        }
        useGraph.getState().setImpactOn(!useGraph.getState().impactOn);
      },
    });
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
          const store = useGraph.getState();
          store.select([node.id], null);
          store.setView('graph');
          store.setFocus(node.id);
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
