// src/main/index.ts
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join, relative, dirname, basename } from 'path'
import { existsSync } from 'fs'
import { DatabaseService } from './services/DatabaseService'
import { VaultService } from './services/VaultService'
import { IndexService } from './services/IndexService'
import { WatcherService } from './services/WatcherService'
import { SettingsService } from './services/SettingsService'
import { registerVaultHandlers } from './ipc/vault'
import { registerNotesHandlers } from './ipc/notes'
import { registerSearchHandlers } from './ipc/search'
import type { VaultConfig } from '@shared/types/Note'

type VaultSession = {
  db:      DatabaseService
  vault:   VaultService
  index:   IndexService
  watcher: WatcherService
  config:  VaultConfig
}

const sessions = new Map<string, VaultSession>()
let activePath: string | null = null
let settingsService: SettingsService

function activeSession(): VaultSession {
  const s = sessions.get(activePath ?? '')
  if (!s) throw new Error('No active vault')
  return s
}

function safeVaultFolderName(name: string): string {
  const safe = name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return safe || 'my-vault'
}

async function openVault(vaultPath: string): Promise<VaultConfig> {
  // Already open — just activate
  if (sessions.has(vaultPath)) {
    activePath = vaultPath
    settingsService.setLastVaultPath(vaultPath)
    return sessions.get(vaultPath)!.config
  }

  const vaultService   = new VaultService(vaultPath)
  const dbService      = new DatabaseService(vaultPath)
  dbService.open()
  const indexService   = new IndexService(dbService.get())
  const watcherService = new WatcherService(vaultPath)

  for (const notePath of vaultService.listNotes()) {
    const markdown   = vaultService.readNote(notePath)
    const id         = getOrCreateNoteId(dbService, notePath)
    const folderPath = dirname(notePath) === '.' ? '' : dirname(notePath)
    // Preserve any title already stored in the DB (set by rename).
    // Only extract from file content for notes that don't exist in the DB yet.
    const stored = dbService.get().prepare('SELECT title FROM notes WHERE id = ?').get(id) as { title: string } | undefined
    const title  = stored?.title ?? (markdown.match(/^#\s+(.+)$/m)?.[1] ?? basename(notePath, '.md'))
    indexService.indexNote({ id, path: notePath, title, markdown, folderPath, noteType: 'note' })
    indexService.syncFTS(id, title, markdown)
  }
  indexService.resolveLinks()

  watcherService.start({
    onFileChanged: (absPath) => {
      const rel        = relative(join(vaultPath, 'notes'), absPath)
      const markdown   = vaultService.readNote(rel)
      const id         = getOrCreateNoteId(dbService, rel)
      const folderPath = dirname(rel) === '.' ? '' : dirname(rel)
      // Title is owned by the DB — never overwrite it from file content.
      // If the note is brand new (not yet in DB), fall back to H1 or filename.
      const stored = dbService.get().prepare('SELECT title FROM notes WHERE id = ?').get(id) as { title: string } | undefined
      const title  = stored?.title ?? (markdown.match(/^#\s+(.+)$/m)?.[1] ?? basename(rel, '.md'))
      indexService.indexNote({ id, path: rel, title, markdown, folderPath, noteType: 'note' })
      indexService.syncFTS(id, title, markdown)
      indexService.resolveLinks()
    },
    onFileDeleted: (absPath) => {
      const rel = relative(join(vaultPath, 'notes'), absPath)
      const row = dbService.get().prepare('SELECT id FROM notes WHERE path = ?').get(rel) as
        { id: string } | undefined
      if (row) indexService.removeNote(row.id)
    },
  })

  const config = vaultService.getConfig()
  sessions.set(vaultPath, { db: dbService, vault: vaultService, index: indexService, watcher: watcherService, config })
  activePath = vaultPath
  settingsService.addKnownVault(config)
  settingsService.setLastVaultPath(vaultPath)
  return config
}

async function closeVault(path: string): Promise<VaultConfig | null> {
  const session = sessions.get(path)
  if (!session) return null
  try {
    await session.watcher.stop()
    session.db.close()
  } catch { /* best-effort */ }
  sessions.delete(path)

  if (activePath === path) {
    const remaining = Array.from(sessions.keys())
    activePath = remaining[0] ?? null
    if (activePath) settingsService.setLastVaultPath(activePath)
  }

  return activePath ? sessions.get(activePath)!.config : null
}

async function createVault(name: string): Promise<VaultConfig> {
  const vaultPath = join(app.getPath('documents'), safeVaultFolderName(name))
  if (existsSync(vaultPath)) {
    throw new Error(`A folder already exists at "${vaultPath}". Choose a different name.`)
  }
  const vaultService = new VaultService(vaultPath)
  vaultService.init(name)
  return openVault(vaultPath)
}

function getOrCreateNoteId(dbService: DatabaseService, notePath: string): string {
  const row = dbService.get().prepare('SELECT id FROM notes WHERE path = ?').get(notePath) as
    { id: string } | undefined
  return row?.id ?? crypto.randomUUID()
}

// Clear ELECTRON_RUN_AS_NODE so renderer/preload child processes get the
// proper electron module, not the npm path-string shim.
delete process.env['ELECTRON_RUN_AS_NODE']

app.whenReady().then(() => {
  settingsService = new SettingsService(app.getPath('userData'))

  registerVaultHandlers({
    openVault,
    createVault,
    activateVault: async (path: string) => {
      if (!sessions.has(path)) return openVault(path)
      activePath = path
      settingsService.setLastVaultPath(path)
      return sessions.get(path)!.config
    },
    listKnownVaults:  () => settingsService.getKnownVaults(),
    getLastVaultPath: () => settingsService.getLastVaultPath(),
    getOpenSessions:  () => Array.from(sessions.values()).map(s => s.config),
    removeKnownVault: (path: string) => settingsService.removeKnown(path),
    closeVault,
  })

  registerNotesHandlers({
    db:    () => activeSession().db,
    vault: () => activeSession().vault,
    index: () => activeSession().index,
  })

  registerSearchHandlers(() => activeSession().index)

  ipcMain.handle('shell:open-external', (_e, url: string) => shell.openExternal(url))

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

  win.removeMenu()
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools()
    }
    if (input.type === 'keyDown' && input.control && input.shift && input.key === 'I') {
      win.webContents.toggleDevTools()
    }
  })
  win.on('ready-to-show', () => win.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
})

app.on('window-all-closed', async () => {
  for (const session of sessions.values()) {
    try {
      await session.watcher.stop()
      session.db.close()
    } catch {
      // Best-effort cleanup — don't let one failure block others
    }
  }
  if (process.platform !== 'darwin') app.quit()
})
