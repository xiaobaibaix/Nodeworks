import { useEffect, useState, type ReactNode } from 'react';
import { useCurrentGraph, useGraph } from '../store';
import type { ResourceItem, UnitNode } from '../model/types';
import { hasSceneSlots, isRigged, modelChecklist } from '../model/modelTemplate';
import AssetPreview from './AssetPreview';
import ResourceTree from './ResourceTree';
import { flattenResources } from '../model/resources';

const TYPES = ['string', 'number', 'boolean', 'json'];

function IconBase({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
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

const IconPlus = () => <IconBase><path d="M8 3v10M3 8h10" /></IconBase>;
const IconIn = () => (
  <IconBase>
    <path d="M2.5 8h8M7.5 5l3 3-3 3" />
    <path d="M13.5 3v10" />
  </IconBase>
);
const IconOut = () => (
  <IconBase>
    <path d="M5.5 8h8M10.5 5l3 3-3 3" />
    <path d="M2.5 3v10" />
  </IconBase>
);

/** 分区标题：左标题、右图标操作，悬停约 0.65s 后弹出说明。 */
function SectionHead({
  title,
  count,
  note,
  children,
}: {
  title: string;
  count?: number;
  note?: string;
  children?: ReactNode;
}) {
  return (
    <div className="sec-head">
      <h3>
        {title}
        {count !== undefined && <span className="dim"> {count}</span>}
        {note && <span className="sec-note">{note}</span>}
      </h3>
      {children && <div className="sec-actions">{children}</div>}
    </div>
  );
}

function TipButton({
  tip,
  onClick,
  className,
  children,
}: {
  tip: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`icon tip${className ? ` ${className}` : ''}`}
      data-tip={tip}
      aria-label={tip}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TextCommit({
  value,
  onCommit,
  list,
}: {
  value: string;
  onCommit: (next: string) => void;
  list?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      list={list}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

/** 多行文本：本地草稿，失焦时提交，避免每敲一个字就进一次历史。 */
function ValueEditor({
  value,
  type,
  onCommit,
}: {
  value: unknown;
  type?: string;
  onCommit: (next: unknown) => void;
}) {
  const [draft, setDraft] = useState('');
  useEffect(() => {
    setDraft(type === 'json' ? JSON.stringify(value) : String(value ?? ''));
  }, [value, type]);

  if (type === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onCommit(e.target.checked)}
      />
    );
  }

  const commit = () => {
    if (type === 'number') {
      const num = Number(draft);
      if (Number.isFinite(num)) onCommit(num);
      return;
    }
    if (type === 'json') {
      try {
        onCommit(JSON.parse(draft));
      } catch {
        // 非法 JSON 不改，等用户继续编辑
      }
      return;
    }
    onCommit(draft);
  };

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function AddProp({ nodeId }: { nodeId: string }) {
  const addProp = useGraph((s) => s.addProp);
  const [name, setName] = useState('');
  const [type, setType] = useState('string');
  const [value, setValue] = useState('');

  const submit = () => {
    if (!name.trim()) return;
    let parsed: unknown = value;
    if (type === 'number') parsed = Number(value);
    if (type === 'boolean') parsed = value === 'true';
    if (type === 'json') {
      try {
        parsed = value ? JSON.parse(value) : null;
      } catch {
        parsed = value;
      }
    }
    addProp(nodeId, name, type, parsed);
    setName('');
    setValue('');
  };

  return (
    <div className="prop-add">
      <input autoFocus placeholder="属性名" value={name} onChange={(e) => setName(e.target.value)} />
      <select value={type} onChange={(e) => setType(e.target.value)}>
        {TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <input placeholder="值" value={value} onChange={(e) => setValue(e.target.value)} />
      <button onClick={submit}>+</button>
    </div>
  );
}

function ModelTemplate({ node }: { node: UnitNode }) {
  const apply = useGraph((s) => s.applyModelTemplate);
  const [rig, setRig] = useState(isRigged(node));
  const [scene, setScene] = useState(hasSceneSlots(node));

  useEffect(() => {
    setRig(isRigged(node));
    setScene(hasSceneSlots(node));
  }, [node.id, node.resources]);

  const rows = modelChecklist(node);
  const missing = rows.filter((r) => r.state === 'missing').length;

  return (
    <details className="model-template">
      <summary>
        模型通配清单
        {missing > 0 ? <em className="missing">缺 {missing}</em> : <em className="ok">基础项齐全</em>}
      </summary>
      <ul className="model-check">
        {rows.map((r) => (
          <li key={r.key} className={r.state} title={r.hint}>
            <i className="dot" />
            <span>{r.label}</span>
            <span className="group">{r.group}</span>
          </li>
        ))}
      </ul>
      <label className="check">
        <input type="checkbox" checked={rig} onChange={(e) => setRig(e.target.checked)} />
        角色（骨骼 / 蒙皮 / 动画）
      </label>
      <label className="check">
        <input type="checkbox" checked={scene} onChange={(e) => setScene(e.target.checked)} />
        场景件（LOD / 碰撞）
      </label>
      <button onClick={() => apply(node.id, { rig, scene })}>套用通配 / 补齐缺失</button>
    </details>
  );
}

export default function Inspector() {
  const graph = useCurrentGraph();
  const selectedNodes = useGraph((s) => s.selectedNodes);
  const edgeId = useGraph((s) => s.selectedEdge);
  const renameNode = useGraph((s) => s.renameNode);
  const setKind = useGraph((s) => s.setKind);
  const setProp = useGraph((s) => s.setProp);
  const removeProp = useGraph((s) => s.removeProp);
  const addPort = useGraph((s) => s.addPort);
  const setPort = useGraph((s) => s.setPort);
  const requestRemovePort = useGraph((s) => s.requestRemovePort);
  const setEdgeLabel = useGraph((s) => s.setEdgeLabel);
  const removeEdge = useGraph((s) => s.removeEdge);
  const preview = useGraph((s) => s.preview);
  const setPreview = useGraph((s) => s.setPreview);
  const enterSubgraph = useGraph((s) => s.enterSubgraph);
  const setSubgraphMap = useGraph((s) => s.setSubgraphMap);
  const [previewRes, setPreviewRes] = useState<ResourceItem | null>(null);
  const [showAddProp, setShowAddProp] = useState(false);

  const edge = edgeId ? graph.edges.find((e) => e.id === edgeId) : undefined;
  const node = selectedNodes.length === 1
    ? graph.nodes.find((n) => n.id === selectedNodes[0])
    : undefined;

  if (edge) {
    const from = graph.nodes.find((n) => n.id === edge.from.node);
    const to = graph.nodes.find((n) => n.id === edge.to.node);
    return (
      <aside className="inspector">
        <h2>连线</h2>
        {preview ? (
          <div className="field"><span>标签</span><div>{edge.label || '（无标签）'}</div></div>
        ) : (
          <label className="field">
            <span>标签</span>
            <TextCommit value={edge.label ?? ''} onCommit={(v) => setEdgeLabel(edge.id, v)} />
          </label>
        )}
        <div className="hint">
          {from?.title ?? '?'} → {to?.title ?? '?'}
          {edge.orphan ? '（孤儿边：端口已删除）' : ''}
        </div>
        {!preview && <button className="danger" onClick={() => removeEdge(edge.id)}>删除连线</button>}
      </aside>
    );
  }

  if (!node && selectedNodes.length > 1) {
    return (
      <aside className="inspector">
        <h2>多选 <span className="dim">{selectedNodes.length}</span></h2>
        <div className="hint">
          用画布上方工具条对齐、分布、复制或删除；拖动其中一个单元会带着整组一起移动。
        </div>
        <ul className="multi-list">
          {selectedNodes.slice(0, 12).map((id) => {
            const n = graph.nodes.find((x) => x.id === id);
            return n ? <li key={id}>{n.title}</li> : null;
          })}
        </ul>
        {selectedNodes.length > 12 && (
          <div className="hint">…还有 {selectedNodes.length - 12} 个</div>
        )}
      </aside>
    );
  }

  if (!node) {
    return (
      <aside className="inspector">
        <h2>检查器</h2>
        <div className="hint">
          选中一个单元查看属性、端口和模板；选中连线可以改标签。
          <br />
          快捷键：⌘K 命令面板 · ⌘C/⌘V 复制粘贴 · ⌘Z 撤销。
        </div>
      </aside>
    );
  }

  if (preview) {
    return (
      <aside className="inspector">
        <h2>单元 <span className="dim">只读预览</span></h2>
        <div className="field"><span>标题</span><div>{node.title}</div></div>
        <div className="field"><span>kind</span><div>{node.kind || '（无）'}</div></div>
        <h3>属性 <span className="dim">{Object.keys(node.props).length}</span></h3>
        <ul className="multi-list">
          {Object.entries(node.props).map(([key, meta]) => (
            <li key={key}><code>{key}</code> = {typeof meta.value === 'string' ? meta.value : JSON.stringify(meta.value)}</li>
          ))}
          {!Object.keys(node.props).length && <li className="hint">无</li>}
        </ul>
        <h3>资源 <span className="dim">{node.resources?.length ?? 0}</span></h3>
        <ul className="multi-list">
          {(node.resources ?? []).map((r) => (
            <li key={r.id}>
              {r.type} · {r.label} · <code>{r.path || '（未填路径）'}</code>
              <button className="link" onClick={() => setPreviewRes(r)}>预览</button>
            </li>
          ))}
          {!(node.resources ?? []).length && <li className="hint">无</li>}
        </ul>
        <h3>端口</h3>
        <ul className="multi-list">
          {node.ports.map((port) => (
            <li key={port.id}>{port.dir === 'in' ? 'IN' : 'OUT'} · {port.label || port.id}</li>
          ))}
        </ul>
        <button onClick={() => setPreview(false)}>退出预览以编辑</button>
        {previewRes && <AssetPreview resource={previewRes} nodeId={node?.id} onClose={() => setPreviewRes(null)} />}
      </aside>
    );
  }

  const ins = node.ports.filter((p) => p.dir === 'in');
  const outs = node.ports.filter((p) => p.dir === 'out');
  // 通配清单只挂在第一条模型资源卡片里
  const modelRes = flattenResources(node).map((x) => x.resource).find((r) => r.type === 'model');

  return (
    <aside className="inspector">
      <h2>单元</h2>
      <label className="field">
        <span>标题</span>
        <TextCommit value={node.title} onCommit={(v) => renameNode(node.id, v)} />
      </label>
      <label className="field">
        <span>kind</span>
        <TextCommit value={node.kind ?? ''} onCommit={(v) => setKind(node.id, v)} list="kind-options" />
      </label>
      <datalist id="kind-options">
        {Object.keys(graph.kinds).map((key) => (
          <option key={key} value={key} />
        ))}
      </datalist>

      <section className="sec">
        <SectionHead title="属性" count={Object.keys(node.props).length}>
          <TipButton
            tip={showAddProp ? '收起添加属性' : '添加属性'}
            className={showAddProp ? 'on' : ''}
            onClick={() => setShowAddProp((v) => !v)}
          >
            <IconPlus />
          </TipButton>
        </SectionHead>
        <div className="prop-list">
          {Object.entries(node.props).map(([key, meta]) => (
            <div className="prop-row" key={key}>
              <span className="prop-key" title={key}>{key}</span>
              <span className="prop-type">{meta.type ?? 'string'}</span>
              <ValueEditor
                value={meta.value}
                type={meta.type}
                onCommit={(next) => setProp(node.id, key, next)}
              />
              <button className="icon" title="删除属性" onClick={() => removeProp(node.id, key)}>×</button>
            </div>
          ))}
          {Object.keys(node.props).length === 0 && <div className="hint">还没有属性</div>}
        </div>
        {showAddProp && <AddProp nodeId={node.id} />}
      </section>

      <section className="sec">
        <SectionHead title="资源" count={flattenResources(node).length} />
        <ResourceTree node={node} onPreview={setPreviewRes} />
        {modelRes && <ModelTemplate node={node} />}
      </section>

      <section className="sec">
        <SectionHead title="端口" count={node.ports.length}>
          <TipButton tip="添加输入口" onClick={() => addPort(node.id, 'in')}>
            <IconIn />
          </TipButton>
          <TipButton tip="添加输出口" onClick={() => addPort(node.id, 'out')}>
            <IconOut />
          </TipButton>
        </SectionHead>
        <div className="port-list">
        {[...ins, ...outs].map((port) => (
          <div className="port-row" key={port.id}>
            <span className={`badge ${port.dir}`}>{port.dir === 'in' ? 'IN' : 'OUT'}</span>
            <TextCommit value={port.label} onCommit={(v) => setPort(node.id, port.id, { label: v })} />
            <select
              value={port.capacity}
              onChange={(e) => setPort(node.id, port.id, { capacity: e.target.value as 'one' | 'many' })}
            >
              <option value="many">多条</option>
              <option value="one">单条</option>
            </select>
            <button
              className="icon"
              title="删除端口（有连线时可改接）"
              onClick={() => requestRemovePort(node.id, port.id)}
            >
              ×
            </button>
          </div>
        ))}
        {node.ports.length === 0 && <div className="hint">还没有端口</div>}
      </div>
      </section>

      {node.subgraph && (
        <section className="sec">
          <SectionHead title="子图" note={`${node.subgraph.nodes.length} 个单元`} />
          <div className="btn-row">
            <button onClick={() => enterSubgraph(node.id)}>进入子图</button>
          </div>
          {node.ports.length > 0 && (
            <div className="map-list">
              {[...ins, ...outs].map((port) => {
                const mapped = node.subgraphMap?.[port.id];
                const innerPorts = node.subgraph!.nodes.flatMap((inner) =>
                  inner.ports
                    .filter((p) => p.dir === port.dir)
                    .map((p) => ({ node: inner, port: p })),
                );
                return (
                  <label className="map-row" key={port.id}>
                    <span className="map-outer">{port.label || port.id}</span>
                    <select
                      value={mapped ? `${mapped.node}|${mapped.port}` : ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (!value) {
                          setSubgraphMap(node.id, port.id, null);
                          return;
                        }
                        const [innerId, innerPort] = value.split('|');
                        setSubgraphMap(node.id, port.id, { node: innerId, port: innerPort });
                      }}
                    >
                      <option value="">未映射</option>
                      {innerPorts.map(({ node: inner, port: p }) => (
                        <option key={`${inner.id}|${p.id}`} value={`${inner.id}|${p.id}`}>
                          {inner.title} · {p.label || p.id}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
              <div className="hint">映射决定父端口进出子图后接到哪个内部端口。</div>
            </div>
          )}
        </section>
      )}

      {previewRes && <AssetPreview resource={previewRes} nodeId={node?.id} onClose={() => setPreviewRes(null)} />}
    </aside>
  );
}
