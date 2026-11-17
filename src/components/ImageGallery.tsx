import { useRef, useState } from 'react';
import { useGraph } from '../store';
import type { ResourceItem, UnitNode } from '../model/types';
import ResourceThumb from './ResourceThumb';

/** 多行文本：失焦或 Esc 提交，⌘/Ctrl+Enter 立即提交。 */
function PromptField({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const current = editing ? draft : value;
  const commit = () => {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  };
  return (
    <textarea
      className="view-prompt img-prompt"
      value={current}
      placeholder={placeholder}
      onChange={(e) => {
        setDraft(e.target.value);
        setEditing(true);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setDraft(value);
          setEditing(false);
        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          commit();
        }
      }}
    />
  );
}

/** 单行名称：失焦提交，避免每个按键都进历史。 */
function LabelInput({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  return (
    <input
      className="img-tile-label"
      value={editing ? draft : value}
      placeholder={placeholder}
      onChange={(e) => {
        setDraft(e.target.value);
        setEditing(true);
      }}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(value);
          setEditing(false);
        }
      }}
    />
  );
}

/**
 * 图标容器：一个图片资源项里可以放多张图片。
 * 视觉与「视图 / 图片容器」一致：容器带描述词，图片各自带名称与描述。
 */
export default function ImageGallery({
  node,
  resource,
  onPreview,
}: {
  node: UnitNode;
  resource: ResourceItem;
  onPreview: (resource: ResourceItem) => void;
}) {
  const setResource = useGraph((s) => s.setResource);
  const addResourceImageView = useGraph((s) => s.addResourceImageView);
  const setResourceView = useGraph((s) => s.setResourceView);
  const removeResourceView = useGraph((s) => s.removeResourceView);
  const importResourceViewFile = useGraph((s) => s.importResourceViewFile);
  const addRef = useRef<HTMLInputElement>(null);
  const replaceRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const children = resource.views ?? [];
  const hasPrimary = Boolean(resource.file || resource.path);
  const count = children.length + (hasPrimary ? 1 : 0);

  return (
    <section className="img-gallery view-group">
      <div className="view-group-head">
        <span className="view-group-title">图标容器 <span className="dim">{count}</span></span>
        <span className="view-group-actions">
          <button
            type="button"
            className="icon tip"
            data-tip="添加一张图标图片"
            aria-label="添加图标图片"
            onClick={() => addRef.current?.click()}
          >
            +
          </button>
        </span>
      </div>

      <PromptField
        value={resource.prompt ?? ''}
        placeholder="描述这组图标：用途、风格、配色、视角…（会拼上全局「资源风格」）"
        onCommit={(prompt) => setResource(node.id, resource.id, { prompt })}
      />

      <div className="img-grid">
        {hasPrimary && (
          <div className="img-tile">
            <div className="img-tile-open">
              <ResourceThumb nodeId={node.id} resource={resource} onOpen={() => onPreview(resource)} />
            </div>
            <span className="img-tile-cap">主图</span>
          </div>
        )}
        {children.map((child, index) => (
          <div className="img-tile" key={child.id}>
            <div className="img-tile-open">
              <ResourceThumb nodeId={node.id} resource={child} onOpen={() => onPreview(child)} />
            </div>
            <LabelInput
              value={child.label}
              placeholder={`图标 ${index + 1}`}
              onCommit={(label) => setResourceView(node.id, resource.id, child.id, { label })}
            />
            <div className="img-tile-actions">
              <button type="button" className="icon" title="预览" onClick={() => onPreview(child)}>◎</button>
              <button
                type="button"
                className="icon"
                title="替换图片"
                onClick={() => replaceRefs.current[child.id]?.click()}
              >
                ⇧
              </button>
              <button
                type="button"
                className="icon"
                title="删除这张图片"
                onClick={() => removeResourceView(node.id, resource.id, child.id)}
              >
                ×
              </button>
            </div>
            <input
              ref={(el) => {
                replaceRefs.current[child.id] = el;
              }}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importResourceViewFile(node.id, resource.id, child.id, file);
                e.target.value = '';
              }}
            />
            <PromptField
              value={child.prompt ?? ''}
              placeholder="这张图的内容/视角…"
              onCommit={(prompt) => setResourceView(node.id, resource.id, child.id, { prompt })}
            />
          </div>
        ))}
        <button type="button" className="img-add" onClick={() => addRef.current?.click()} title="再添加一张图标图片">
          <span className="img-add-plus">＋</span>
          <span>图片</span>
        </button>
      </div>
      <input
        ref={addRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) addResourceImageView(node.id, resource.id, file);
          e.target.value = '';
        }}
      />
    </section>
  );
}
