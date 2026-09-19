import { useCallback, useEffect, useState } from 'react'

import { ContextMenu } from './ContextMenu'
import { getSourceForElement } from './reactFiber'
import type { ClickToComponentProps } from './types'
import { getPathToSourceSafely, getUrl } from './utils'

type Mode = 'idle' | 'hover' | 'select'

export function ClickToComponent({
  editor = 'vscode',
  pathModifier,
}: ClickToComponentProps) {
  const [mode, setMode] = useState<Mode>('idle')
  const [target, setTarget] = useState<Element | null>(null)
  const [point, setPoint] = useState({ x: 0, y: 0 })

  const closeMenu = useCallback(() => setMode('idle'), [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && mode === 'idle') setMode('hover')
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt' && mode === 'hover') setMode('idle')
    }
    const onBlur = () => {
      if (mode === 'hover') setMode('idle')
    }
    const onMouseMove = (event: MouseEvent) => {
      if (mode !== 'select' && event.target instanceof Element) {
        setTarget(event.target)
      }
    }
    const onClick = (event: MouseEvent) => {
      if (!event.altKey || mode === 'select') return
      if (!(event.target instanceof Element)) return

      try {
        const source = getSourceForElement(event.target)
        if (!source) return
        const path = getPathToSourceSafely(source, pathModifier)
        if (!path) return

        event.preventDefault()
        event.stopPropagation()
        window.location.assign(getUrl(editor, path))
      } catch {
        // Keep failures in private React data or editor navigation local.
      } finally {
        setMode('idle')
      }
    }
    const onContextMenu = (event: MouseEvent) => {
      if (!event.altKey || !(event.target instanceof Element)) return
      event.preventDefault()
      event.stopPropagation()
      setTarget(event.target)
      setPoint({ x: event.clientX, y: event.clientY })
      setMode('select')
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('click', onClick, true)
    window.addEventListener('contextmenu', onContextMenu, true)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('contextmenu', onContextMenu, true)
    }
  }, [editor, mode, pathModifier])

  useEffect(() => {
    document.body.dataset.clickToComponent = mode
    document
      .querySelectorAll('[data-click-to-component-target]')
      .forEach((element) => element.removeAttribute('data-click-to-component-target'))

    if (mode === 'hover' && target) {
      target.setAttribute('data-click-to-component-target', 'hover')
    }

    return () => {
      delete document.body.dataset.clickToComponent
      target?.removeAttribute('data-click-to-component-target')
    }
  }, [mode, target])

  return (
    <>
      <style>{styles}</style>
      {mode === 'select' && target ? (
        <ContextMenu
          editor={editor}
          {...(pathModifier ? { pathModifier } : {})}
          point={point}
          target={target}
          onClose={closeMenu}
        />
      ) : null}
    </>
  )
}

const styles = `
  [data-click-to-component-target] {
    cursor: var(--click-to-component-cursor, context-menu) !important;
    outline: var(--click-to-component-outline, -webkit-focus-ring-color auto 1px) !important;
  }
  [data-click-to-component-overlay] {
    position: fixed; inset: 0; z-index: 2147483647;
  }
  [data-click-to-component-contextmenu] {
    all: unset; position: fixed; display: flex; flex-direction: column;
    box-sizing: border-box; min-width: 240px; max-width: min(560px, 90vw);
    max-height: 70vh; overflow: auto; padding: 5px; border-radius: 6px;
    background: white; color: black; box-shadow: 0 14px 40px rgb(0 0 0 / 25%);
    font: 600 13px/1.4 ui-sans-serif, system-ui, sans-serif;
  }
  [data-click-to-component-contextmenu] button {
    all: unset; display: flex; flex-direction: column; padding: 6px;
    border-radius: 4px; cursor: pointer;
  }
  [data-click-to-component-contextmenu] button:hover,
  [data-click-to-component-contextmenu] button:focus {
    background: royalblue; color: white;
  }
  [data-click-to-component-contextmenu] code {
    overflow: hidden; text-overflow: ellipsis;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  [data-click-to-component-contextmenu] code span { opacity: .75; }
  [data-click-to-component-contextmenu] cite {
    display: flex; justify-content: space-between; gap: 12px; opacity: .65;
    overflow: hidden; font: 400 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  [data-click-to-component-contextmenu] cite data { flex: none; }
`
