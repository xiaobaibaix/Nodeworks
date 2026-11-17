import { useRef } from 'react';
import { useGraph } from '../store';
import type { ResourceItem, UnitNode } from '../model/types';
import ResourceThumb from './ResourceThumb';
import { CommitArea, CommitInput } from './ResourceViews';

/**
 * 图标容器：与「视图 / 图片容器」同一套结构与外观。
 * 资源本身是一组（组名 + 描述词），组里可以放多张图标图片，每张有自己的名称与描述。
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
  const removeResource = useGraph((s) => s.removeResource);
  const setResourceView = useGraph((s) => s.setResourceView);
  const removeResourceView = useGraph((s) => s.removeResourceView);
  const importResourceFile = useGraph((s) => s.importResourceFile);
  const importResourceViewFile = useGraph((s) => s.importResourceViewFile);
  const addResourceImageView = useGraph((s) => s.addResourceImageView);
  const openGenerate = useGraph((s) => s.openGenerate);
  const addRef = useRef<HTMLInputElement>(null);
  const primaryRef = useRef<HTMLInputElement>(null);
  const replaceRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const children = resource.views ?? [];
  const hasPrimary = Boolean(resource.file || resource.path);
  const count = children.length + (hasPrimary ? 1 : 0);

  return (
    <details className="res-views" open>
      <summary>
        <span className="res-views-title">
          <span className="res-views-caret">▸</span>
          图标容器 <span className="dim">{count}</span>
        </span>
        <span
          className="res-views-actions"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <button
            type="button"
            className="icon tip gen"
            data-tip="用这个容器的描述词生成一张图标"
            aria-label="生成图标"
            onClick={() => openGenerate(node.id, resource.id)}
          >
            ✦
          </button>
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
      </summary>

      <div className="view-list">
        <section className="view-group">
          <header className="view-group-head">
            <CommitInput
              className="view-group-title"
              value={resource.label}
              placeholder="图标组名，如：默认图标 / 选中态 / 禁用态"
              onCommit={(label) => setResource(node.id, resource.id, { label })}
            />
            <span className="view-group-actions">
              <button
                type="button"
                className="icon tip gen"
                data-tip="用这个分组的描述词生成图标"
                aria-label="生成分组图标"
                onClick={() => openGenerate(node.id, resource.id)}
              >
                ✦
              </button>
              <button
                type="button"
                className="icon tip"
                data-tip="添加一张图片"
                aria-label="添加图片"
                onClick={() => addRef.current?.click()}
              >
                +
              </button>
              <button
                type="button"
                className="icon"
                title="删除这个图标容器"
                onClick={() => removeResource(node.id, resource.id)}
              >
                ×
              </button>
            </span>
          </header>
          <CommitArea
            value={resource.prompt ?? ''}
            rows={2}
            placeholder="描述这组图标：用途、风格、配色、视角…（会拼上全局「资源风格」）"
            onCommit={(prompt) => setResource(node.id, resource.id, { prompt })}
          />

          <div className="view-grid">
            {hasPrimary && (
              <div className="view-item">
                <div className="view-thumb-box">
                  <ResourceThumb nodeId={node.id} resource={resource} onOpen={() => onPreview(resource)} />
                </div>
                <span className="view-label-static">主图</span>
                <div className="view-actions">
                  <button type="button" className="icon" title="预览主图" onClick={() => onPreview(resource)}>◎</button>
                  <button type="button" className="icon" title="替换主图" onClick={() => primaryRef.current?.click()}>⇧</button>
                </div>
                <input
                  ref={primaryRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) importResourceFile(node.id, resource.id, file);
                    e.target.value = '';
                  }}
                />
              </div>
            )}

            {children.map((child, index) => (
              <div className="view-item" key={child.id}>
                <div className="view-thumb-box">
                  <ResourceThumb nodeId={node.id} resource={child} onOpen={() => onPreview(child)} />
                </div>
                <CommitInput
                  className="view-label"
                  value={child.label}
                  placeholder={`图标 ${index + 1}`}
                  onCommit={(label) => setResourceView(node.id, resource.id, child.id, { label })}
                />
                <CommitArea
                  value={child.prompt ?? ''}
                  rows={2}
                  placeholder="这张图的补充描述：视角、状态、细节…"
                  onCommit={(prompt) => setResourceView(node.id, resource.id, child.id, { prompt })}
                />
                <div className="view-actions">
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
              </div>
            ))}
          </div>
        </section>
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
    </details>
  );
}
