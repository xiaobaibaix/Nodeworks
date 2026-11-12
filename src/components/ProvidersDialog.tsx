import { useState } from 'react';
import { useGraph } from '../store';
import { CAPABILITY_LABEL, type Capability } from '../model/providers';

/** 全局生成服务设置：类似 CC Switch 的服务卡片，同一能力只有一条「启用」。 */
export default function ProvidersDialog() {
  const open = useGraph((s) => s.providersOpen);
  const setOpen = useGraph((s) => s.openProviders);
  const providers = useGraph((s) => s.providers);
  const addProvider = useGraph((s) => s.addProvider);
  const updateProvider = useGraph((s) => s.updateProvider);
  const removeProvider = useGraph((s) => s.removeProvider);
  const activateProvider = useGraph((s) => s.activateProvider);
  const [shown, setShown] = useState<Record<string, boolean>>({});

  if (!open) return null;

  const toggleShown = (id: string) => setShown((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div
      className="asset-modal"
      role="dialog"
      aria-label="生成设置"
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div className="provider-box">
        <header>
          <div>
            <h2>生成设置</h2>
            <div className="hint">
              全局 API Key 与服务，不随项目走。图片走 OpenAI 兼容的 <code>/images/generations</code>；
              3D 等能力在插件里 <code>registerGenerator</code> 注册后即可用同一个「生成」按钮。
            </div>
          </div>
          <div className="asset-actions">
            <button onClick={() => addProvider('image')}>+ 图片服务</button>
            <button onClick={() => addProvider('model3d')}>+ 3D 服务</button>
            <button className="icon" onClick={() => setOpen(false)} title="关闭">×</button>
          </div>
        </header>

        <div className="provider-body">
          {providers.length === 0 && (
            <div className="hint">
              还没有服务。先加一条图片服务，填上 Base URL、模型 id 和 API Key；例如火山 Ark 的
              Base URL 是 <code>https://ark.cn-beijing.volces.com/api/v3</code>。
            </div>
          )}
          {providers.map((p) => (
            <div key={p.id} className={`provider-card${p.active ? ' on' : ''}`}>
              <div className="provider-head">
                <input
                  className="provider-name"
                  value={p.name}
                  placeholder="服务名"
                  onChange={(e) => updateProvider(p.id, { name: e.target.value })}
                />
                <select
                  value={p.capability}
                  title="能力类型"
                  onChange={(e) => updateProvider(p.id, { capability: e.target.value as Capability })}
                >
                  {Object.entries(CAPABILITY_LABEL).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                {p.active ? (
                  <span className="provider-on">已启用</span>
                ) : (
                  <button onClick={() => activateProvider(p.id)}>启用</button>
                )}
                <button className="icon" title="删除服务" onClick={() => removeProvider(p.id)}>×</button>
              </div>

              <div className="provider-fields">
                <label>
                  <span>Base URL</span>
                  <input
                    value={p.baseUrl}
                    placeholder="https://ark.cn-beijing.volces.com/api/v3"
                    onChange={(e) => updateProvider(p.id, { baseUrl: e.target.value })}
                  />
                </label>
                <label>
                  <span>模型 id</span>
                  <input
                    value={p.model}
                    placeholder="doubao-seedream-5-0-pro"
                    onChange={(e) => updateProvider(p.id, { model: e.target.value })}
                  />
                </label>
                <label>
                  <span>API Key</span>
                  <span className="key-row">
                    <input
                      type={shown[p.id] ? 'text' : 'password'}
                      value={p.apiKey}
                      placeholder="ark-…"
                      autoComplete="off"
                      onChange={(e) => updateProvider(p.id, { apiKey: e.target.value })}
                    />
                    <button className="link" onClick={() => toggleShown(p.id)}>
                      {shown[p.id] ? '隐藏' : '显示'}
                    </button>
                  </span>
                </label>
              </div>
            </div>
          ))}
        </div>

        <footer>
          <span className="hint">密钥只保存在本机 localStorage（明文），不会写进项目文件。</span>
          <button onClick={() => setOpen(false)}>完成</button>
        </footer>
      </div>
    </div>
  );
}
