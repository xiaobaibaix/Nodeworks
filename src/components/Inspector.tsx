import { useEffect, useState } from 'react';
import { useCurrentGraph, useGraph } from '../store';
import type { ResourceType } from '../model/types';

const TYPES = ['string', 'number', 'boolean', 'json'];

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
      <input placeholder="属性名" value={name} onChange={(e) => setName(e.target.value)} />
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

export default function Inspector() {
  const graph = useCurrentGraph();
  const selectedNodes = useGraph((s) => s.selectedNodes);
  const edgeId = useGraph((s) => s.selectedEdge);
  const renameNode = useGraph((s) => s.renameNode);
  const setKind = useGraph((s) => s.setKind);
  const setProp = useGraph((s) => s.setProp);
  const removeProp = useGraph((s) => s.removeProp);
  const addResource = useGraph((s) => s.addResource);
  const setResource = useGraph((s) => s.setResource);
  const removeResource = useGraph((s) => s.removeResource);
  const addPort = useGraph((s) => s.addPort);
  const setPort = useGraph((s) => s.setPort);
  const requestRemovePort = useGraph((s) => s.requestRemovePort);
  const removeNode = useGraph((s) => s.removeNode);
  const setEdgeLabel = useGraph((s) => s.setEdgeLabel);
  const removeEdge = useGraph((s) => s.removeEdge);
  const applyKindTemplate = useGraph((s) => s.applyKindTemplate);
  const saveAsKind = useGraph((s) => s.saveAsKind);
  const preview = useGraph((s) => s.preview);
  const setPreview = useGraph((s) => s.setPreview);
  const enterSubgraph = useGraph((s) => s.enterSubgraph);
  const setSubgraphMap = useGraph((s) => s.setSubgraphMap);

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
            <li key={r.id}>{r.type} · {r.label} · <code>{r.path || '（未填路径）'}</code></li>
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
      </aside>
    );
  }

  const ins = node.ports.filter((p) => p.dir === 'in');
  const outs = node.ports.filter((p) => p.dir === 'out');
  const def = node.kind ? graph.kinds[node.kind] : undefined;

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

      <h3>属性 <span className="dim">{Object.keys(node.props).length}</span></h3>
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
      <AddProp nodeId={node.id} />

      <h3>资源 <span className="dim">{node.resources?.length ?? 0}</span></h3>
      <div className="res-list">
        {(node.resources ?? []).map((r) => (
          <div className="res-row" key={r.id}>
            <select
              value={r.type}
              onChange={(e) => setResource(node.id, r.id, { type: e.target.value as ResourceType })}
            >
              <option value="image">图片</option>
              <option value="model">模型</option>
              <option value="audio">音频</option>
              <option value="other">其它</option>
            </select>
            <TextCommit value={r.label} onCommit={(v) => setResource(node.id, r.id, { label: v })} />
            <TextCommit value={r.path} onCommit={(v) => setResource(node.id, r.id, { path: v })} />
            <button className="icon" title="删除资源项" onClick={() => removeResource(node.id, r.id)}>×</button>
          </div>
        ))}
        {(node.resources ?? []).length === 0 && <div className="hint">还没有资源项</div>}
      </div>
      <div className="btn-row">
        <button onClick={() => addResource(node.id, 'image')}>+ 图片</button>
        <button onClick={() => addResource(node.id, 'model')}>+ 模型</button>
        <button onClick={() => addResource(node.id, 'other')}>+ 其它</button>
      </div>
      <div className="hint">资源项只登记类型、名称与相对路径（如 assets/icon.png），文件本身不进图。</div>

      <h3>端口</h3>
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
      <div className="btn-row">
        <button onClick={() => addPort(node.id, 'in')}>+ 输入口</button>
        <button onClick={() => addPort(node.id, 'out')}>+ 输出口</button>
      </div>

      <h3>模板</h3>
      <div className="btn-row">
        <button
          disabled={!def}
          title={def ? `补齐「${def.name}」的默认属性与端口` : '先在 kind 里填一个已存在的模板名'}
          onClick={() => applyKindTemplate(node.id)}
        >
          {def ? `应用模板「${def.name || node.kind}」` : '应用模板'}
        </button>
        <button
          title="把当前属性与端口存成 kind 模板，并把本单元设为该 kind"
          onClick={() => {
            const name = window.prompt('模板名称', node.kind || node.title);
            if (name) saveAsKind(node.id, name);
          }}
        >
          存为模板
        </button>
      </div>
      <div className="hint">模板只补缺省值，不覆盖已有属性和同名端口。</div>

      {node.subgraph && (
        <>
          <h3>子图 <span className="dim">{node.subgraph.nodes.length} 个单元</span></h3>
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
        </>
      )}

      <h3>危险区</h3>
      <button className="danger" onClick={() => removeNode(node.id)}>删除单元</button>
    </aside>
  );
}
