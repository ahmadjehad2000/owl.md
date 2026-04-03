// src/main/services/WatcherService.ts
import chokidar, { FSWatcher } from 'chokidar'
import { join } from 'path'

interface WatcherCallbacks {
  onFileChanged: (absolutePath: string) => void
  onFileDeleted: (absolutePath: string) => void
}

export class WatcherService {
  private watcher: FSWatcher | null = null

  constructor(private readonly vaultPath: string) {}

  start(callbacks: WatcherCallbacks): void {
    const notesDir = join(this.vaultPath, 'notes')

    this.watcher = chokidar.watch(notesDir, {
      ignored: /(^|[/\\])\../,
      persistent: true,
      ignoreInitial: false,
    })

    const handle = (path: string): void => {
      if (path.endsWith('.md')) callbacks.onFileChanged(path)
    }

    const handleDelete = (path: string): void => {
      if (path.endsWith('.md')) callbacks.onFileDeleted(path)
    }

    this.watcher.on('add', handle).on('change', handle).on('unlink', handleDelete)
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
  }
}
