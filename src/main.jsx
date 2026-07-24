import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { MetaProvider } from './lib/meta'
import { HouseholdProvider } from './lib/household'
import { ThemeProvider } from './lib/theme'
import './tailwind.css'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <HouseholdProvider>
        <MetaProvider>
          <App />
        </MetaProvider>
      </HouseholdProvider>
    </ThemeProvider>
  </React.StrictMode>
)
