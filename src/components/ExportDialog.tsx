import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_MAPPING,
  exportProject,
  importProject,
  validateMapping,
  type DryRunReport,
} from '../model/mapping';
import { downloadJson, pickJsonFile } from '../persistence';
import { useGraph } from '../store';

export default function ExportDialog() {
  const open = useGraph((s) => s.exportOpen);
  const setOpen = useGraph((s) => s.setExportOpen);
  const graph = useGraph((s) => s.graph);
  const load = useGraph((s) => s.load);
  const toast = useGraph((s) => s.toastOf);
  const mapping = useGraph((s) => s.mapping);
  const setMapping = useGraph((s) => s.setMapping);
  const resetMapping = useGraph((s) => s.resetMapping);
  const [imported, setImported] = useState<DryRunReport | null>(null);
  const [busy, setBusy] = useState(false);

  const result = useMemo(() => exportProject(graph, mapping), [graph, mapping]);

  useEffect(() => {
    if (open) setImported(null);
  }, [open]);

  if (!open) return null;

  const report = imported ?? result.report;
  const counts = imported ? imported.counts : result.report.counts;
  const blocking = report.errors > 0;

  const doExport = () => {
    downloadJson(result.project, mapping.target);
    toast(`已导出 ${mapping.target}${report.warnings ? `（${report.warnings} 条提示）` : ''}`);
    setOpen(false);
  };

  const doImport = async () => {
    setBusy(true);
    try {
      const raw = await pickJsonFile();
      const res = importProject(raw, mapping);
      if (res.report.errors > 0) {
        setImported(res.report);
        toast(`导入有 ${res.report.errors} 个错误，见列表`);
        return;
      }
      load(res.graph);
      setImported(null);
      setOpen(false);
      toast(
        `已导入 ${res.graph.nodes.length} 个单元、${res.graph.edges.length} 条连线` +
          (res.report.warnings ? `（${res.report.warnings} 条提示）` : ''),
      );
    } catch (error) {
      toast(`导入失败：${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const doLoadMapping = async () => {
    setBusy(true);
    try {
      const raw = await pickJsonFile();
      const next = validateMapping(raw);
      setMapping(next);
      setImported(null);
    } catch (error) {
      toast(`映射文件无效：${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal export-modal">
        <h2>导出契约 · {mapping.target}</h2>
        <p className="hint">
          按映射文件把当前图投影成目标格式。映射外置在源文件 src/mappings/forgeworks.mapping.json，
          也可载入自己的 export.mapping.json。先 dry-run：错误清零才能导出，提示不阻塞。
        </p>

        <div className="export-counts">
          {Object.entries(counts).map(([table, count]) => (
            <span key={table} className="count-chip">
              {table} <b>{count}</b>
            </span>
          ))}
        </div>

        {report.issues.length > 0 ? (
          <ul className="issue-list">
            {report.issues.map((issue, i) => (
              <li key={`${issue.code}-${i}`} className={issue.level}>
                <span className="issue-level">{issue.level === 'error' ? '错误' : '提示'}</span>
                <span className="issue-code">{issue.code}</span>
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ok">没有发现问题，可以导出。</p>
        )}

        <div className="modal-actions mapping-actions">
          <button onClick={() => downloadJson(mapping, 'export.mapping.json')}>下载映射</button>
          <button onClick={doLoadMapping} disabled={busy}>载入映射…</button>
          <button onClick={resetMapping} disabled={mapping.target === DEFAULT_MAPPING.target && mapping === DEFAULT_MAPPING}>
            恢复默认
          </button>
        </div>

        <div className="modal-actions">
          <button onClick={() => setOpen(false)}>取消</button>
          <button onClick={doImport} disabled={busy}>
            导入 project.json…
          </button>
          <button
            className="primary"
            onClick={doExport}
            disabled={blocking || busy}
            title={blocking ? '先修复错误再导出' : undefined}
          >
            导出 project.json
          </button>
        </div>
      </div>
    </div>
  );
}
