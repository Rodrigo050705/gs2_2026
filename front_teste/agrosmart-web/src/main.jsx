import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { instalarAvisoDeSessao } from './api'

// Antes de qualquer tela: um 401 da API leva de volta ao login.
instalarAvisoDeSessao()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
