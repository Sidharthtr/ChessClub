import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Chess } from 'chess.js';
import { useSocket } from '../hooks/useSocket';
import ChessBoard from '../components/ChessBoard/Chessboard';
import { setFen ,setStartGame,gameMove, resetGame, setColour, setGameOver} from '../redux/gameSlice';
import { GAME_OVER, INIT_GAME, MOVE } from '../components/message';
import { RootState } from '../redux/store';

const Game = () => {
  const dispatch = useDispatch();
  
  const isGameStarted = useSelector((state: RootState) => state.game.gameStarted);
 
  const socket = useSocket();
  const [color,setColor] = useState('')
  // const [isGameOver, setIsGameOver] = useState(false);
  const [win,setWin] = useState(false)
 const gameOver = useSelector((state: RootState) => state.game.gameOver);
  useEffect(() => {
    if (socket) {
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log(message);
         if (message.type === INIT_GAME) {
                  dispatch(setStartGame(true));
                  setColor(message.payload.color);
                  setWin(false)
                   // Initialize the chess game
                  console.log('Opponent joined the game and game started');
                }
        if (message.type === MOVE) {
          
          dispatch(gameMove(message.payload));
          
        }
        if(message.type === GAME_OVER){
          dispatch(setGameOver(true));
          console.log("gameover")
          if((message.payload.winner==="white" && color==="white")||(message.payload.winner==="black" && color==="black")){
            setWin(true)
          }
          else if((message.payload.winner==="white" && color==="black")||(message.payload.winner==="black" && color==="white")){
            setWin(false)
          }
          console.log(gameOver,win)
      };
    }
    }
  }, [socket, dispatch]);

  const startGame = () => {
    if (socket) {
      console.log('Starting game...');
      socket.send(JSON.stringify({ type: 'init_game' }));
    }
  };

  const exitGame = () => {
    // dispatch(setGame(new Chess())); // Initialize the chess game
    dispatch(resetGame());
  };

  return (
    <div className="flex flex-row space-x-8 justify-center items-start text-white bg-gray-800 h-screen w-full">
      {/* Left Column: Sidebar Options */}
      <div className="flex flex-col bg-gray-900 w-1/5 p-6 h-screen">
        <div className="text-white text-2xl mb-4 text-center">Chess Club</div>
        <ul className="space-y-4">
          <li className="hover:bg-gray-600 p-3 rounded-md cursor-pointer">Play Online</li>
          <li className="hover:bg-gray-600 p-3 rounded-md cursor-pointer">Tournaments</li>
          <li className="hover:bg-gray-600 p-3 rounded-md cursor-pointer">Chess Resources</li>
          <li className="hover:bg-gray-600 p-3 rounded-md cursor-pointer">Chess News</li>
        </ul>

        <div className="mt-auto">
          <div className="hover:bg-gray-600 p-3 rounded-md cursor-pointer mb-4">Settings</div>
          <div className="hover:bg-gray-600 p-3 rounded-md cursor-pointer">Account</div>
        </div>
      </div>
      {/* Middle Column: Chess Board */}
      <div className="flex flex-row justify-center items-start bg-gray-800 w-4/5 p-4">
        <div className="flex flex-row items-start">
          <ChessBoard socket={socket} win={win}/>
        </div>
        <div className="flex flex-col items-center bg-gray-900 p-2 ml-8 w-1/3 min-h-screen justify-center rounded-md">
          <div className="my-12 flex flex-col items-center space-y-4 min-w-full p-4">
            <div className="my-12 flex flex-col items-center space-y-6 rounded-sm min-w-full p-4">
              <select className="bg-gray-700 hover:bg-gray-500 text-white font-bold py-4 px-8 rounded w-full">
                <option value="8">8 min</option>
                <option value="10">10 min</option>
              </select>
              { !isGameStarted? (<button className="bg-lime-700 hover:bg-lime-500 text-white font-bold py-4 px-8 rounded w-full" onClick={startGame}>
                Play Now
              </button>) : (
                <button className="bg-red-500 hover:bg-red-300 text-white font-bold py-4 px-8 rounded w-full" onClick={exitGame}>
                  Exit-Game
                </button>)
                }{isGameStarted &&color!=='' ? (<p className="text-white font-bold text-2xl mt-4">Your Color: {color}</p>):null}
                {gameOver && win && <p className="text-white font-bold text-2xl mt-4">You Win</p>}
                {gameOver && !win &&  <p className="text-white font-bold text-2xl mt-4">You lose:{gameOver}{win}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Game;

