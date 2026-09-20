import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'

import { getReactInstancesForElement, getSourceForInstance } from './reactFiber'
import {
  openSourceInEditor,
  resolveApplicationSource,
} from './sourceNavigation'
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
  const unresolvedItems = useMemo(
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
  const [items, setItems] = useState(unresolvedItems)

  useEffect(() => {
    let cancelled = false
    setItems(unresolvedItems)

    void Promise.all(
      unresolvedItems.map(async (item) => {
        try {
          const source = await resolveApplicationSource(item.source)
          return source ? { ...item, source } : undefined
        } catch {
          return
        }
      }),
    ).then((resolvedItems) => {
      if (!cancelled) {
        setItems(resolvedItems.filter((item) => item !== undefined))
      }
    })

    return () => {
      cancelled = true
    }
  }, [unresolvedItems])

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
                  openSourceInEditor(
                    items.slice(index).map((item) => item.source),
                    editor,
                    pathModifier,
                    projectRoot,
                  )
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
                {getDisplayPath(source.fileName, projectRoot)}
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

function getDisplayPath(fileName: string, projectRoot?: string): string {
  const normalizedFile = fileName.replace(/\\/g, '/')
  const normalizedRoot = projectRoot?.replace(/\\/g, '/').replace(/\/+$/, '')
  if (normalizedRoot && normalizedFile.startsWith(`${normalizedRoot}/`)) {
    return normalizedFile.slice(normalizedRoot.length + 1)
  }

  return normalizedFile.replace(/.*\/(src|app|pages)\//, '$1/')
}
