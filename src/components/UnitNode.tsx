import { useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import type { UnitNode as UnitNodeModel } from '../model/types';

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
        <span className="unit-kind">{node.kind || 'unit'}</span>
        <span className="unit-title">{node.title}</span>
      </div>
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
