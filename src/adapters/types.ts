import type { SourceLocation } from '../types'

export type SourceMapAdapterKind = 'module' | 'next-server' | 'webpack'

export interface SourceMapStackFrame {
  file: string
  lineNumber: number
  columnNumber: number
  kind: SourceMapAdapterKind
}

export interface SourceMapPayload {
  contents: string
  url?: string
}

export interface SourceMapLoaderAdapter {
  kind: SourceMapAdapterKind
  load(frame: SourceMapStackFrame): Promise<SourceMapPayload | undefined>
}

export interface NormalizedStackFile {
  fileName: string
  projectRelative: boolean
  nextFrame?: { file: string; isServer: boolean }
  sourceMapFrame?: Pick<SourceMapStackFrame, 'file' | 'kind'>
}

export interface StackFrameAdapter {
  canNormalize(fileName: string): boolean
  normalize(
    stackFileName: string,
    fileName: string,
  ): NormalizedStackFile | undefined
}

export interface SourceResolverAdapter {
  canResolve(source: SourceLocation): boolean
  resolve(source: SourceLocation): Promise<SourceLocation | undefined>
}
