import { describe, expect, it } from 'vitest';
import { MemoryFS } from '../src/fs/memory';
import { joinPath } from '../src/fs/types';
import { graphDirName, nodeDirName, readProject, writeProject } from '../src/model/folder';
import { projectFromGraph } from '../src/model/project';
import type { Graph, UnitNode } from '../src/model/types';

function node(id: string, title: string, extra: Partial<UnitNode> = {}): UnitNode {
  return {
    id,
    title,
    props: {},
    ports: [
      { id: `${id}_in`, dir: 'in', label: '入', capacity: 'one' },
      { id: `${id}_out`, dir: 'out', label: '出', capacity: 'many' },
    ],
    pos: { x: 10, y: 20 },
    ...extra,
  };
}

function graph(): Graph {
  const ore = node('n_ore', '钛矿');
  const ingot = node('n_ingot', '钛锭', {
    resources: [
      { id: 'r1', type: 'image', label: '图标', path: 'assets/icon_ti.png' },
    ],
  });
  const line: UnitNode = node('n_line', '冶炼产线', {
    subgraph: {
      version: 1,
      kinds: {},
      nodes: [node('n_inner', '冶炼炉')],
      edges: [],
    },
    subgraphMap: { n_line_in: { node: 'n_inner', port: 'n_inner_in' } },
  });
  return {
    version: 1,
    kinds: { item: { name: '物品' } },
    nodes: [ore, ingot, line],
    edges: [
      {
        id: 'e1',
        from: { node: 'n_ore', port: 'n_ore_out' },
        to: { node: 'n_ingot', port: 'n_ingot_in' },
        label: '2 : 1',
      },
    ],
  };
}

function project() {
  return projectFromGraph(graph(), '主图');
}

describe('目录项目：扫描与序列化', () => {
  it('写出的目录结构可读回，保留节点、连线、子图与资源', async () => {
    const fs = new MemoryFS();
    const doc = project();
    await writeProject(fs, doc);
    const back = await readProject(fs);

    expect(back.active).toBe(doc.active);
    expect(back.graphs).toHaveLength(1);
    const g = back.graphs[0].graph;
    expect(g.nodes.map((n) => n.id)).toEqual(['n_ore', 'n_ingot', 'n_line']);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].label).toBe('2 : 1');
    const line = g.nodes.find((n) => n.id === 'n_line')!;
    expect(line.subgraph?.nodes.map((n) => n.id)).toEqual(['n_inner']);
    expect(line.subgraphMap?.n_line_in).toEqual({ node: 'n_inner', port: 'n_inner_in' });
    expect(g.nodes.find((n) => n.id === 'n_ingot')!.resources?.[0].label).toBe('图标');
    expect(g.kinds.item.name).toBe('物品');
  });

  it('提供 readResource 时把资源字节写进节点 resources/ 并记录 file', async () => {
    const fs = new MemoryFS();
    const doc = project();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await writeProject(fs, doc, {
      readResource: async (node, resource) =>
        node.id === 'n_ingot' && resource.id === 'r1' ? bytes : null,
    });

    const back = await readProject(fs);
    const res = back.graphs[0].graph.nodes.find((n) => n.id === 'n_ingot')!.resources![0];
    expect(res.file).toMatch(/^resources\//);
    expect(res.file!.endsWith('.png')).toBe(true);
    const gdir = graphDirName('主图', doc.active);
    const ndir = nodeDirName({ id: 'n_ingot', title: '钛锭' });
    const saved = await fs.readBytes(joinPath('graphs', gdir, 'nodes', ndir, res.file!));
    expect([...(saved ?? [])]).toEqual([1, 2, 3, 4]);
  });

  it('不提供 readResource 时只写 JSON，不创建 resources/', async () => {
    const fs = new MemoryFS();
    const doc = project();
    await writeProject(fs, doc);
    const gdir = graphDirName('主图', doc.active);
    const ndir = nodeDirName({ id: 'n_ingot', title: '钛锭' });
    expect(await fs.exists(joinPath('graphs', gdir, 'nodes', ndir, 'resources'))).toBe(false);
  });

  it('按 node.json / graph.json 落在人可读的文件夹里', async () => {
    const fs = new MemoryFS();
    const doc = project();
    await writeProject(fs, doc);
    const gdir = `graphs/${graphDirName('主图', doc.active)}`;
    expect(await fs.exists('project.json')).toBe(true);
    expect(await fs.exists(`${gdir}/graph.json`)).toBe(true);
    expect(await fs.exists(`${gdir}/nodes/${nodeDirName({ id: 'n_ore', title: '钛矿' })}/node.json`)).toBe(true);
    expect(await fs.exists(`${gdir}/nodes/${nodeDirName({ id: 'n_line', title: '冶炼产线' })}/subgraph/graph.json`)).toBe(true);
  });

  it('重命名节点会改文件夹名并清掉旧的', async () => {
    const fs = new MemoryFS();
    const doc = project();
    await writeProject(fs, doc);
    const gdir = `graphs/${graphDirName('主图', doc.active)}`;
    const oldDir = `${gdir}/nodes/${nodeDirName({ id: 'n_ore', title: '钛矿' })}`;

    const renamed = projectFromGraph({
      ...graph(),
      nodes: graph().nodes.map((n) => (n.id === 'n_ore' ? { ...n, title: '铁矿石' } : n)),
    }, '主图');
    await writeProject(fs, renamed);
    const newGdir = `graphs/${graphDirName('主图', renamed.active)}`;

    expect(await fs.exists(oldDir)).toBe(false);
    expect(await fs.exists(`${newGdir}/nodes/${nodeDirName({ id: 'n_ore', title: '铁矿石' })}/node.json`)).toBe(true);
  });

  it('删除节点/图会清掉对应文件夹', async () => {
    const fs = new MemoryFS();
    const doc = project();
    await writeProject(fs, doc);
    const gdir = `graphs/${graphDirName('主图', doc.active)}`;

    const trimmed = projectFromGraph({
      ...graph(),
      nodes: graph().nodes.filter((n) => n.id !== 'n_ingot'),
    }, '主图');
    await writeProject(fs, trimmed);
    expect(await fs.exists(`${gdir}/nodes/${nodeDirName({ id: 'n_ingot', title: '钛锭' })}`)).toBe(false);

    const other = projectFromGraph(graph(), '副图');
    await writeProject(fs, other);
    expect(await fs.exists(`graphs/${graphDirName('主图', doc.active)}`)).toBe(false);
    expect((await readProject(fs)).graphs[0].name).toBe('副图');
  });

  it('手工改文件夹名不影响读取（id 以 node.json 为准）', async () => {
    const fs = new MemoryFS();
    const doc = project();
    await writeProject(fs, doc);
    const gdir = `graphs/${graphDirName('主图', doc.active)}`;
    const oldPath = `${gdir}/nodes/${nodeDirName({ id: 'n_ore', title: '钛矿' })}`;
    const text = await fs.readText(`${oldPath}/node.json`);
    await fs.writeText(`${gdir}/nodes/随便改的名字__n_ore/node.json`, text ?? '');
    await fs.remove(oldPath);

    const back = await readProject(fs);
    expect(back.graphs[0].graph.nodes.map((n) => n.id)).toContain('n_ore');
  });

  it('不是目录项目时给出明确错误', async () => {
    const empty = new MemoryFS();
    await expect(readProject(empty)).rejects.toThrow('缺少 project.json');
    const bad = new MemoryFS();
    await bad.writeText('project.json', '{"version":2,"graphs":[]}');
    await expect(readProject(bad)).rejects.toThrow('缺少 project.json');
  });
});
