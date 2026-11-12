import { useReactFlow } from '@xyflow/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { downloadProject } from '../persistence';
import { beginTemplateDrag } from './dragCreate';
import { useCurrentGraph, useGraph } from '../store';

function TIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const IconUndo = () => (
  <TIcon>
    <path d="M5.5 3.5l-3 3 3 3" />
    <path d="M2.5 6.5h6.2A4.3 4.3 0 0113 10.8V13" />
  </TIcon>
);
const IconRedo = () => (
  <TIcon>
    <path d="M10.5 3.5l3 3-3 3" />
    <path d="M13.5 6.5H7.3A4.3 4.3 0 003 10.8V13" />
  </TIcon>
);
const IconSave = () => (
  <TIcon>
    <path d="M3 2.5h7.5L13.5 5.5v8H3z" />
    <path d="M5.5 2.5v3.5h4.5V2.5" />
    <path d="M5.5 9h5v4.5h-5z" />
  </TIcon>
);
const IconNew = () => (
  <TIcon>
    <path d="M4 2h5l3 3v9H4z" />
    <path d="M9 2v3h3" />
    <path d="M8 8v4M6 10h4" />
  </TIcon>
);
const IconFolder = () => (
  <TIcon>
    <path d="M2 4.5h4L7.5 6H14v7H2z" />
  </TIcon>
);
const IconPalette = () => (
  <TIcon>
    <path d="M8 2a6 6 0 100 12c1.2 0 1.6-.9 1-1.6-.6-.8 0-1.9 1.1-1.9h.9a2 2 0 002-2A6 6 0 008 2z" />
    <circle cx="5.5" cy="8.2" r=".8" />
    <circle cx="7" cy="5.4" r=".8" />
    <circle cx="10.2" cy="5.6" r=".8" />
  </TIcon>
);
const IconKey = () => (
  <TIcon>
    <circle cx="5.5" cy="10.5" r="2.5" />
    <path d="M7.4 8.6L13 3" />
    <path d="M10.8 5.2l1.4 1.4" />
  </TIcon>
);
const IconDownload = () => (
  <TIcon>
    <path d="M8 2.5v8M5 7.5l3 3 3-3" />
    <path d="M3 13h10" />
  </TIcon>
);
const IconCamera = () => (
  <TIcon>
    <path d="M2.5 5.5h3l1-1.5h3l1 1.5h3v7h-11z" />
    <circle cx="8" cy="9" r="2.2" />
  </TIcon>
);
const IconFit = () => (
  <TIcon>
    <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
  </TIcon>
);
const IconLayout = () => (
  <TIcon>
    <rect x="6" y="2" width="4" height="3" rx=".6" />
    <rect x="2" y="11" width="4" height="3" rx=".6" />
    <rect x="10" y="11" width="4" height="3" rx=".6" />
    <path d="M8 5v3M4 11V9.5h8V11" />
  </TIcon>
);
const IconImpact = () => (
  <TIcon>
    <circle cx="8" cy="8" r="2" />
    <path d="M8 2v2M8 12v2M2 8h2M12 8h2" />
    <path d="M4.2 4.2l1.3 1.3M10.5 10.5l1.3 1.3M11.8 4.2l-1.3 1.3M5.5 10.5l-1.3 1.3" />
  </TIcon>
);

/** 纯图标按钮：延时悬浮提示，省略文字。 */
function IconButton({
  tip,
  onClick,
  disabled,
  className,
  children,
}: {
  tip: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`icon tip${className ? ` ${className}` : ''}`}
      data-tip={tip}
      aria-label={tip}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SplitButton({
  label,
  title,
  icon,
  onPrimary,
  items,
}: {
  label: string;
  title: string;
  icon: ReactNode;
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
      <button onClick={onPrimary} title={title} aria-label={label}>{icon}</button>
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
      <div className="bar-left">
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
        <span className="sep" />
        <IconButton tip="撤销（⌘Z）" onClick={undo} disabled={!canUndo || preview}>
          <IconUndo />
        </IconButton>
        <IconButton tip="重做（⌘⇧Z）" onClick={redo} disabled={!canRedo || preview}>
          <IconRedo />
        </IconButton>
        <span className="sep" />
        <SplitButton
          label="保存"
          icon={<IconSave />}
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
        <IconButton tip="新建项目（会清空当前编辑）" onClick={() => useGraph.getState().openNewProject()}>
          <IconNew />
        </IconButton>
        <SplitButton
          label="打开"
          icon={<IconFolder />}
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
        <span className="sep" />
        <IconButton className="quiet" tip="资源全局风格…" onClick={() => openStyle(true)}>
          <IconPalette />
        </IconButton>
        <IconButton className="quiet" tip="生成设置…（全局服务与 API Key）" onClick={() => openProviders(true)}>
          <IconKey />
        </IconButton>
        <IconButton className="quiet" tip="导出…（按映射，先 dry-run）" onClick={() => setExportOpen(true)}>
          <IconDownload />
        </IconButton>
        <IconButton className="quiet" tip="快照…（本地对比与回滚）" onClick={() => openSnapshots(true)}>
          <IconCamera />
        </IconButton>
        <span className="sep" />
        <IconButton
          className="quiet"
          tip="适应视图"
          onClick={() => fitView({ padding: 0.25, duration: 300 })}
        >
          <IconFit />
        </IconButton>
        <IconButton
          className="quiet"
          tip="自动布局（⌘⇧L）"
          onClick={autoLayout}
          disabled={preview}
        >
          <IconLayout />
        </IconButton>
        {view === 'graph' && (
          <IconButton
            className={`quiet${impactOn ? ' on' : ''}`}
            tip="影响面（高亮上下游依赖）"
            onClick={toggleImpact}
          >
            <IconImpact />
          </IconButton>
        )}
        <span className="count">{count} 个单元{preview ? ' · 预览' : ''}</span>
      </div>
    </header>
  );
}
