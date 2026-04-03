import { contextBridge } from 'electron'
contextBridge.exposeInMainWorld('owl', {})
