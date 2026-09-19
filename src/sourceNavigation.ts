import {
  resolveSourceLocation,
  sourceLocationNeedsResolution,
} from './reactFiber'
import type { Editor, PathModifier, SourceLocation } from './types'
import { getPathToSourceSafely, getUrl } from './utils'

export function openSourceInEditor(
  source: SourceLocation,
  editor: Editor,
  pathModifier?: PathModifier,
  projectRoot?: string,
): void {
  if (!sourceLocationNeedsResolution(source)) {
    openResolvedSource(source, editor, pathModifier, projectRoot)
    return
  }

  void resolveSourceLocation(source)
    .then((resolvedSource) => {
      if (resolvedSource) {
        openResolvedSource(resolvedSource, editor, pathModifier, projectRoot)
      }
    })
    .catch(() => {
      // Source-map failures must not escape into the host application.
    })
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
