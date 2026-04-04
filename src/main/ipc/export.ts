// src/main/ipc/export.ts
import { ipcMain, BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'fs'

export function registerExportHandlers(getWindow: () => BrowserWindow): void {
  ipcMain.handle('export:pdf', async (_e, noteTitle: string): Promise<void> => {
    const win = getWindow()

    // Signal the renderer to hide chrome before capture
    win.webContents.send('export:before-print')
    await new Promise<void>(r => setTimeout(r, 200))

    try {
      const data = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { marginType: 'custom', top: 0.5, bottom: 0.5, left: 0.6, right: 0.6 },
      })

      const { filePath } = await dialog.showSaveDialog(win, {
        defaultPath: `${noteTitle}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })

      if (filePath) writeFileSync(filePath, data)
    } finally {
      win.webContents.send('export:after-print')
    }
  })
}
