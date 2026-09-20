import {
  resolveSourceLocation,
  sourceLocationNeedsResolution,
} from './reactFiber'
import type { Editor, PathModifier, SourceLocation } from './types'
import { getPathToSourceSafely, getUrl } from './utils'

export function openSourceInEditor(
  source: SourceLocation | readonly SourceLocation[],
  editor: Editor,
  pathModifier?: PathModifier,
  projectRoot?: string,
): void {
  const sources = Array.isArray(source) ? source : [source]

  void openFirstApplicationSource(sources, editor, pathModifier, projectRoot)
    .catch(() => {
      // Source-map failures must not escape into the host application.
    })
}

async function openFirstApplicationSource(
  sources: readonly SourceLocation[],
  editor: Editor,
  pathModifier?: PathModifier,
  projectRoot?: string,
): Promise<void> {
  for (const source of sources) {
    const resolvedSource = await resolveApplicationSource(source)
    if (!resolvedSource) continue

    openResolvedSource(resolvedSource, editor, pathModifier, projectRoot)
    return
  }
}

export async function resolveApplicationSource(
  source: SourceLocation,
): Promise<SourceLocation | undefined> {
  const resolvedSource = sourceLocationNeedsResolution(source)
    ? await resolveSourceLocation(source)
    : source

  return resolvedSource && !isDependencySource(resolvedSource.fileName)
    ? resolvedSource
    : undefined
}

function isDependencySource(fileName: string): boolean {
  return /(?:^|\/)node_modules\//.test(fileName.replace(/\\/g, '/'))
}

function openResolvedSource(
  source: SourceLocation,
  editor: Editor,
  pathModifier?: PathModifier,
  projectRoot?: string,
): void {
  try {
    const path = getPathToSourceSafely(source, pathModifier, projectRoot)
    if (path) window.location.assign(getUrl(editor, path))
  } catch {
    // Invalid source paths and custom editor URLs stay local to the action.
  }
}
