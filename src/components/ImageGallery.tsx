import { useRef } from 'react';
import { useGraph } from '../store';
import type { ResourceItem, UnitNode } from '../model/types';
import ResourceThumb from './ResourceThumb';

/**
 * 图片资源容器：一个图标项里可以放多张图片。
 * 资源自身的文件是第一张（主图），额外图片存在 views 里，各自可预览/替换/删除。
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
  const addResourceImageView = useGraph((s) => s.addResourceImageView);
  const removeResourceView = useGraph((s) => s.removeResourceView);
  const importResourceViewFile = useGraph((s) => s.importResourceViewFile);
  const addRef = useRef<HTMLInputElement>(null);
  const replaceRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const children = resource.views ?? [];
  const hasPrimary = Boolean(resource.file || resource.path);

  return (
    <div className="img-gallery">
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
            <div className="img-tile-actions">
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
            <span className="img-tile-cap" title={child.label}>{child.label || `图片 ${index + 1}`}</span>
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
      <div className="hint">图标容器：可以放多张图，每张都能单独预览、替换或删除。</div>
    </div>
  );
}
