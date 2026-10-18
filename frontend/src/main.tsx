import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { PublicDemoApp } from './PublicDemoApp'
import './styles/theme.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    {import.meta.env.VITE_CAIL_PUBLIC_DEMO === '1' ? <PublicDemoApp /> : <App />}
  </StrictMode>,
)
