import type { ComponentType, ReactElement } from 'react'

export type Editor =
  | 'vscode'
  | 'vscode-insiders'
  | 'cursor'
  | (string & {})

export type PathModifier = (path: string) => string

export interface SourceLocation {
  fileName: string
  lineNumber: number
  columnNumber: number
}

export interface ClickToCodeProps {
  editor?: Editor
  pathModifier?: PathModifier
}

export interface ReactFiber {
  tag?: number
  type?: FiberType
  elementType?: FiberType
  memoizedProps?: unknown
  pendingProps?: unknown
  child?: ReactFiber | null
  return?: ReactFiber | null
  _debugOwner?: ReactFiber | null
  _debugSource?: Partial<SourceLocation> | Record<string, unknown> | null
  _debugStack?: Error | { stack?: string } | string | null
}

export type FiberType =
  | string
  | ComponentType<unknown>
  | {
      displayName?: string
      name?: string
      type?: FiberType
      $$typeof?: symbol
    }
  | symbol
  | null

export type ClickToCodeComponent = (
  props: ClickToCodeProps,
) => ReactElement | null
