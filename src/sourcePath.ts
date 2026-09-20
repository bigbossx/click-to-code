import { moduleStackFrameAdapter } from './adapters/module'
import { nextStackFrameAdapter } from './adapters/next'
import type {
  NormalizedStackFile,
  StackFrameAdapter,
} from './adapters/types'
import { webpackStackFrameAdapter } from './adapters/webpack'
import { isAbsoluteFilePath } from './sourceLocation'

const stackFrameAdapters: StackFrameAdapter[] = [
  nextStackFrameAdapter,
  webpackStackFrameAdapter,
  moduleStackFrameAdapter,
]

export function normalizeStackFileName(
  rawFileName: string,
): NormalizedStackFile | undefined {
  let fileName = rawFileName.replace(/^\(/, '')
  const stackFileName = fileName

  try {
    fileName = decodeURIComponent(fileName)
  } catch {
    // Keep malformed URLs usable instead of failing the whole interaction.
  }

  if (fileName.startsWith('file://')) {
    fileName = fileName.slice('file://'.length)
  } else {
    const adapter = stackFrameAdapters.find((candidate) =>
      candidate.canNormalize(fileName),
    )
    if (adapter) return adapter.normalize(stackFileName, fileName)
  }

  fileName = fileName.replace(/[?#].*$/, '')
  if (!fileName || fileName === '<anonymous>') return

  return {
    fileName,
    projectRelative: !isAbsoluteFilePath(fileName),
  }
}
