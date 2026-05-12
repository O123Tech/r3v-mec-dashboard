import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
import { MechanicApp } from './MechanicApp'

createRoot(document.getElementById('mechanic-root')!).render(
  <StrictMode>
    <MechanicApp />
  </StrictMode>,
)
