import { useEffect, useRef, useState } from 'react';
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

/** 多行提交：失焦提交，Esc 放弃，Ctrl/⌘+Enter 立刻提交。 */
function CommitArea({
  value,
  onCommit,
  placeholder,
  rows = 3,
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <textarea
      className="view-prompt"
      rows={rows}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setDraft(value);
          e.currentTarget.blur();
        }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.blur();
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

/** 图片容器里的一张图：缩略图 + 名称 + 预览/替换/删除。 */
function ChildCard({
  nodeId,
  resourceId,
  groupId,
  child,
  onPreview,
}: {
  nodeId: string;
  resourceId: string;
  groupId: string;
  child: ResourceItem;
  onPreview: (resource: ResourceItem) => void;
}) {
  const setChild = useGraph((s) => s.setResourceChild);
  const removeChild = useGraph((s) => s.removeResourceChild);
  const importFile = useGraph((s) => s.importResourceChildFile);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="view-item">
      <button className="view-thumb-btn" title="预览视图" onClick={() => onPreview(child)}>
        <Thumb nodeId={nodeId} resource={child} />
      </button>
      <CommitInput
        className="view-label"
        value={child.label}
        placeholder="如：正面 / 45° / 背面"
        onCommit={(label) => setChild(nodeId, resourceId, groupId, child.id, { label })}
      />
      <div className="view-actions">
        <button className="icon" title="预览视图" onClick={() => onPreview(child)}>◎</button>
        <button className="icon" title="替换图片文件" onClick={() => inputRef.current?.click()}>⇧</button>
        <button
          className="icon"
          title="删除这张图"
          onClick={() => removeChild(nodeId, resourceId, groupId, child.id)}
        >
          ×
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importFile(nodeId, resourceId, groupId, child.id, file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** 容器里的一个分组：自己的描述词 + 任意多张图片子项。 */
function GroupCard({
  node,
  resource,
  group,
  onPreview,
}: {
  node: UnitNode;
  resource: ResourceItem;
  group: ResourceItem;
  onPreview: (resource: ResourceItem) => void;
}) {
  const setView = useGraph((s) => s.setResourceView);
  const removeView = useGraph((s) => s.removeResourceView);
  const addChild = useGraph((s) => s.addResourceChild);
  const openGenerate = useGraph((s) => s.openGenerate);
  const children = group.views ?? [];

  return (
    <section className="view-group">
      <header className="view-group-head">
        <CommitInput
          className="view-group-title"
          value={group.label}
          placeholder="分组名，如：三视图 / 概念图"
          onCommit={(label) => setView(node.id, resource.id, group.id, { label })}
        />
        <span className="view-group-actions">
          <button
            className="icon tip gen"
            data-tip="用这个分组的描述词生成图片"
            aria-label="生成分组图片"
            onClick={() => openGenerate(node.id, resource.id, group.id)}
          >
            ✦
          </button>
          <button
            className="icon tip"
            data-tip="添加一张空图片"
            aria-label="添加图片"
            onClick={() => addChild(node.id, resource.id, group.id)}
          >
            +
          </button>
          <button
            className="icon"
            title="删除分组"
            onClick={() => removeView(node.id, resource.id, group.id)}
          >
            ×
          </button>
        </span>
      </header>
      <CommitArea
        value={group.prompt ?? ''}
        placeholder="描述这个分组要生成什么：如「同一台机器的正视图、侧视图、背视图，正交投影，白底，比例一致，不要透视」"
        onCommit={(prompt) => setView(node.id, resource.id, group.id, { prompt })}
      />
      {children.length > 0 ? (
        <div className="view-grid">
          {children.map((child) => (
            <ChildCard
              key={child.id}
              nodeId={node.id}
              resourceId={resource.id}
              groupId={group.id}
              child={child}
              onPreview={onPreview}
            />
          ))}
        </div>
      ) : (
        <div className="hint">还没有图片；可以生成，或点 ＋ 添加后替换文件。</div>
      )}
    </section>
  );
}

/** 资源项的图片容器：模型的概念图、三视图等；分组各自带描述词与图片。 */
export default function ResourceViews({
  node,
  resource,
  onPreview,
}: {
  node: UnitNode;
  resource: ResourceItem;
  onPreview: (resource: ResourceItem) => void;
}) {
  const addResourceGroup = useGraph((s) => s.addResourceGroup);
  const setResourceView = useGraph((s) => s.setResourceView);
  const removeResourceView = useGraph((s) => s.removeResourceView);
  const openGenerate = useGraph((s) => s.openGenerate);
  const views = resource.views ?? [];

  return (
    <details className="res-views" open={views.length > 0}>
      <summary>
        <span className="res-views-title">
          <span className="res-views-caret">▸</span>
          视图 / 图片容器 <span className="dim">{views.length}</span>
        </span>
        <span
          className="res-views-actions"
          onClick={(e) => {
            // 按钮在 summary 里：别让点击顺带展开/收起
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <button
            type="button"
            className="icon tip"
            data-tip="添加分组（一个描述词 + 多张图）"
            aria-label="添加分组"
            onClick={() => addResourceGroup(node.id, resource.id)}
          >
            +
          </button>
          <button
            type="button"
            className="icon tip gen"
            data-tip="按整个模型的描述生成概念图"
            aria-label="生成视图"
            onClick={() => openGenerate(node.id, resource.id)}
          >
            ✦
          </button>
        </span>
      </summary>
      {views.length > 0 && (
        <div className="view-list">
          {views.map((view) =>
            view.group || view.views ? (
              <GroupCard
                key={view.id}
                node={node}
                resource={resource}
                group={view}
                onPreview={onPreview}
              />
            ) : (
              <div className="view-item" key={view.id}>
                <button className="view-thumb-btn" title="预览视图" onClick={() => onPreview(view)}>
                  <Thumb nodeId={node.id} resource={view} />
                </button>
                <CommitInput
                  className="view-label"
                  value={view.label}
                  placeholder="如：正面 / 45° / 背面"
                  onCommit={(label) => setResourceView(node.id, resource.id, view.id, { label })}
                />
                <div className="view-actions">
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
            ),
          )}
        </div>
      )}
      {views.length === 0 && (
        <div className="hint">容器是空的。先加一个分组（例如「三视图」），再在分组里生成或放入图片。</div>
      )}
    </details>
  );
}
