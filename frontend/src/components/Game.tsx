import React, { useState, useEffect } from 'react';
// import ChessBoard from './Chessboard';
import { Chess } from 'chess.js';
import ChessBoard from './Chessboard';

const App: React.FC = () => {
  const [game, setGame] = useState(new Chess());
  const [isGameStarted, setIsGameStarted] = useState(false); // State to track if the game has started

  useEffect(() => {
    // If the game state has changed (e.g., after a move), we can log the board position or take any action
    if (isGameStarted) {
      console.log(game.fen()); // Log the board's FEN string
    }
  }, [game, isGameStarted]); // Depend on `game` and `isGameStarted` state

  const startGame = () => {
    setGame(new Chess()); // Initialize the chess game
    setIsGameStarted(true); // Set game as started
  };

  const exitGame = () => {
    setGame(new Chess()); // Initialize the chess game
    setIsGameStarted(false); // Set game as not started 
  }

  return (
    <div className="flex flex-row space-x-8 justify-center items-start text-white bg-gray-800 h-screen w-full">
      {/* <!-- Left Column: Sidebar Options -- > */}
      <div className="flex flex-col bg-gray-900 w-1/5 p-6 h-screen">
        <div className="text-white text-2xl mb-4 text-center">Chess Club</div>

        {/* Sidebar list */}
        <ul className="space-y-4">
          <li className=" hover:bg-gray-600 p-3 rounded-md cursor-pointer">Play Online</li>
          <li className=" hover:bg-gray-600 p-3 rounded-md cursor-pointer">Tournaments</li>
          <li className=" hover:bg-gray-600 p-3 rounded-md cursor-pointer">Chess Resources</li>
          <li className=" hover:bg-gray-600 p-3 rounded-md cursor-pointer">Chess News</li>
        </ul>

        {/* Bottom Section: Settings and Account */}
        <div className="mt-auto">
          <div className=" hover:bg-gray-600 p-3 rounded-md  cursor-pointer mb-4">Settings</div>
          <div className=" hover:bg-gray-600 p-3 rounded-md  cursor-pointer">Account</div>
        </div>
      </div>

      {/* <!-- Middle Column: Chess Board --> */}
      <div className="flex flex-row justify-center items-start bg-gray-800 w-4/5 p-4">
        <div className='flex flex-row items-start'>
          <ChessBoard chess={game} setGame={setGame} setIsGameStarted={setIsGameStarted}/>
        </div>
        <div className="flex flex-col items-center bg-gray-900 p-2 ml-8 w-1/3 min-h-screen justify-center rounded-md">
          <div className=" my-12 flex flex-col items-center space-y-4  min-w-full p-4">
            {/* <!-- Timer Dropdown Button --> */}
            <div className="my-12 flex flex-col items-center space-y-6 rounded-sm min-w-full p-4">
              {/* Timer Dropdown */}
              <select className="bg-gray-700 hover:bg-gray-500 text-white font-bold py-4 px-8 rounded w-full">
                <option value="8">8 min</option>
                <option value="10">10 min</option>
                <option value="12">12 min</option>
              </select>

              {/* Play Now Button */}
              {!isGameStarted ? (<button className="bg-lime-700 hover:bg-lime-500 text-white font-bold py-4 px-8 rounded w-full" onClick={startGame}>
                Play Now
              </button>) : (
                <button className="bg-red-500 hover:bg-red-300 text-white font-bold py-4 px-8 rounded w-full" onClick={exitGame}>
                  Exit-Game
                </button>)}

            </div>

            {/* <!-- Play Now Button --> */}

          </div>
        </div>
      </div>



    </div>


  );
};

export default App;

