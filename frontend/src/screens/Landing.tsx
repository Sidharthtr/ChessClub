import { useNavigate } from "react-router-dom";
import chessBoard from "../assets/chess_board.webp";
const Landing = () => {
  const navigate = useNavigate();
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
      <div className="text-4xl font-bold font-serif text-center text-white animate__animated animate__fadeIn animate__delay-2s">
        Welcome to Chess Club
      </div>
      <div className="mt-6 text-center">
        <button
          onClick={() => navigate("/game")}
          className="bg-gray-700 hover:bg-gray-600 text-white m-4 rounded-lg  hover:text-xl inline-block text-lg p-4 transition-all duration-300 transform hover:scale-105"
        >
          Play Now
        </button>
      </div>
    </div>
  </div>
  )
}

export default Landing

