import type React from 'react';

export const CREATE_EVENT = 'nodeworks:create-node';

export type CreateDetail = { kind: string; clientX: number; clientY: number };

export function dispatchCreate(kind: string, clientX: number, clientY: number) {
  window.dispatchEvent(new CustomEvent<CreateDetail>(CREATE_EVENT, { detail: { kind, clientX, clientY } }));
}

/** 画布区域中心；不在画布视图时返回 null。 */
export function canvasCenter(): { x: number; y: number } | null {
  const box = document.querySelector('.react-flow')?.getBoundingClientRect();
  return box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
}

/**
 * 按住模板按钮即生成一枚跟随鼠标的卡片；松手落在画布上就在该位置创建。
 * 没有移动就松手 = 点击，落在画布中央。鼠标与触屏统一走 Pointer Events。
 */
export function beginTemplateDrag(
  e: React.PointerEvent<HTMLElement>,
  kind: string,
  label: string,
  onToast?: (message: string) => void,
) {
  if (e.button !== 0) return;
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  let moved = false;

  const ghost = document.createElement('div');
  ghost.className = 'kind-ghost';
  const kindEl = document.createElement('span');
  kindEl.className = 'ghost-kind';
  kindEl.textContent = label;
  const hintEl = document.createElement('span');
  hintEl.className = 'ghost-hint';
  hintEl.textContent = '拖到画布放置';
  ghost.append(kindEl, hintEl);
  ghost.style.left = `${startX}px`;
  ghost.style.top = `${startY}px`;
  document.body.appendChild(ghost);

  const move = (ev: PointerEvent) => {
    if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 3) {
      moved = true;
      ghost.classList.add('is-moving');
    }
    ghost.style.left = `${ev.clientX}px`;
    ghost.style.top = `${ev.clientY}px`;
  };
  const finish = (ev: PointerEvent) => {
    cleanup();
    const box = document.querySelector('.react-flow')?.getBoundingClientRect();
    const inside = Boolean(
      box &&
        ev.clientX >= box.left &&
        ev.clientX <= box.right &&
        ev.clientY >= box.top &&
        ev.clientY <= box.bottom,
    );
    if (moved && inside) dispatchCreate(kind, ev.clientX, ev.clientY);
    else if (!moved) {
      const center = canvasCenter();
      if (center) dispatchCreate(kind, center.x, center.y);
      else onToast?.('先切回画布视图再创建');
    }
  };
  function cleanup() {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', cleanup);
    ghost.remove();
  }
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', cleanup);
}
