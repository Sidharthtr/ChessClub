

// import React, { useState, useEffect } from 'react';
// import { Chess, Square } from 'chess.js';
// import ChessSquare from './ChessSquare';
// import Confetti from 'react-confetti';
// import { GAME_OVER, MOVE } from './message';

// const ChessBoard: React.FC<{
//   game: Chess;
//   setGame: React.Dispatch<React.SetStateAction<Chess>>;
//   setIsGameStarted: React.Dispatch<React.SetStateAction<boolean>>;
//   isGameStarted: boolean;
//   socket?: WebSocket | null;
// }> = ({ game, setGame, isGameStarted, setIsGameStarted, socket }) => {
//   const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
//   const [gameOver, setGameOver] = useState(false);
//   const boxSize = 80;
  

//   // Function to handle selecting a square

//   const makeMove = (move: { from: string, to: string }) => {
//     if (socket && isGameStarted) {
//       // Send the move to the backend
//       socket?.send(JSON.stringify({
//         type: MOVE,
//         move: move
//       }));

//       // Update the game state with the move
//       // chess.move(move);
     
//         // Update the board
      
//     }
//   };


//   const handleSquareClick = (square: Square) => {
//     console.log(selectedSquare);
     
//     if (selectedSquare === square) {
//       // Unselect the square if it's already selected
//       setSelectedSquare(null);
      
//     } else if (selectedSquare) {
//       // Attempt to make a move if a square is already selected
//       console.log("1.while sending ..",game.fen())
//       const move = game.move({ from: selectedSquare, to: square });
//       console.log("2.while sending ..",game.fen())
//       if (move) {
//         setGame(new Chess(game.fen()));
//         makeMove({ from: selectedSquare, to: square }); // Update game state with new board
//         setSelectedSquare(null);
       
//         if (move?.flags.includes('c')) {
//           // If a capture happened, you can trigger sound effects here
//         }
//         if (game.isGameOver()) {
//           setGameOver(true); // Handle game over
//           setIsGameStarted(false);
//           socket?.send(JSON.stringify({ type: GAME_OVER }));
//         }
//       } else {
//         // Invalid move, keep the selected square
//         setSelectedSquare(square);

//       }
//     } else {
//       // Select a square
//       setSelectedSquare(square);
  
//     }
//   };

//   // Reset game after it's over
//   useEffect(() => {
//     if (gameOver) {
//       setTimeout(() => {
//         setGame(new Chess());
//         setGameOver(false);
//       }, 5000);
//     }
//   }, [gameOver, setGame]);

//   const renderBoard = () => {
//     return game.board().map((row, i) => (
//       <div className="flex" key={i}>
//         {row.map((square, j) => {
//           const squareRepresentation = `${String.fromCharCode(97 + j)}${8 - i}`;
//           // const isLegalMove = legalMoves.includes(squareRepresentation);
//           return (
//             <div
//               key={j}
//               onClick={() => handleSquareClick(squareRepresentation as Square)}
//               style={{
//                 width: boxSize,
//                 height: boxSize,
//                 backgroundColor: selectedSquare == squareRepresentation ? 'black' :
//                   ((i + j) % 2 === 0 ? '#f0d9b5' : '#417519'),
//               }}
//               className="square relative flex justify-center items-center"
//             >

//               <ChessSquare square={square} />
//               {/* {isLegalMove && <LegalMoveIndicator />} */}
//             </div>
//           );
//         })}
//       </div>
//     ));
//   };

//   return (
//     <div className="chess-board inline-block mt-12 border-2 border-black">
//       {gameOver && <Confetti />}
//       {renderBoard()}
//     </div>
//   );
// };

// export default ChessBoard;

