/** File System Access API 在 lib.dom 里只补了基础类型，这里补上实际用到的成员。 */
interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemHandle>;
}

interface Window {
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite';
    id?: string;
    startIn?: string;
  }) => Promise<FileSystemDirectoryHandle>;
}
