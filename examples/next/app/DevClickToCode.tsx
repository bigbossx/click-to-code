'use client'

import { ClickToCode } from 'click-to-code'

export function DevClickToCode() {
  if (process.env.NODE_ENV !== 'development') return null
  return <ClickToCode editor="vscode" />
}
