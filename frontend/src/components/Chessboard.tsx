

import React, { useState, useEffect } from 'react';
import { Chess, Square } from 'chess.js';
import ChessSquare from './ChessSquare';
import LegalMoveIndicator from './LegalMoveIndicator';
import Confetti from 'react-confetti';

const ChessBoard: React.FC<{
  chess: Chess;
  setGame: React.Dispatch<React.SetStateAction<Chess>>;
  setIsGameStarted: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({ chess, setGame,setIsGameStarted }) => {
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoves, setLegalMoves] = useState<string[]>([]);  
  const [gameOver, setGameOver] = useState(false);
  const boxSize = 80;

  // Function to handle selecting a square
  const handleSquareClick = (square: Square) => {
    if (selectedSquare) {
      const move = chess.move({ from: selectedSquare, to: square });
      if (move) {
        setGame(new Chess(chess.fen())); // Update game state with new board
        setSelectedSquare(null);
        if (move?.flags.includes('c')) {
          // If a capture happened, you can trigger sound effects here
        }
        if (chess.isGameOver()) {
          setGameOver(true); // Handle game over
          setIsGameStarted(false);
          
        }
      }
    } else {
      // Select a square
      setSelectedSquare(square);
      const moves: string[] = chess.moves({ square });
      setLegalMoves(moves);
    }
  };

  // Reset game after it's over
  useEffect(() => {
    if (gameOver) {
      setTimeout(() => {
        setGame(new Chess());
        setGameOver(false);
      }, 5000);
    }
  }, [gameOver, setGame]);

  const renderBoard = () => {
    return chess.board().map((row, i) => (
      <div className="flex" key={i}>
        {row.map((square, j) => {
          const squareRepresentation = `${String.fromCharCode(97 + j)}${8 - i}`;
          const isLegalMove = legalMoves.includes(squareRepresentation);
          return (
            <div
              key={j}
              onClick={() => handleSquareClick(squareRepresentation as Square)}
              style={{
                width: boxSize,
                height: boxSize,
                backgroundColor: (i + j) % 2 === 0 ? '#f0d9b5' : '#417519',
              }}
              className="square relative flex justify-center items-center"
            >
              <ChessSquare square={square} />
              {isLegalMove && <LegalMoveIndicator />}
            </div>
          );
        })}
      </div>
    ));
  };

  return (
    <div className="chess-board inline-block mt-12 border-2 border-black">
      {gameOver && <Confetti />}
      {renderBoard()}
    </div>
  );
};

export default ChessBoard;

