import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import './index.css'

// Apply saved theme before first render to avoid flash
const savedTheme = (localStorage.getItem('theme') ?? 'dark') as 'dark' | 'light'
document.documentElement.setAttribute('data-theme', savedTheme)
if (savedTheme === 'dark') {
  document.documentElement.classList.add('dark')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
