import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { ImpersonationProvider } from './context/ImpersonationContext.jsx'
import { BusinessProvider } from './context/BusinessContext.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ImpersonationProvider>
          <BusinessProvider>
            <App />
          </BusinessProvider>
        </ImpersonationProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
