// src/main/index.ts
import { app, BrowserWindow, Menu } from 'electron'
import { join, relative, dirname, basename } from 'path'
import { DatabaseService } from './services/DatabaseService'
import { VaultService } from './services/VaultService'
import { IndexService } from './services/IndexService'
import { WatcherService } from './services/WatcherService'
import { registerVaultHandlers } from './ipc/vault'
import { registerNotesHandlers } from './ipc/notes'
import { registerSearchHandlers } from './ipc/search'
import type { VaultConfig } from '@shared/types/Note'

let vaultPath: string | null = null
let dbService: DatabaseService | null = null
let vaultService: VaultService | null = null
let indexService: IndexService | null = null
let watcherService: WatcherService | null = null

async function openVault(path: string): Promise<VaultConfig> {
  if (watcherService) await watcherService.stop()
  if (dbService) dbService.close()

  vaultPath = path
  vaultService = new VaultService(path)
  vaultService.init(basename(path))
  dbService = new DatabaseService(path)
  dbService.open()
  indexService = new IndexService(dbService.get())
  watcherService = new WatcherService(path)

  // Full initial scan
  for (const notePath of vaultService.listNotes()) {
    const markdown = vaultService.readNote(notePath)
    const titleMatch = markdown.match(/^#\s+(.+)$/m)
    const title = titleMatch ? titleMatch[1] : basename(notePath, '.md')
    const id = getOrCreateNoteId(notePath)
    const folderPath = dirname(notePath) === '.' ? '' : dirname(notePath)
    indexService.indexNote({ id, path: notePath, title, markdown, folderPath, noteType: 'note' })
    indexService.syncFTS(id, title, markdown)
  }
  indexService.resolveLinks()

  watcherService.start({
    onFileChanged: (absPath) => {
      if (!vaultService || !indexService || !dbService) return
      const rel = relative(join(path, 'notes'), absPath)
      const markdown = vaultService.readNote(rel)
      const titleMatch = markdown.match(/^#\s+(.+)$/m)
      const title = titleMatch ? titleMatch[1] : basename(rel, '.md')
      const id = getOrCreateNoteId(rel)
      const folderPath = dirname(rel) === '.' ? '' : dirname(rel)
      indexService.indexNote({ id, path: rel, title, markdown, folderPath, noteType: 'note' })
      indexService.syncFTS(id, title, markdown)
      indexService.resolveLinks()
    },
    onFileDeleted: (absPath) => {
      if (!dbService || !indexService) return
      const rel = relative(join(path, 'notes'), absPath)
      const row = dbService.get().prepare('SELECT id FROM notes WHERE path = ?').get(rel) as
        | { id: string } | undefined
      if (row) indexService.removeNote(row.id)
    },
  })

  return vaultService.getConfig()
}

function getOrCreateNoteId(notePath: string): string {
  if (!dbService) throw new Error('DB not open')
  const row = dbService.get().prepare('SELECT id FROM notes WHERE path = ?').get(notePath) as
    | { id: string } | undefined
  return row?.id ?? crypto.randomUUID()
}

app.whenReady().then(() => {
  registerVaultHandlers({
    db: () => dbService!,
    vault: () => vaultService!,
    openVault,
    setVaultPath: (p) => { vaultPath = p },
  })

  registerNotesHandlers({
    db: () => dbService!,
    vault: () => vaultService!,
    index: () => indexService!,
  })

  registerSearchHandlers(() => indexService!)

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#060b12',
    show: false,
  })

  // Remove native in-window menu bar (File/Edit/Help) on Windows/Linux.
  // We render a custom menu bar in the renderer instead.
  win.removeMenu()

  win.on('ready-to-show', () => win.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
})

app.on('window-all-closed', async () => {
  if (watcherService) await watcherService.stop()
  if (dbService) dbService.close()
  if (process.platform !== 'darwin') app.quit()
})
