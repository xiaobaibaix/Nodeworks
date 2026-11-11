import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { UnitPort } from '../model/types';

interface BoundaryData {
  side: 'in' | 'out';
  title: string;
  ports: UnitPort[];
  mapped: string[];
}

/**
 * 子图层里的“外层端口”代理：把父图挂在子图卡片上的端口显示进来。
 * 它不存进图数据，只用于可视化和接线（接线会写成 subgraphMap）。
 */
export default function BoundaryNode({ data }: NodeProps) {
  const d = data as unknown as BoundaryData;
  return (
    <div className={`outer-node is-${d.side}`}>
      <div className="outer-head">
        <span className="outer-tag">{d.side === 'in' ? '外层输入' : '外层输出'}</span>
        <span className="outer-title" title={d.title}>{d.title}</span>
      </div>
      <div className="outer-ports">
        {d.ports.length === 0 && <div className="outer-empty">外层没有端口</div>}
        {d.ports.map((port) => (
          <div className={`outer-port${d.mapped.includes(port.id) ? ' is-mapped' : ''}`} key={port.id}>
            {d.side === 'out' && (
              <Handle type="target" position={Position.Left} id={port.id} className="unit-handle" />
            )}
            <span>{port.label}</span>
            {d.side === 'in' && (
              <Handle type="source" position={Position.Right} id={port.id} className="unit-handle" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
