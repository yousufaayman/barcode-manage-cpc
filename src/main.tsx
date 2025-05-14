
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Set document title
document.title = 'Cotton Plus Clothing - IMS';

createRoot(document.getElementById("root")!).render(<App />);
