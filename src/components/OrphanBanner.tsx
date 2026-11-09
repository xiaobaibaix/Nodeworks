import { useEffect } from 'react';
import { useGraph } from '../store';

export default function OrphanBanner() {
  const orphans = useGraph((s) => s.graph.edges.filter((e) => e.orphan).length);
  const clearOrphans = useGraph((s) => s.clearOrphans);
  const toast = useGraph((s) => s.toast);
  const toastOf = useGraph((s) => s.toastOf);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => toastOf(null), 3200);
    return () => clearTimeout(timer);
  }, [toast, toastOf]);

  return (
    <>
      {orphans > 0 && (
        <div className="orphan-bar">
          有 {orphans} 条孤儿边（端口已删除）
          <button onClick={clearOrphans}>全部删除</button>
        </div>
      )}
      {toast && <div className="toast" onClick={() => toastOf(null)}>{toast}</div>}
    </>
  );
}
