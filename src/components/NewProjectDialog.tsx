import { useGraph } from '../store';

/** 新建项目的两种落点：先空白（稍后保存），或直接选文件夹建目录项目。 */
export default function NewProjectDialog() {
  const open = useGraph((s) => s.newProjectOpen);
  const close = useGraph((s) => s.closeNewProject);
  const newProject = useGraph((s) => s.newProject);
  if (!open) return null;
  return (
    <div className="asset-prompt" role="dialog" aria-label="新建项目">
      <div className="card">
        <h3>新建项目</h3>
        <p className="detail">会清空当前编辑。选一个文件夹，会立刻在里面写入 project.json 和一张空图；也可以先建空白项目，之后再保存。</p>
        <div className="actions" style={{ flexWrap: 'wrap' }}>
          <button
            className="primary"
            onClick={async () => {
              const pick = window.showDirectoryPicker;
              if (!pick) {
                useGraph.getState().toastOf('当前浏览器不支持目录访问，请用 Chrome / Edge，或把项目文件夹拖进窗口');
                return;
              }
              let handle: FileSystemDirectoryHandle;
              try {
                // 先取目录句柄，避免任何状态更新消耗掉用户手势
                handle = await pick({ mode: 'readwrite' });
              } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') {
                  useGraph.getState().toastOf('已取消选择，当前项目没有改动');
                } else {
                  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
                  useGraph.getState().toastOf(`打开文件夹选择器失败：${detail}`);
                }
                return;
              }
              newProject();
              close();
              await useGraph.getState().saveToFolder(handle);
            }}
          >
            选择文件夹并创建…
          </button>
          <button
            onClick={() => {
              newProject();
              close();
              useGraph.getState().toastOf('空白项目尚未写入磁盘；按 ⌘S 选择文件夹后会生成 project.json');
            }}
          >
            空白项目（暂不落盘）
          </button>
          <button onClick={close}>取消</button>
        </div>
      </div>
    </div>
  );
}
