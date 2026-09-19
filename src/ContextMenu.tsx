import { useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'

import { getReactInstancesForElement, getSourceForInstance } from './reactFiber'
import { openSourceInEditor } from './sourceNavigation'
import type { Editor, PathModifier } from './types'
import { getDisplayNameForInstance, getPropsForInstance } from './utils'

interface ContextMenuProps {
  editor: Editor
  pathModifier?: PathModifier
  projectRoot?: string
  point: { x: number; y: number }
  target: Element
  onClose: () => void
}

export function ContextMenu({
  editor,
  pathModifier,
  projectRoot,
  point,
  target,
  onClose,
}: ContextMenuProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const items = useMemo(
    () =>
      getReactInstancesForElement(target).flatMap((fiber) => {
        try {
          const source = getSourceForInstance(fiber)
          if (!source) return []

          return [
            {
              fiber,
              source,
              name: getDisplayNameForInstance(fiber),
              props: getPropsForInstance(fiber),
            },
          ]
        } catch {
          return []
        }
      }),
    [target],
  )

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  useEffect(() => {
    if (items.length === 0) onClose()
  }, [items.length, onClose])

  if (items.length === 0) return null

  const top = Math.min(point.y, window.innerHeight - 80)
  const left = Math.min(point.x, window.innerWidth - 280)

  return createPortal(
    <div
      data-click-to-component-overlay=""
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose()
      }}
    >
      <dialog
        ref={dialogRef}
        open
        data-click-to-component-contextmenu=""
        aria-label="Open component source"
        style={{ top, left }}
      >
        {items.map(({ source, name, props }, index) => {
          return (
            <button
              key={`${source.fileName}:${source.lineNumber}:${index}`}
              type="button"
              onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                event.preventDefault()
                try {
                  openSourceInEditor(source, editor, pathModifier, projectRoot)
                } catch {
                  // Invalid custom editor URLs should not escape into the host app.
                } finally {
                  onClose()
                }
              }}
            >
              <code>
                {'<'}
                {name}
                {Object.entries(props).map(([name, value]) => (
                  <span key={name} title={String(value)}>
                    {' '}
                    {name}
                  </span>
                ))}
                {'>'}
              </code>
              <cite>
                {source.fileName.replace(/.*\/(src|app|pages)\//, '$1/')}
                <data>{`${source.lineNumber}:${source.columnNumber}`}</data>
              </cite>
            </button>
          )
        })}
      </dialog>
    </div>,
    document.body,
  )
}
