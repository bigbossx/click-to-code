import type { ReactNode } from 'react'

import { DevClickToCode } from './DevClickToCode'
import './styles.css'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <DevClickToCode />
        {children}
      </body>
    </html>
  )
}
