import { useRef } from 'react';
import { useGraph } from '../store';
import type { ResourceItem, ResourceType, UnitNode } from '../model/types';
import { RESOURCE_CONTAINERS, containerLabel, isContainer } from '../model/resources';
import ResourceThumb from './ResourceThumb';
import ResourceViews, { CommitArea, CommitInput } from './ResourceViews';

const GLYPH: Record<ResourceType, string> = { image: '▣', model: '◈', audio: '♪', other: '•' };

function TypeBadge({ type }: { type: ResourceType }) {
  return <span className={`res-badge ${type}`} title={containerLabel(type)}>{GLYPH[type]}</span>;
}

function ResourceNode({
  node,
  containerId,
  item,
  depth,
  onPreview,
}: {
  node: UnitNode;
  containerId: string;
  item: ResourceItem;
  depth: number;
  onPreview: (r: ResourceItem) => void;
}) {
  const setResourceView = useGraph((s) => s.setResourceView);
  const removeResourceView = useGraph((s) => s.removeResourceView);
  const importResourceViewFile = useGraph((s) => s.importResourceViewFile);
  const openGenerate = useGraph((s) => s.openGenerate);
  const fileRef = useRef<HTMLInputElement>(null);
  const kids = item.views ?? [];
  const patch = (p: Partial<Omit<ResourceItem, 'id'>>) => setResourceView(node.id, containerId, item.id, p);

  return (
    <div className="res-node" style={{ marginLeft: depth * 14 }}>
      <div className="res-node-row">
        <TypeBadge type={item.type} />
        <CommitInput
          className="res-node-name"
          value={item.label}
          placeholder="名称"
          onCommit={(label) => patch({ label })}
        />
        {item.type === 'image' && (
          <ResourceThumb nodeId={node.id} resource={item} onOpen={() => onPreview(item)} />
        )}
        <span className="res-node-actions">
          <button type="button" className="icon" title="预览" onClick={() => onPreview(item)}>◎</button>
          {item.type !== 'audio' && (
            <button
              type="button"
              className="icon gen"
              title="生成…"
              onClick={() => openGenerate(node.id, containerId, item.id)}
            >
              ✦
            </button>
          )}
          <button type="button" className="icon" title="替换文件" onClick={() => fileRef.current?.click()}>⇧</button>
          <button type="button" className="icon" title="删除" onClick={() => removeResourceView(node.id, containerId, item.id)}>×</button>
        </span>
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importResourceViewFile(node.id, containerId, item.id, f);
            e.currentTarget.value = '';
          }}
        />
      </div>
      {item.type === 'audio' ? (
        <div className="res-audio-hint">{item.path || '未选择音频文件，点 ⇧ 替换'}</div>
      ) : (
        <CommitArea
          value={item.prompt ?? ''}
          rows={2}
          placeholder={item.type === 'model' ? '描述这个模型：主体、结构、材质…' : '描述这张图：主体、构图、配色…'}
          onCommit={(prompt) => patch({ prompt })}
        />
      )}
      {(item.type === 'model' || kids.length > 0) && (
        <ResourceViews node={node} resource={item} onPreview={onPreview} />
      )}
    </div>
  );
}

function ContainerCard({
  node,
  container,
  onPreview,
}: {
  node: UnitNode;
  container: ResourceItem;
  onPreview: (r: ResourceItem) => void;
}) {
  const addResourceItem = useGraph((s) => s.addResourceItem);
  const removeResource = useGraph((s) => s.removeResource);
  const setResource = useGraph((s) => s.setResource);
  const children = container.views ?? [];

  return (
    <details className="res-tree" open>
      <summary>
        <span className="res-tree-caret">▸</span>
        <TypeBadge type={container.type} />
        <span className="res-tree-name">
          <CommitInput
            value={container.label}
            placeholder={containerLabel(container.type)}
            onCommit={(label) => setResource(node.id, container.id, { label })}
          />
        </span>
        <span className="dim">{children.length}</span>
        <span
          className="res-tree-actions"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <button type="button" className="icon tip" data-tip="添加一项" onClick={() => addResourceItem(node.id, container.type)}>+</button>
          <button type="button" className="icon tip" data-tip="删除整个容器" onClick={() => removeResource(node.id, container.id)}>×</button>
        </span>
      </summary>
      <div className="res-tree-body">
        {children.length === 0 && <div className="hint">还没有{containerLabel(container.type)}，点 + 添加</div>}
        {children.map((child) => (
          <ResourceNode
            key={child.id}
            node={node}
            containerId={container.id}
            item={child}
            depth={0}
            onPreview={onPreview}
          />
        ))}
      </div>
    </details>
  );
}

export default function ResourceTree({
  node,
  onPreview,
}: {
  node: UnitNode;
  onPreview: (r: ResourceItem) => void;
}) {
  const addResourceItem = useGraph((s) => s.addResourceItem);
  const resources = node.resources ?? [];
  const containers = resources.filter(isContainer);
  const missing = RESOURCE_CONTAINERS.filter((c) => !containers.some((x) => x.type === c.type));

  return (
    <div className="res-tree-wrap">
      {containers.map((c) => (
        <ContainerCard key={c.id} node={node} container={c} onPreview={onPreview} />
      ))}
      {missing.length > 0 && (
        <div className="res-add-buttons">
          {missing.map((m) => (
            <button key={m.type} type="button" className="chip" onClick={() => addResourceItem(node.id, m.type)}>
              ＋ {m.label}
            </button>
          ))}
        </div>
      )}
      {missing.length === 0 && <div className="hint">图标、模型、音频各一个容器；容器内可放多项。</div>}
    </div>
  );
}
