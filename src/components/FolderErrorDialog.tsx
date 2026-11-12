import { useGraph } from '../store';

/** 打开/绑定目录失败时给出可读原因与重试入口（toast 太短，容易错过）。 */
export default function FolderErrorDialog() {
  const message = useGraph((s) => s.folderError);
  const clear = useGraph((s) => s.clearFolderError);
  const openFolder = useGraph((s) => s.openFolder);
  if (!message) return null;
  return (
    <div className="asset-prompt folder-error" role="dialog" aria-label="打开文件夹失败">
      <div className="card">
        <h3>打开文件夹失败</h3>
        <p className="detail">{message}</p>
        <p className="hint">也可以直接把项目文件夹（含 project.json）拖进窗口。</p>
        <div className="actions">
          <button className="primary" onClick={() => void openFolder()}>重试</button>
          <button onClick={clear}>关闭</button>
        </div>
      </div>
    </div>
  );
}
