import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initSiteThemeFromStorage } from './siteTheme'
import './index.css'
import App from './App.jsx'

initSiteThemeFromStorage()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
