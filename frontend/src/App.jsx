import { Link } from 'react-router-dom'
import RoutesConfig from './routes'
import Navbar from './components/Navbar'
import './styles/global.css'

export default function App() {
  return (
    <div className="app">
      <Navbar />
      <main className="container">
        <RoutesConfig />
      </main>
      <footer className="footer">
        <span>ATGS © {new Date().getFullYear()}</span>
        <span>
          <Link to="/privacy">Privacy</Link>
        </span>
      </footer>
    </div>
  )
}
