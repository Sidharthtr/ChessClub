import { useNavigate } from "react-router-dom";
import chessBoard from "../assets/chess_board.webp";
const Landing = () => {
  const navigate = useNavigate();
  return (
    <div className="text-center text-white flex flex-row justify-center align-center mt-4">
      <div className="m-4">
         <img src={chessBoard} alt="" 
         height="400"
         width="400"/>
      </div>
      <div className="flex flex-col justify-center m-4 p-4">
         <div className="text-4xl font-bold font-serif">Welcome 
         to 
         Chess Club</div>
         <div className="mt-4">
          <button onClick={()=>{
             navigate("/game")
          }}className="bg-blue-900 m-4 rounded-lg hover:bg-blue-800 hover:text-xl inline-block text-lg p-4">Play Now</button>
         </div>
      </div>
    </div>
  )
}

export default Landing

