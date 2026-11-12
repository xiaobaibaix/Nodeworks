import { useEffect, useRef, useState } from 'react';
import { useCurrentGraph, useGraph } from '../store';
import { activeProvider, CAPABILITY_LABEL } from '../model/providers';
import { generateResource, type GeneratedFile } from '../model/generation';
import { composePrompt } from '../model/style';

interface ResultItem {
  file: GeneratedFile;
  url: string;
}

function toBlob(file: GeneratedFile): Blob {
  const copy = new Uint8Array(file.bytes.byteLength);
  copy.set(file.bytes);
  return new Blob([copy], { type: file.mime });
}

/** 资源项的生成对话框：提示词 → 选服务 → 生成 → 存为资源文件或视图。 */
export default function GenerateDialog() {
  const target = useGraph((s) => s.generateTarget);
  const providers = useGraph((s) => s.providers);
  const style = useGraph((s) => s.projectStyle);
  const close = useGraph((s) => s.closeGenerate);
  const openProviders = useGraph((s) => s.openProviders);
  const importResourceFile = useGraph((s) => s.importResourceFile);
  const applyGeneratedView = useGraph((s) => s.applyGeneratedView);
  const toastOf = useGraph((s) => s.toastOf);
  const graph = useCurrentGraph();

  const [providerId, setProviderId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState<ResultItem[]>([]);
  const urlsRef = useRef<string[]>([]);

  const node = target ? graph.nodes.find((n) => n.id === target.nodeId) : undefined;
  const resource = node?.resources?.find((r) => r.id === target?.resourceId);

  const clearResults = () => {
    for (const url of urlsRef.current) URL.revokeObjectURL(url);
    urlsRef.current = [];
    setItems([]);
  };

  useEffect(() => () => {
    for (const url of urlsRef.current) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    if (!target || !resource || !node) return;
    setPrompt(composePrompt(style, resource, node.title));
    setSize('');
    setError('');
    setBusy(false);
    clearResults();
    // 默认：模型优先 3D 服务，其它用图片服务；找不到就退回任意一条
    const prefer = resource.type === 'model' ? 'model3d' : 'image';
    const pick = activeProvider(providers, prefer) ?? activeProvider(providers, 'image') ?? providers[0];
    setProviderId(pick?.id ?? '');
    // 只在切换目标资源时重置，避免编辑时被服务列表刷新打断
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.nodeId, target?.resourceId]);

  if (!target || !node || !resource) return null;

  const provider = providers.find((p) => p.id === providerId);

  const run = async () => {
    if (!provider) {
      setError('先在「生成设置」里添加并启用一条服务');
      return;
    }
    setBusy(true);
    setError('');
    const result = await generateResource({ provider, prompt, size, resource });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    clearResults();
    const next = result.files.map((file) => {
      const url = URL.createObjectURL(toBlob(file));
      urlsRef.current.push(url);
      return { file, url };
    });
    setItems(next);
  };

  const applyAsResource = async (file: GeneratedFile) => {
    const chosen = new File([toBlob(file)], file.name, { type: file.mime });
    await importResourceFile(target.nodeId, target.resourceId, chosen);
    close();
  };

  const applyAsView = (file: GeneratedFile, index: number) => {
    const chosen = new File([toBlob(file)], file.name, { type: file.mime });
    applyGeneratedView(
      target.nodeId,
      target.resourceId,
      chosen,
      items.length > 1 ? `生成视图 ${index + 1}` : '生成视图',
    );
    close();
  };

  const applyAllViews = () => {
    items.forEach((item, index) => applyAsView(item.file, index));
    toastOf(`已加入 ${items.length} 个视图`);
    close();
  };

  return (
    <div
      className="asset-modal"
      role="dialog"
      aria-label="生成资源"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="generate-box">
        <header>
          <div>
            <h2>生成 · {resource.label || resource.type}</h2>
            <div className="hint">
              {node.title} · {resource.type} · 提示词已拼上全局「资源风格」
            </div>
          </div>
          <div className="asset-actions">
            <button onClick={() => { close(); openProviders(true); }}>生成设置…</button>
            <button className="icon" onClick={close} title="关闭">×</button>
          </div>
        </header>

        <div className="generate-body">
          <label className="field">
            <span>服务</span>
            <span className="generate-service">
              <select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
                {providers.length === 0 && <option value="">（还没有服务）</option>}
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.id} · {CAPABILITY_LABEL[p.capability]}{p.active ? '' : '（未启用）'}
                  </option>
                ))}
              </select>
              {provider && (
                <span className="hint">
                  {provider.model || '未填模型'} · {provider.baseUrl || '未填 Base URL'}
                </span>
              )}
            </span>
          </label>

          <label className="field">
            <span>尺寸</span>
            <input
              value={size}
              placeholder="留空用服务默认，如 1024x1024"
              onChange={(e) => setSize(e.target.value)}
            />
          </label>

          <label className="field generate-prompt">
            <span>提示词</span>
            <textarea rows={8} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </label>

          {error && <div className="generate-error">{error}</div>}

          {items.length > 0 && (
            <div className="generate-results">
              {items.map((item, index) => (
                <div className="generate-item" key={`${item.file.name}-${index}`}>
                  <img src={item.url} alt={`生成结果 ${index + 1}`} />
                  <div className="generate-item-meta">{item.file.name}</div>
                  <div className="generate-item-actions">
                    {resource.type === 'image' && (
                      <button onClick={() => void applyAsResource(item.file)}>设为资源文件</button>
                    )}
                    <button onClick={() => applyAsView(item.file, index)}>加入视图</button>
                  </div>
                </div>
              ))}
              {items.length > 1 && (
                <div className="btn-row">
                  <button onClick={applyAllViews}>全部加入视图</button>
                </div>
              )}
            </div>
          )}
        </div>

        <footer>
          <span className="hint">
            {provider && !provider.apiKey
              ? '这条服务还没填 API Key，去「生成设置」补上。'
              : '生成结果先留在内存里，保存项目文件夹时才会落盘。'}
          </span>
          <button className="generate-run" onClick={() => void run()} disabled={busy}>
            {busy ? '生成中…' : '生成'}
          </button>
        </footer>
      </div>
    </div>
  );
}
