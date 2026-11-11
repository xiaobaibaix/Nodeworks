import { useEffect, useMemo, useRef, useState } from 'react';
import {
  cellText, columnsOf, filterNodes, groupNodes, parseCell, sortNodes, type TableColumn,
} from '../model/table';
import { visibleNodes } from '../model/query';
import { useCurrentGraph, useGraph } from '../store';
import type { UnitNode } from '../model/types';

function CellInput({
  value,
  onCommit,
  inputMode,
}: {
  value: string;
  onCommit: (next: string) => void;
  inputMode?: 'text' | 'decimal';
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const cancel = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  return (
    <input
      className="cell-input"
      value={editing ? draft : value}
      inputMode={inputMode}
      onFocus={() => {
        setEditing(true);
        setDraft(value);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (cancel.current) {
          cancel.current = false;
          setDraft(value);
          return;
        }
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

interface RowProps {
  row: UnitNode;
  columns: TableColumn[];
  kinds: string[];
  selected: boolean;
  onToggle: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onKind: (id: string, kind: string) => void;
  onProp: (nodeId: string, column: TableColumn, text: string) => void;
  onLocate: () => void;
}

function Row({ row, columns, kinds, selected, onToggle, onRename, onKind, onProp, onLocate }: RowProps) {
  const kindList = [...new Set([...(row.kind ? [row.kind] : []), ...kinds])];
  return (
    <tr className={`grid-row${selected ? ' selected' : ''}`} onDoubleClick={onLocate}>
      <td className="check">
        <input type="checkbox" checked={selected} onChange={() => onToggle(row.id)} />
      </td>
      {columns.map((column) => {
        if (column.kind === 'title') {
          return (
            <td key={column.key} className="cell">
              <CellInput value={row.title} onCommit={(text) => onRename(row.id, text)} />
            </td>
          );
        }
        if (column.kind === 'kind') {
          return (
            <td key={column.key} className="cell">
              <select
                className="cell-select"
                value={row.kind ?? ''}
                onChange={(e) => onKind(row.id, e.target.value)}
              >
                <option value="">未分类</option>
                {kindList.map((kind) => (
                  <option key={kind} value={kind}>{kind}</option>
                ))}
              </select>
            </td>
          );
        }
        if (column.kind === 'ports') {
          return <td key={column.key} className="cell readonly">{cellText(row, column)}</td>;
        }
        return (
          <td key={column.key} className="cell">
            <CellInput
              value={cellText(row, column)}
              onCommit={(text) => onProp(row.id, column, text)}
              inputMode={row.props[column.prop ?? '']?.type === 'number' ? 'decimal' : 'text'}
            />
          </td>
        );
      })}
    </tr>
  );
}

export default function TableView() {
  const graph = useCurrentGraph();
  const filter = useGraph((s) => s.filter);
  const setFilter = useGraph((s) => s.setFilter);
  const selectedNodes = useGraph((s) => s.selectedNodes);
  const select = useGraph((s) => s.select);
  const renameNode = useGraph((s) => s.renameNode);
  const setKind = useGraph((s) => s.setKind);
  const setProp = useGraph((s) => s.setProp);
  const setPropMany = useGraph((s) => s.setPropMany);
  const setView = useGraph((s) => s.setView);
  const setFocus = useGraph((s) => s.setFocus);
  const tableSort = useGraph((s) => s.tableSort);
  const setTableSort = useGraph((s) => s.setTableSort);
  const hiddenColumns = useGraph((s) => s.hiddenColumns);
  const toggleColumn = useGraph((s) => s.toggleColumn);
  const resetColumns = useGraph((s) => s.resetColumns);

  const [grouped, setGrouped] = useState(true);
  const [batchName, setBatchName] = useState('');
  const [batchType, setBatchType] = useState('string');
  const [batchValue, setBatchValue] = useState('');

  const columns = useMemo(() => columnsOf(graph), [graph]);
  const shown = useMemo(
    () => columns.filter((column) => !hiddenColumns.includes(column.key)),
    [columns, hiddenColumns],
  );
  const sortColumn = useMemo(
    () => columns.find((column) => column.key === tableSort?.key) ?? null,
    [columns, tableSort],
  );
  const kindNames = useMemo(() => Object.keys(graph.kinds), [graph.kinds]);

  const rows = useMemo(() => {
    const visible = visibleNodes(graph, filter);
    const filtered = filterNodes(visible, filter.query);
    return sortNodes(filtered, sortColumn, tableSort?.dir ?? 'asc');
  }, [graph, filter, sortColumn, tableSort]);

  const groups = useMemo(() => groupNodes(rows), [rows]);
  const allSelected = rows.length > 0 && rows.every((row) => selectedNodes.includes(row.id));
  const someSelected = selectedNodes.length > 0 && !allSelected;

  const toggleRow = (id: string) => {
    select(
      selectedNodes.includes(id) ? selectedNodes.filter((x) => x !== id) : [...selectedNodes, id],
      null,
    );
  };

  const editProp = (nodeId: string, column: TableColumn, text: string) => {
    if (!column.prop) return;
    const node = graph.nodes.find((n) => n.id === nodeId);
    setProp(nodeId, column.prop, parseCell(text, node?.props[column.prop]?.type));
  };

  const applyBatch = () => {
    if (!batchName.trim()) return;
    setPropMany(selectedNodes, batchName, batchType, parseCell(batchValue, batchType));
  };

  const locate = (id: string) => {
    setFocus(id);
    setView('graph');
  };

  const headerLabel = (column: TableColumn) => {
    const active = tableSort?.key === column.key;
    return (
      <span className={active ? 'sorted' : ''}>
        {column.label}
        {active ? (tableSort?.dir === 'asc' ? ' ▲' : ' ▼') : ''}
      </span>
    );
  };

  const rowProps = (row: UnitNode) => ({
    row,
    columns: shown,
    kinds: kindNames,
    selected: selectedNodes.includes(row.id),
    onToggle: toggleRow,
    onRename: renameNode,
    onKind: setKind,
    onProp: editProp,
    onLocate: () => locate(row.id),
  });

  return (
    <section className="table-view">
      <header className="table-head">
        <div className="table-title">
          表格投影
          <span className="dim"> · {rows.length} / {graph.nodes.length} 行</span>
        </div>
        <div className="table-tools">
          <input
            className="table-search"
            value={filter.query}
            placeholder="过滤标题 / 属性"
            onChange={(e) => setFilter({ query: e.target.value })}
          />
          <button
            className={`chip${grouped ? ' active' : ''}`}
            onClick={() => setGrouped((v) => !v)}
            title="按 kind 分组"
          >
            分组
          </button>
          <details className="col-menu">
            <summary>列 ({columns.length - hiddenColumns.length})</summary>
            <div className="col-list">
              {columns.map((column) => (
                <label key={column.key}>
                  <input
                    type="checkbox"
                    checked={!hiddenColumns.includes(column.key)}
                    onChange={() => toggleColumn(column.key)}
                  />
                  {column.label}
                </label>
              ))}
              <button className="link" onClick={resetColumns} disabled={!hiddenColumns.length}>
                显示全部
              </button>
            </div>
          </details>
          <button className="chip" onClick={() => setView('graph')}>回画布</button>
        </div>
      </header>

      {selectedNodes.length > 1 && (
        <div className="batch-bar">
          <span>已选 {selectedNodes.length} 行，批量设置属性：</span>
          <input value={batchName} placeholder="属性名" onChange={(e) => setBatchName(e.target.value)} />
          <select value={batchType} onChange={(e) => setBatchType(e.target.value)}>
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
          </select>
          <input value={batchValue} placeholder="值" onChange={(e) => setBatchValue(e.target.value)} />
          <button onClick={applyBatch} disabled={!batchName.trim()}>应用</button>
          <button className="link" onClick={() => select([], null)}>清除选择</button>
        </div>
      )}

      <div className="grid-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th className="check">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={() => (allSelected ? select([], null) : select(rows.map((r) => r.id), null))}
                />
              </th>
              {shown.map((column) => (
                <th
                  key={column.key}
                  className={column.kind === 'ports' ? 'readonly' : 'sortable'}
                  onClick={() => column.kind !== 'ports' && setTableSort(column.key)}
                  title={column.kind === 'ports' ? '端口数与方向，只读' : '点击排序'}
                >
                  {headerLabel(column)}
                </th>
              ))}
            </tr>
          </thead>
          {!grouped && (
            <tbody>
              {rows.map((row) => (
                <Row key={row.id} {...rowProps(row)} />
              ))}
            </tbody>
          )}
          {grouped &&
            groups.map((group) => (
              <tbody key={group.kind || '__none'} className="grid-group">
                <tr className="group-row">
                  <td colSpan={shown.length + 1}>
                    {group.label}
                    <span className="dim"> {group.rows.length}</span>
                  </td>
                </tr>
                {group.rows.map((row) => (
                  <Row key={row.id} {...rowProps(row)} />
                ))}
              </tbody>
            ))}
        </table>
        {rows.length === 0 && <div className="hint">没有匹配的单元</div>}
      </div>

      <footer className="table-foot dim">
        单元格直接编辑，Enter 提交 / Esc 取消；勾选多行后可批量设置同一属性；双击行可回画布定位。
      </footer>
    </section>
  );
}
