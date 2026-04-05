import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import CaptureApp from './CaptureApp'
import './styles/themes.css'
import './print.css'

const isCapture = window.location.hash === '#capture'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isCapture ? <CaptureApp /> : <App />}
  </React.StrictMode>
)
