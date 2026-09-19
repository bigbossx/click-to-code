import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClickToCode } from 'click-to-code'

import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {process.env.NODE_ENV === 'development' && (
      <ClickToCode
        editor="vscode"
        projectRoot={__CLICK_TO_CODE_PROJECT_ROOT__}
      />
    )}
    <App />
  </StrictMode>,
)
