import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { miniPreview } from '../model/preview';
import type { ResourceItem, UnitNode as UnitNodeModel } from '../model/types';
import { useGraph } from '../store';

/** 卡片图标：标成 icon 槽或名称/路径含「图标/icon」的图片资源。 */
function iconOf(node: UnitNodeModel): ResourceItem | null {
  return (node.resources ?? []).find((r) => r.type === 'image'
    && (r.slot === 'icon' || /icon|图标/i.test(`${r.label} ${r.path} ${r.file ?? ''}`))) ?? null;
}

/** 图标地址：路径本身可直接用（http/data/blob）就用路径，否则从已绑定的项目目录读文件。 */
function useIconUrl(nodeId: string, icon: ResourceItem | null): string | null {
  const folderName = useGraph((s) => s.folderName);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!icon) {
      setUrl(null);
      return;
    }
    if (/^(https?:|data:|blob:)/.test(icon.path)) {
      setUrl(icon.path);
      return;
    }
    let alive = true;
    let objectUrl: string | null = null;
    void useGraph.getState().readFolderAsset(nodeId, icon).catch(() => null).then((blob) => {
      if (!alive) return;
      // 目录里读出的 Blob 没有 MIME，<img> 不认无类型的 SVG
      const typed = blob && /\.svg$/i.test(icon.file ?? icon.path) ? new Blob([blob], { type: 'image/svg+xml' }) : blob;
      objectUrl = typed ? URL.createObjectURL(typed) : null;
      setUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [nodeId, icon, folderName]);
  return url;
}

function short(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(', ');
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function UnitNode({ id, data, selected }: NodeProps) {
  const node = data.node as UnitNodeModel;
  const dimmed = Boolean(data.dimmed);
  const matched = Boolean(data.matched);
  const impact = Boolean(data.impact);
  const ins = node.ports.filter((p) => p.dir === 'in');
  const outs = node.ports.filter((p) => p.dir === 'out');
  const props = Object.entries(node.props);
  const subgraph = node.subgraph;
  const preview = useMemo(() => (subgraph ? miniPreview(subgraph) : null), [subgraph]);
  const icon = useMemo(() => iconOf(node), [node.resources]);
  const iconUrl = useIconUrl(id, icon);
  const enterSubgraph = useGraph((s) => s.enterSubgraph);
  const select = useGraph((s) => s.select);
  const [view, setView] = useState({ tx: 0, ty: 0, k: 1 });
  const panFrom = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const moved = useRef(0);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    setView({ tx: 0, ty: 0, k: 1 });
  }, [subgraph]);

  const zoomAt = useCallback((vx: number, vy: number, factor: number) => {
    setView((v) => {
      const k = Math.min(4, Math.max(0.6, v.k * factor));
      if (k === v.k) return v;
      const ratio = k / v.k;
      const clampX = (tx: number) => Math.min(40, Math.max(40 - 200 * k - 120, tx));
      const clampY = (ty: number) => Math.min(20, Math.max(20 - 54 * k - 40, ty));
      return {
        k,
        tx: clampX(vx - (vx - v.tx) * ratio),
        ty: clampY(vy - (vy - v.ty) * ratio),
      };
    });
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = svg.getBoundingClientRect();
      const vx = ((e.clientX - rect.left) / rect.width) * 200;
      const vy = ((e.clientY - rect.top) / rect.height) * 54;
      zoomAt(vx, vy, Math.exp(-e.deltaY * 0.0015));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAt, preview]);

  const openNode = useCallback(
    (innerId: string) => {
      enterSubgraph(id);
      select([innerId], null);
    },
    [enterSubgraph, id, select],
  );
  // 端口增删后强制 React Flow 重新量 handle 位置。尺寸变化通常会自动触发，
  // 但同名高度（例如替换端口）时可能不触发，边就会因找不到 handle 而整条不画。
  const updateNodeInternals = useUpdateNodeInternals();
  const portKey = node.ports.map((p) => `${p.id}:${p.dir}`).join(',');
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, portKey, updateNodeInternals]);
  return (
    <div
      className={`unit-node${selected ? ' is-selected' : ''}${dimmed ? ' is-dim' : ''}${matched ? ' is-match' : ''}${impact ? ' is-impact' : ''}`}
    >
      <div className="unit-head">
        {iconUrl && <img className="unit-icon" src={iconUrl} alt="" draggable={false} />}
        <span className="unit-kind">{node.kind || 'unit'}</span>
        <span className="unit-title">{node.title}</span>
      </div>
      {subgraph && (
        <div
          className="unit-subgraph nodrag nopan nowheel"
          title={`子图：${subgraph.nodes.length} 个单元 / ${subgraph.edges.length} 条连线。滚轮缩放、拖动平移、点击小方块进入并选中。`}
          onPointerDown={(e) => {
            if ((e.target as Element).tagName !== 'svg') return;
            e.stopPropagation();
            e.preventDefault();
            moved.current = 0;
            panFrom.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const from = panFrom.current;
            if (!from) return;
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const dx = ((e.clientX - from.x) / rect.width) * 200;
            const dy = ((e.clientY - from.y) / rect.height) * 54;
            moved.current = Math.max(moved.current, Math.hypot(e.clientX - from.x, e.clientY - from.y));
            e.stopPropagation();
            setView((v) => ({
              ...v,
              tx: Math.min(40, Math.max(40 - 200 * v.k - 120, from.tx + dx)),
              ty: Math.min(20, Math.max(20 - 54 * v.k - 40, from.ty + dy)),
            }));
          }}
          onPointerUp={(e) => {
            if (panFrom.current) {
              panFrom.current = null;
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            }
          }}
        >
          {preview && preview.nodes.length > 0 ? (
            <svg ref={svgRef} viewBox="0 0 200 54" preserveAspectRatio="none" aria-hidden>
              <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
                {preview.edges.map((e, i) => (
                  <line key={`e${i}`} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />
                ))}
                {preview.nodes.map((n) => (
                  <rect
                    key={n.id}
                    x={n.x}
                    y={n.y}
                    width={n.w}
                    height={n.h}
                    rx={1.5}
                    fill={n.fill}
                    style={{ cursor: 'pointer' }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      moved.current = 0;
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (moved.current < 3) openNode(n.id);
                    }}
                  />
                ))}
              </g>
            </svg>
          ) : (
            <span className="unit-subgraph-empty">空子图</span>
          )}
          <span className="unit-subgraph-tag">子图 · {subgraph.nodes.length}</span>
        </div>
      )}
      <div className="unit-props">
        {props.length === 0 && <div className="unit-empty">无属性</div>}
        {props.slice(0, 6).map(([key, meta]) => (
          <div className="unit-prop" key={key}>
            <span className="k">{key}</span>
            <span className="v">{short(meta.value)}</span>
          </div>
        ))}
        {props.length > 6 && <div className="unit-empty">+{props.length - 6} 项</div>}
      </div>
      <div className="unit-ports">
        <div className="unit-port-col">
          {ins.map((port) => (
            <div className="unit-port" key={port.id}>
              <Handle type="target" position={Position.Left} id={port.id} className="unit-handle" />
              <span>{port.label}</span>
            </div>
          ))}
        </div>
        <div className="unit-port-col out">
          {outs.map((port) => (
            <div className="unit-port" key={port.id}>
              <span>{port.label}</span>
              <Handle type="source" position={Position.Right} id={port.id} className="unit-handle" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
