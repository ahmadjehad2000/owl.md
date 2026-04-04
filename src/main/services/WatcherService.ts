// src/main/services/WatcherService.ts
import chokidar, { FSWatcher } from 'chokidar'
import { join } from 'path'

interface WatcherCallbacks {
  onFileChanged: (absolutePath: string) => void
  onFileDeleted: (absolutePath: string) => void
}

const DEBOUNCE_MS = 300

export class WatcherService {
  private watcher: FSWatcher | null = null
  private readonly pendingChanges = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(private readonly vaultPath: string) {}

  start(callbacks: WatcherCallbacks): void {
    const notesDir = join(this.vaultPath, 'notes')

    this.watcher = chokidar.watch(notesDir, {
      ignored: /(^|[/\\])\../,
      persistent: true,
      ignoreInitial: false,
    })

    this.watcher.on('add', (path) => this.debouncedChange(path, callbacks))
    this.watcher.on('change', (path) => this.debouncedChange(path, callbacks))
    this.watcher.on('unlink', (path) => {
      const timer = this.pendingChanges.get(path)
      if (timer) { clearTimeout(timer); this.pendingChanges.delete(path) }
      if (path.endsWith('.md')) callbacks.onFileDeleted(path)
    })
  }

  private debouncedChange(path: string, callbacks: WatcherCallbacks): void {
    if (!path.endsWith('.md')) return
    const existing = this.pendingChanges.get(path)
    if (existing) clearTimeout(existing)
    this.pendingChanges.set(path, setTimeout(() => {
      this.pendingChanges.delete(path)
      callbacks.onFileChanged(path)
    }, DEBOUNCE_MS))
  }

  async stop(): Promise<void> {
    for (const timer of this.pendingChanges.values()) clearTimeout(timer)
    this.pendingChanges.clear()
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
  }
}
