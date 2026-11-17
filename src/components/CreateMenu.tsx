import { useEffect, useRef } from 'react';
import { beginTemplateDrag } from './dragCreate';
import type { Graph } from '../model/types';

interface Props {
  x: number;
  y: number;
  kinds: Graph['kinds'];
  onClose: () => void;
  onToast?: (message: string) => void;
}

/** 画布右键菜单：点一下在该位置创建，或按住拖到画布任意位置。 */
export function CreateMenu({ x, y, kinds, onClose, onToast }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const options: { kind: string; label: string }[] = [
    { kind: '', label: '单元' },
    { kind: '__subgraph', label: '子图' },
    ...Object.entries(kinds)
      .filter(([key]) => key !== '子图')
      .map(([key, def]) => ({ kind: key, label: def.name || key })),
  ];

  return (
    <div
      ref={ref}
      className="create-menu"
      style={{ left: x, top: y }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="create-menu-title">在画布放置</div>
      {options.map((option) => (
        <button
          key={option.kind || '__unit'}
          className="create-menu-item"
          role="menuitem"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            onClose();
            beginTemplateDrag(event, option.kind, option.label, onToast, { clientX: x, clientY: y });
          }}
        >
          {option.label}
        </button>
      ))}
      <div className="create-menu-hint">点击放到这里 · 按住可拖出</div>
    </div>
  );
}
