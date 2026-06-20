import './App.css';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import Game from './screens/Game';
import Login from './screens/Login';
import Register from './screens/Register';
import History from './screens/History';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <div className="h-screen w-full bg-slate-950">
      <BrowserRouter>
        <Routes>
          {/* / goes straight to game (ProtectedRoute sends to /login if not authenticated) */}
          <Route path="/" element={<Navigate to="/game" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/game"
            element={
              <ProtectedRoute>
                <Game />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <History />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/game" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
