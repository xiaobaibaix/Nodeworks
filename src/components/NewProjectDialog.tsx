import { useGraph } from '../store';

/** 新建项目的两种落点：先空白（稍后保存），或直接选文件夹建目录项目。 */
export default function NewProjectDialog() {
  const open = useGraph((s) => s.newProjectOpen);
  const close = useGraph((s) => s.closeNewProject);
  const newProject = useGraph((s) => s.newProject);
  const saveToFolder = useGraph((s) => s.saveToFolder);
  if (!open) return null;
  return (
    <div className="asset-prompt" role="dialog" aria-label="新建项目">
      <div className="card">
        <h3>新建项目</h3>
        <p className="detail">会清空当前编辑。已有未保存修改的话，先取消并保存。</p>
        <div className="actions" style={{ flexWrap: 'wrap' }}>
          <button className="primary" onClick={() => { newProject(); close(); }}>空白项目</button>
          <button onClick={() => { newProject(); close(); void saveToFolder(); }}>新建并选择文件夹…</button>
          <button onClick={close}>取消</button>
        </div>
      </div>
    </div>
  );
}
