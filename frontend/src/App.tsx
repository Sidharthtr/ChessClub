
import './App.css'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Landing from './components/Landing'
import Game from './components/Game'

function App() {
 

  return (
    <>
    <div className='h-screen w-full bg-slate-950'>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing/>}/>
        <Route path="/game" element={<Game />}/> 
      </Routes>
    </BrowserRouter>
    </div>
    </>
  )
}

export default App
