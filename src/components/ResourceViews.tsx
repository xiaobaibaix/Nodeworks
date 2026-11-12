import { useEffect, useState } from 'react';
import { useGraph } from '../store';
import type { ResourceItem, UnitNode } from '../model/types';
import { assetUrl } from './AssetPreview';

/** 单行提交输入：本地草稿，回车或失焦提交，避免每个按键都进历史。 */
function CommitInput({
  value,
  onCommit,
  placeholder,
  className,
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className={className}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

/** 视图缩略图：优先读项目目录，其次按路径取站点资源。 */
function Thumb({ nodeId, resource }: { nodeId: string; resource: ResourceItem }) {
  const folderName = useGraph((s) => s.folderName);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    void (async () => {
      const blob = await useGraph.getState().readFolderAsset(nodeId, resource).catch(() => null);
      if (!alive) return;
      if (blob) {
        made = URL.createObjectURL(blob);
        setUrl(made);
      } else {
        setUrl(assetUrl(resource.path) || null);
      }
    })();
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [nodeId, resource.id, resource.file, resource.path, folderName]);

  if (!url) return <span className="view-thumb missing">无图</span>;
  return (
    <img
      className="view-thumb"
      src={url}
      alt={resource.label}
      onError={() => setUrl(null)}
    />
  );
}

/** 资源项的图片容器：模型的各角度视图、生成图等，通用挂在任意资源项下面。 */
export default function ResourceViews({
  node,
  resource,
  onPreview,
}: {
  node: UnitNode;
  resource: ResourceItem;
  onPreview: (resource: ResourceItem) => void;
}) {
  const addResourceView = useGraph((s) => s.addResourceView);
  const setResourceView = useGraph((s) => s.setResourceView);
  const removeResourceView = useGraph((s) => s.removeResourceView);
  const importResourceViewFile = useGraph((s) => s.importResourceViewFile);
  const openGenerate = useGraph((s) => s.openGenerate);
  const views = resource.views ?? [];

  return (
    <details className="res-views" open={views.length > 0}>
      <summary>
        视图 / 图片容器 <span className="dim">{views.length}</span>
      </summary>
      {views.length > 0 && (
        <div className="view-grid">
          {views.map((view) => (
            <div className="view-item" key={view.id}>
              <button
                className="view-thumb-btn"
                title="预览视图"
                onClick={() => onPreview(view)}
              >
                <Thumb nodeId={node.id} resource={view} />
              </button>
              <CommitInput
                className="view-label"
                value={view.label}
                placeholder="如：正面 / 45° / 背面"
                onCommit={(label) => setResourceView(node.id, resource.id, view.id, { label })}
              />
              <CommitInput
                className="view-path"
                value={view.path}
                placeholder="assets/view.png"
                onCommit={(path) => setResourceView(node.id, resource.id, view.id, { path })}
              />
              <div className="view-actions">
                <label className="icon file-pick" title="导入视图文件">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) importResourceViewFile(node.id, resource.id, view.id, file);
                      e.currentTarget.value = '';
                    }}
                  />
                  ⇧
                </label>
                <button className="icon" title="预览视图" onClick={() => onPreview(view)}>◎</button>
                <button
                  className="icon"
                  title="删除视图"
                  onClick={() => removeResourceView(node.id, resource.id, view.id)}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="btn-row">
        <button onClick={() => addResourceView(node.id, resource.id)}>+ 视图</button>
        <button
          onClick={() => openGenerate(node.id, resource.id)}
          title="用全局生成服务产出图片，存为这条资源的视图"
        >
          ✦ 生成视图…
        </button>
      </div>
    </details>
  );
}
