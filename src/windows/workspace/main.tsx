import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../shared/styles.css'
import Workspace from './Workspace.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Workspace />
  </StrictMode>,
)
