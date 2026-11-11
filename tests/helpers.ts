import { EMPTY_FILTER } from '../src/model/query';
import { useGraph } from '../src/store';

export function resetStore(): void {
  useGraph.setState({
    graph: { version: 1, nodes: [], edges: [], kinds: {} },
    past: [],
    future: [],
    selectedNodes: [],
    selectedEdge: null,
    toast: null,
    filter: EMPTY_FILTER,
    clipboard: null,
    pasteCount: 0,
    pendingPort: null,
    paletteOpen: false,
    path: [],
    preview: false,
    view: 'graph',
    impactOn: false,
    impactDepth: 2,
    tableSort: null,
    hiddenColumns: [],
    focus: null,
    exportOpen: false,
    booted: true,
  });
}
