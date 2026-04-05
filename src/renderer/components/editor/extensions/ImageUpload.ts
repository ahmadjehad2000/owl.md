// src/renderer/components/editor/extensions/ImageUpload.ts
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { ipc } from '../../../lib/ipc'

async function fileToBase64(file: File): Promise<{ base64: string; ext: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1] ?? ''
      const ext    = file.type.split('/')[1]?.split('+')[0] ?? 'png'
      resolve({ base64, ext })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function insertImage(file: File, editor: import('@tiptap/core').Editor): Promise<void> {
  if (!file.type.startsWith('image/')) return
  try {
    const { base64, ext } = await fileToBase64(file)
    const relativePath    = await ipc.notes.saveImage(base64, ext)
    editor.chain().focus().setImage({ src: `owl://${relativePath}`, alt: file.name }).run()
  } catch (err) {
    console.error('[ImageUpload] Failed to save image:', err)
    // Surface the error in the editor as a visible inline message
    editor.chain().focus().insertContent(
      `<p><em>⚠ Image could not be saved: ${(err as Error).message ?? 'unknown error'}</em></p>`
    ).run()
  }
}

export const ImageUpload = Extension.create({
  name: 'imageUpload',

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey('imageUpload'),
        props: {
          handlePaste(_view, event) {
            const items = Array.from(event.clipboardData?.items ?? [])
            const imageItem = items.find(i => i.type.startsWith('image/'))
            if (!imageItem) return false
            event.preventDefault()
            const file = imageItem.getAsFile()
            if (file) void insertImage(file, editor)
            return true
          },
          handleDrop(_view, event) {
            const files = Array.from(event.dataTransfer?.files ?? [])
            const imageFile = files.find(f => f.type.startsWith('image/'))
            if (!imageFile) return false
            event.preventDefault()
            void insertImage(imageFile, editor)
            return true
          },
        },
      }),
    ]
  },
})
