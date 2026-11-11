import { useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import { alignRects, distributeRects, type AlignMode, type Rect } from '../model/layout';
import { useCurrentGraph, useGraph } from '../store';

export default function MultiBar() {
  const graph = useCurrentGraph();
  const selected = useGraph((s) => s.selectedNodes);
  const preview = useGraph((s) => s.preview);
  const moveNodes = useGraph((s) => s.moveNodes);
  const copy = useGraph((s) => s.copy);
  const removeNodes = useGraph((s) => s.removeNodes);
  const { getNodes } = useReactFlow();

  const rects = useMemo<Rect[]>(() => {
    if (selected.length < 2) return [];
    const picked = new Set(selected);
    const measured = new Map(getNodes().map((n) => [n.id, n.measured]));
    return graph.nodes
      .filter((n) => picked.has(n.id))
      .map((n) => {
        const size = measured.get(n.id);
        return {
          id: n.id,
          x: n.pos.x,
          y: n.pos.y,
          w: size?.width ?? 240,
          h: size?.height ?? 120,
        };
      });
  }, [selected, graph, getNodes]);

  if (preview || selected.length < 2 || rects.length < 2) return null;

  const align = (mode: AlignMode, label: string) => {
    moveNodes(alignRects(rects, mode), label);
  };
  const distribute = (axis: 'x' | 'y', label: string) => {
    moveNodes(distributeRects(rects, axis), label);
  };

  return (
    <div className="multi-bar">
      <span className="multi-count">已选 {selected.length}</span>
      <span className="multi-sep" />
      <button title="左对齐" onClick={() => align('left', '左对齐')}>左</button>
      <button title="水平居中" onClick={() => align('hcenter', '水平居中')}>中</button>
      <button title="右对齐" onClick={() => align('right', '右对齐')}>右</button>
      <span className="multi-sep" />
      <button title="顶对齐" onClick={() => align('top', '顶对齐')}>上</button>
      <button title="垂直居中" onClick={() => align('vcenter', '垂直居中')}>中</button>
      <button title="底对齐" onClick={() => align('bottom', '底对齐')}>下</button>
      <span className="multi-sep" />
      <button
        title="水平等距分布"
        disabled={rects.length < 3}
        onClick={() => distribute('x', '水平分布')}
      >
        横分布
      </button>
      <button
        title="垂直等距分布"
        disabled={rects.length < 3}
        onClick={() => distribute('y', '垂直分布')}
      >
        纵分布
      </button>
      <span className="multi-sep" />
      <button onClick={copy}>复制</button>
      <button className="danger" onClick={() => removeNodes(selected)}>删除</button>
    </div>
  );
}
