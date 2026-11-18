import { useEffect, useMemo, useState } from 'react';
import { useGraph } from '../store';
import {
  EMPTY_PRESET,
  composePrompt,
  isEmptyStyle,
  presetOf,
  wantsPrompt,
  type ProjectStyle,
  type StylePreset,
} from '../model/style';

function Field({
  label,
  hint,
  value,
  rows,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  rows: number;
  onChange: (next: string) => void;
}) {
  return (
    <label className="field style-field">
      <span>{label}</span>
      <textarea
        rows={rows}
        value={value}
        placeholder={hint}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function newPresetName(presets: StylePreset[]): string {
  for (let i = 1; i < 100; i += 1) {
    const name = `主题 ${i}`;
    if (!presets.some((p) => p.name === name)) return name;
  }
  return `主题 ${Date.now().toString(36)}`;
}

/** 资源风格库：多个可复用主题，资源项只存主题 id，生成时实时拼提示词。 */
export default function StyleDialog() {
  const open = useGraph((s) => s.styleOpen);
  const setOpen = useGraph((s) => s.openStyle);
  const style = useGraph((s) => s.projectStyle);
  const setStyle = useGraph((s) => s.setProjectStyle);
  const toastOf = useGraph((s) => s.toastOf);
  const [copied, setCopied] = useState(false);
  const [curId, setCurId] = useState(style.defaultId);

  useEffect(() => {
    if (!style.presets.some((p) => p.id === curId)) setCurId(style.defaultId);
  }, [style.presets, style.defaultId, curId]);

  const stats = useMemo(() => {
    if (!open) return { total: 0, missing: 0 };
    const project = useGraph.getState().currentProject();
    let total = 0;
    let missing = 0;
    for (const pg of project.graphs) {
      for (const node of pg.graph.nodes) {
        for (const r of node.resources ?? []) {
          if (!wantsPrompt(r.type)) continue;
          total += 1;
          if (!r.prompt?.trim()) missing += 1;
        }
      }
    }
    return { total, missing };
  }, [open, style]);

  if (!open) return null;

  const cur = presetOf(style, curId);
  const isDefault = cur.id === style.defaultId;
  const preview = composePrompt(style, { label: '风格基准', type: 'other', styleId: cur.id })
    .split('\n')
    .filter((line) => !line.startsWith('【主体】'))
    .join('\n');

  const patchStyle = (patch: Partial<ProjectStyle>) => setStyle(patch);
  const update = (patch: Partial<StylePreset>) => {
    patchStyle({ presets: style.presets.map((p) => (p.id === cur.id ? { ...p, ...patch } : p)) });
  };

  const addPreset = () => {
    const id = `s_${Date.now().toString(36)}`;
    const name = newPresetName(style.presets);
    patchStyle({ presets: [...style.presets, { ...EMPTY_PRESET, id, name }] });
    setCurId(id);
  };

  const duplicate = () => {
    const id = `s_${Date.now().toString(36)}`;
    patchStyle({ presets: [...style.presets, { ...cur, id, name: `${cur.name} 副本` }] });
    setCurId(id);
  };

  const remove = () => {
    if (style.presets.length <= 1) {
      toastOf('至少保留一个风格主题');
      return;
    }
    const rest = style.presets.filter((p) => p.id !== cur.id);
    const defaultId = style.defaultId === cur.id ? rest[0].id : style.defaultId;
    patchStyle({ presets: rest, defaultId });
    setCurId(defaultId);
    toastOf(`已删除主题「${cur.name || '未命名主题'}」`);
  };

  const makeDefault = () => {
    patchStyle({ defaultId: cur.id });
    toastOf(`默认风格已设为「${cur.name || '未命名主题'}」`);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(preview);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toastOf('复制失败，请手动选中文本复制');
    }
  };

  return (
    <div className="asset-modal" role="dialog" aria-label="资源风格" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="style-box">
        <header>
          <div>
            <h2>资源风格</h2>
            <div className="hint">
              所有图标/模型共用这些主题。生成提示词 = 主题（全局风格 + 统一要求 + 避免）+ 这条资源自己的描述。
            </div>
          </div>
          <div className="asset-actions">
            <button onClick={copy}>{copied ? '已复制' : '复制当前主题'}</button>
            <button className="icon" onClick={() => setOpen(false)} title="关闭">×</button>
          </div>
        </header>

        <div className="style-preset-bar">
          <label className="style-preset-pick">
            <span>主题</span>
            <select value={cur.id} onChange={(e) => setCurId(e.target.value)}>
              {style.presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || '未命名主题'}{p.id === style.defaultId ? '（默认）' : ''}
                </option>
              ))}
            </select>
          </label>
          <button onClick={addPreset} title="新建一个空主题">＋ 新建</button>
          <button onClick={duplicate} title="复制当前主题">⧉ 复制</button>
          <button onClick={remove} disabled={style.presets.length <= 1} title="删除当前主题">× 删除</button>
          <button onClick={makeDefault} disabled={isDefault} className={isDefault ? 'on' : ''}>
            {isDefault ? '✓ 默认主题' : '设为默认'}
          </button>
        </div>

        <div className="style-body">
          <label className="field style-field">
            <span>主题名</span>
            <input
              value={cur.name}
              placeholder="如：低多边形工业风 / 手绘等距图标"
              onChange={(e) => update({ name: e.target.value })}
            />
          </label>
          <Field
            label="风格描述"
            hint="材质、配色、光影、线条、造型语言…"
            value={cur.description}
            rows={5}
            onChange={(v) => update({ description: v })}
          />
          <Field
            label="统一要求"
            hint="视角、构图、背景、描边、圆角、朝向/居中、分辨率…"
            value={cur.rules}
            rows={4}
            onChange={(v) => update({ rules: v })}
          />
          <Field
            label="避免"
            hint="不希望出现的要素，如：写实照片、渐变、文字、水印"
            value={cur.avoid}
            rows={2}
            onChange={(v) => update({ avoid: v })}
          />
          <div className="style-stats">
            已登记 {stats.total} 条图片/模型资源，其中 {stats.missing} 条还没写自己的描述。
          </div>
          <div className="style-preview">
            <div className="style-preview-head">
              主题文本预览{isEmptyStyle(style) ? '（还没填）' : ''}
            </div>
            <pre>{preview || '填上面几栏后，这里会拼出可复制的主题文本。'}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
