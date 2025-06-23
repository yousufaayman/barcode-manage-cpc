import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './i18n' // Import i18n configuration

document.title = 'Cotton Plus Clothing - BMS';

createRoot(document.getElementById("root")!).render(<App />);
