import { useMemo, useState } from 'react';
import { useGraph } from '../store';
import { composePrompt, isEmptyStyle, styleText, wantsPrompt, type ProjectStyle } from '../model/style';

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

/** 资源全局风格：所有图标/模型的描述词都以它为公共前提。 */
export default function StyleDialog() {
  const open = useGraph((s) => s.styleOpen);
  const setOpen = useGraph((s) => s.openStyle);
  const style = useGraph((s) => s.projectStyle);
  const setStyle = useGraph((s) => s.setProjectStyle);
  const toastOf = useGraph((s) => s.toastOf);
  const [copied, setCopied] = useState(false);

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

  const set = (patch: Partial<ProjectStyle>) => setStyle(patch);
  const preview = styleText(style);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(preview || composePrompt(style, { label: '风格基准', type: 'other' }));
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
              全项目共用的风格描述。图标、模型的生成提示词 = 这里的风格 + 每条资源自己的描述词。
            </div>
          </div>
          <div className="asset-actions">
            <button onClick={copy}>{copied ? '已复制' : '复制风格文本'}</button>
            <button className="icon" onClick={() => setOpen(false)} title="关闭">×</button>
          </div>
        </header>
        <div className="style-body">
          <Field
            label="风格名"
            hint="如：低多边形工业风 / 手绘等距图标"
            value={style.name}
            rows={1}
            onChange={(v) => set({ name: v })}
          />
          <Field
            label="风格描述"
            hint="材质、配色、光影、线条、造型语言…"
            value={style.description}
            rows={5}
            onChange={(v) => set({ description: v })}
          />
          <Field
            label="统一要求"
            hint="视角、构图、背景、分辨率、是否带描边…"
            value={style.rules}
            rows={3}
            onChange={(v) => set({ rules: v })}
          />
          <Field
            label="避免"
            hint="不希望出现的要素，如：写实照片、渐变、文字、水印"
            value={style.avoid}
            rows={2}
            onChange={(v) => set({ avoid: v })}
          />
          <div className="style-preview">
            <div className="style-preview-head">
              风格文本预览{isEmptyStyle(style) ? '（还没填）' : ''}
            </div>
            <pre>{preview || '填上面几栏后，这里会拼出可复制的风格文本。'}</pre>
          </div>
          <div className="hint">
            资源描述词覆盖：共 {stats.total} 条图片/模型资源，{stats.missing} 条还没写描述词。
            在右侧检查器里逐条填写。
          </div>
        </div>
        <footer>
          <button onClick={() => setOpen(false)}>完成</button>
        </footer>
      </div>
    </div>
  );
}
