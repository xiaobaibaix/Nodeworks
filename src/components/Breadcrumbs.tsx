import { pathTrail } from '../model/path';
import { useGraph } from '../store';

export default function Breadcrumbs() {
  const path = useGraph((s) => s.path);
  const root = useGraph((s) => s.graph);
  const preview = useGraph((s) => s.preview);
  const goToPath = useGraph((s) => s.goToPath);
  const setPreview = useGraph((s) => s.setPreview);

  if (!path.length) return null;
  const trail = pathTrail(root, path);

  return (
    <div className="crumbs">
      <button className="crumb-root" onClick={() => goToPath(0)} title="回到根图">
        根图
      </button>
      {trail.map((t, i) => (
        <span className="crumb" key={t.id}>
          <span className="crumb-sep">/</span>
          {i === trail.length - 1 ? (
            <span className="crumb-current" title="当前层">{t.title}</span>
          ) : (
            <button onClick={() => goToPath(i + 1)} title={`回到「${t.title}」`}>{t.title}</button>
          )}
        </span>
      ))}
      <span className="crumb-spacer" />
      <button
        className={`crumb-preview${preview ? ' on' : ''}`}
        onClick={() => setPreview(!preview)}
        title="只读预览：隐藏编辑手柄，防止误改"
      >
        {preview ? '退出预览' : '只读预览'}
      </button>
    </div>
  );
}
