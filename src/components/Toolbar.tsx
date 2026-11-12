import { useReactFlow } from '@xyflow/react';
import { downloadProject, pickJsonFile } from '../persistence';
import { useCurrentGraph, useGraph } from '../store';

export default function Toolbar() {
  const addNode = useGraph((s) => s.addNode);
  const addSubgraphNode = useGraph((s) => s.addSubgraphNode);
  const preview = useGraph((s) => s.preview);
  const undo = useGraph((s) => s.undo);
  const redo = useGraph((s) => s.redo);
  const canUndo = useGraph((s) => s.past.length > 0);
  const canRedo = useGraph((s) => s.future.length > 0);
  const toastOf = useGraph((s) => s.toastOf);
  const graph = useCurrentGraph();
  const count = graph.nodes.length;
  const kinds = graph.kinds;
  const togglePalette = useGraph((s) => s.togglePalette);
  const setExportOpen = useGraph((s) => s.setExportOpen);
  const openSnapshots = useGraph((s) => s.openSnapshots);
  const autoLayout = useGraph((s) => s.autoLayout);
  const view = useGraph((s) => s.view);
  const setView = useGraph((s) => s.setView);
  const impactOn = useGraph((s) => s.impactOn);
  const setImpactOn = useGraph((s) => s.setImpactOn);
  const loadFile = useGraph((s) => s.loadFile);
  const { fitView } = useReactFlow();

  function toggleImpact() {
    if (!impactOn && useGraph.getState().selectedNodes.length !== 1) {
      toastOf('先选中一个单元，再打开影响面');
      return;
    }
    setImpactOn(!impactOn);
  }

  async function open() {
    try {
      loadFile(await pickJsonFile());
    } catch (error) {
      toastOf((error as Error).message);
    }
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
        <button onClick={() => addNode()} disabled={preview}>+ 单元</button>
        <button onClick={() => addSubgraphNode()} disabled={preview} title="新建一个空子图单元，双击进入编辑">+ 子图</button>
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
        <button onClick={() => downloadProject(useGraph.getState().currentProject())}>保存</button>
        <button onClick={open}>打开</button>
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
