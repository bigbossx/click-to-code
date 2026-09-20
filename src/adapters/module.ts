import { fetchText, loadSourceMapFromText } from './sourceMapShared'
import type { SourceMapLoaderAdapter, StackFrameAdapter } from './types'

export const moduleStackFrameAdapter: StackFrameAdapter = {
  canNormalize(fileName) {
    return /^https?:\/\//.test(fileName)
  },
  normalize(stackFileName, fileName) {
    try {
      const url = new URL(fileName)
      const isFileSystemPath = url.pathname.startsWith('/@fs/')
      return {
        fileName: url.pathname.replace(/^\/@fs\//, '/').replace(/[?#].*$/, ''),
        projectRelative: !isFileSystemPath,
        sourceMapFrame: { file: stackFileName, kind: 'module' },
      }
    } catch {
      return
    }
  },
}

export const moduleSourceMapAdapter: SourceMapLoaderAdapter = {
  kind: 'module',
  async load(frame) {
    const source = await fetchText(frame.file)
    return source ? loadSourceMapFromText(source, frame.file) : undefined
  },
}
