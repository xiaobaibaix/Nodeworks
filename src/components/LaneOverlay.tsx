import { useMemo } from 'react';
import { useReactFlow, useStore, ViewportPortal } from '@xyflow/react';
import { laneBands } from '../model/lanes';
import type { Graph } from '../model/types';

/** 画布上的层级分区框；标题反向缩放，缩小时仍能看清并点击聚焦。 */
export default function LaneOverlay({ graph }: { graph: Graph }) {
  const bands = useMemo(() => laneBands(graph), [graph]);
  const zoom = useStore((s) => s.transform[2]);
  const { fitView } = useReactFlow();
  if (!bands.length) return null;
  const scale = Math.max(0.7, Math.min(3, 1 / zoom));
  return (
    <ViewportPortal>
      {bands.map((band) => (
        <div
          key={band.key}
          className="lane-band"
          style={{ left: band.x, top: band.y, width: band.width, height: band.height }}
        >
          <button
            type="button"
            className="lane-head"
            style={{ transform: `scale(${scale})` }}
            title={`聚焦「${band.label}」`}
            onClick={() =>
              fitView({ nodes: band.ids.map((id) => ({ id })), padding: 0.18, duration: 300, maxZoom: 1.15 })
            }
          >
            {band.label}
            <span>{band.ids.length}</span>
          </button>
        </div>
      ))}
    </ViewportPortal>
  );
}
