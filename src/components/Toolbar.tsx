import { useReactFlow } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';
import { downloadProject } from '../persistence';
import { beginTemplateDrag } from './dragCreate';
import { useCurrentGraph, useGraph } from '../store';

function SplitButton({
  label,
  title,
  onPrimary,
  items,
}: {
  label: string;
  title: string;
  onPrimary: () => void;
  items: { label: string; hint?: string; run: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="split" ref={ref}>
      <button onClick={onPrimary} title={title}>{label}</button>
      <button
        className="caret"
        aria-label={`${label}的其他方式`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ▾
      </button>
      {open && (
        <div className="menu" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.run();
              }}
            >
              <span>{item.label}</span>
              {item.hint && <small>{item.hint}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Toolbar() {
  const addNode = useGraph((s) => s.addNode);
  const toastOf = useGraph((s) => s.toastOf);
  const preview = useGraph((s) => s.preview);
  const undo = useGraph((s) => s.undo);
  const redo = useGraph((s) => s.redo);
  const canUndo = useGraph((s) => s.past.length > 0);
  const canRedo = useGraph((s) => s.future.length > 0);
  const graph = useCurrentGraph();
  const count = graph.nodes.length;
  const kinds = graph.kinds;
  const togglePalette = useGraph((s) => s.togglePalette);
  const setExportOpen = useGraph((s) => s.setExportOpen);
  const openStyle = useGraph((s) => s.openStyle);
  const openProviders = useGraph((s) => s.openProviders);
  const openSnapshots = useGraph((s) => s.openSnapshots);
  const autoLayout = useGraph((s) => s.autoLayout);
  const view = useGraph((s) => s.view);
  const setView = useGraph((s) => s.setView);
  const impactOn = useGraph((s) => s.impactOn);
  const setImpactOn = useGraph((s) => s.setImpactOn);
  const folderName = useGraph((s) => s.folderName);
  const fileName = useGraph((s) => s.fileName);
  const { fitView } = useReactFlow();

  function toggleImpact() {
    if (!impactOn && useGraph.getState().selectedNodes.length !== 1) {
      toastOf('先选中一个单元，再打开影响面');
      return;
    }
    setImpactOn(!impactOn);
  }

  return (
    <header className="bar">
      <div className="brand">
        <span className="dot" />
        Nodeworks
        <span className="sub">单元节点编辑器</span>
      </div>
      <div className="view-switch" role="group" aria-label="视图">
        <button
          className={view === 'graph' ? 'on' : ''}
          onClick={() => setView('graph')}
          title="画布视图"
        >
          图
        </button>
        <button
          className={view === 'table' ? 'on' : ''}
          onClick={() => setView('table')}
          title="表格投影：批量编辑属性"
        >
          表格
        </button>
      </div>
      <div className="bar-actions">
        <button onPointerDown={(e) => beginTemplateDrag(e, '', '单元', toastOf)} disabled={preview}>+ 单元</button>
        <button onPointerDown={(e) => beginTemplateDrag(e, '__subgraph', '子图', toastOf)} disabled={preview} title="按住拖到画布放置；单击则落在中央">+ 子图</button>
        <select
          className="template-pick"
          value=""
          disabled={preview}
          title="从模板新建"
          onChange={(e) => {
            const key = e.target.value;
            if (key) addNode(undefined, key);
          }}
        >
          <option value="">模板…</option>
          {Object.entries(kinds).map(([key, def]) => (
            <option key={key} value={key}>{def.name || key}</option>
          ))}
        </select>
        <button className="kbd" title="命令面板 (⌘K)" onClick={() => togglePalette(true)}>⌘K</button>
        <button onClick={undo} disabled={!canUndo || preview}>撤销</button>
        <button onClick={redo} disabled={!canRedo || preview}>重做</button>
        <span className="sep" />
        <SplitButton
          label="保存"
          title={folderName
            ? `写回目录「${folderName}」（⌘S）`
            : fileName
              ? `覆盖文件「${fileName}」（⌘S）`
              : '保存项目（⌘S）：首次保存会选一次项目文件夹'}
          onPrimary={() => useGraph.getState().saveCurrentProject()}
          items={[
            {
              label: '下载 JSON 备份…',
              hint: 'nodeworks.project.json；仅数据，不含资源文件',
              run: () => downloadProject(useGraph.getState().currentProject()),
            },
            {
              label: '另存为目录项目…',
              hint: 'project.json + graphs/ + nodes/，资源随目录读取',
              run: () => void useGraph.getState().saveToFolder(),
            },
          ]}
        />
        <button onClick={() => useGraph.getState().openNewProject()} title="新建项目（会清空当前编辑）">新建</button>
        <SplitButton
          label="打开"
          title="打开项目文件夹（推荐：资源随目录读取）"
          onPrimary={() => void useGraph.getState().openFolder()}
          items={[
            {
              label: '打开项目文件夹…',
              hint: '推荐 · 资源文件随目录读取',
              run: () => void useGraph.getState().openFolder(),
            },
            {
              label: '打开单文件 .json…',
              hint: '只有数据，不含资源文件',
              run: () => void useGraph.getState().openProjectFile(),
            },
          ]}
        />
        <button onClick={() => openStyle(true)} title="资源全局风格：图标/模型描述词的公共前提">
          资源风格…
        </button>
        <button onClick={() => openProviders(true)} title="全局生成服务与 API Key（类似 CC Switch）">
          生成设置…
        </button>
        <button onClick={() => setExportOpen(true)} title="按映射导出为 project.json（先 dry-run）">
          导出…
        </button>
        <button onClick={() => openSnapshots(true)} title="本地快照：对比、回滚（可撤销）">
          快照…
        </button>
        <span className="sep" />
        <button onClick={() => fitView({ padding: 0.25, duration: 300 })}>适应视图</button>
        <button onClick={autoLayout} disabled={preview} title="按依赖分层重新排列（⌘⇧L，可撤销）">
          自动布局
        </button>
        {view === 'graph' && (
          <button
            className={impactOn ? 'on' : ''}
            onClick={toggleImpact}
            title="高亮选中单元的上下游依赖（只读）"
          >
            影响面
          </button>
        )}
        <span className="count">{count} 个单元{preview ? ' · 预览' : ''}</span>
      </div>
    </header>
  );
}
