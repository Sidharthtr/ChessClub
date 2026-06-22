import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import chessBoard from '../assets/chess_board.webp';
import type { RootState } from '../redux/store';

const Landing = () => {
  const navigate = useNavigate();
  const token = useSelector((state: RootState) => state.auth.token);

  return (
    <div className="flex text-white items-center justify-center min-h-screen bg-gradient-to-r from-black via-gray-800 to-slate-400 m-0 p-0">
      <div className="m-4 animate__animated animate__fadeIn animate__delay-1s">
        <img
          src={chessBoard}
          alt="Chess Board"
          height="400"
          width="400"
          className="rounded-xl shadow-lg transform transition duration-500 hover:scale-105"
        />
      </div>
      <div className="flex flex-col justify-center m-4 p-6 bg-black bg-opacity-60 rounded-xl shadow-xl animate__animated animate__fadeIn animate__delay-1s">
        <div className="text-4xl font-bold font-serif text-center text-white">
          Welcome to Chess Club
        </div>
        <div className="mt-6 flex flex-col items-center gap-3">
          {token ? (
            <>
              <button
                onClick={() => navigate('/game')}
                className="bg-green-600 hover:bg-green-500 text-white rounded-lg px-8 py-3 text-lg font-bold transition-all duration-300 w-48"
              >
                Play Now
              </button>
              <button
                onClick={() => navigate('/history')}
                className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-8 py-3 text-base transition-all duration-300 w-48"
              >
                My History
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => navigate('/register')}
                className="bg-green-600 hover:bg-green-500 text-white rounded-lg px-8 py-3 text-lg font-bold transition-all duration-300 w-48"
              >
                Get Started
              </button>
              <button
                onClick={() => navigate('/login')}
                className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-8 py-3 text-base transition-all duration-300 w-48"
              >
                Sign In
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Landing;
