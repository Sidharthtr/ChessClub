import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Chess, Square } from 'chess.js';
import ChessSquare from './ChessSquare';
import Confetti from 'react-confetti';
import { RootState } from '../../redux/store';
import { gameMove, setSelectedSquare, setGameOver } from '../../redux/gameSlice';
import { GAME_OVER, MOVE } from '../message';
import BetterLuckSign from '../Constants/betterLuckNextTime';

const ChessBoard: React.FC<{ socket?: WebSocket | null ,win:boolean}> = ({ socket ,win}) => {
  const dispatch = useDispatch();
  const fen = useSelector((state: RootState) => state.game.fen);
  const selectedSquare = useSelector((state: RootState) => state.game.selectedSquare);
  const gameOver = useSelector((state: RootState) => state.game.gameOver);
  const boxSize = 80;

  const game = new Chess(fen);  // Create Chess instance from the current FEN

  const makeMove = (move: { from: string, to: string }) => {
    if (socket) {
      // Send the move to the backend
      socket.send(JSON.stringify({
        type: MOVE,
        move: move
      }));
    }
  };

  const handleSquareClick = (square: Square) => {
    if (selectedSquare === square) {
      // Unselect the square if it's already selected
      dispatch(setSelectedSquare(null));
    } else if (selectedSquare) {
      // Attempt to make a move if a square is already selected
      console.log(fen)
      // dispatch(gameMove({ from: selectedSquare, to: square }));
      makeMove({ from: selectedSquare, to: square });
      dispatch(setSelectedSquare(null));
    } else {
      // Select a square
      dispatch(setSelectedSquare(square));
    }
  };

  // Reset game after it's over
  // useEffect(() => {
  //   if (gameOver) {
  //     setTimeout(() => {
  //       dispatch(setGameOver(false));
  //     }, 5000);
  //   }
  // }, [gameOver, dispatch]);

  const renderBoard = () => {
    return game.board().map((row, i) => (
      <div className="flex" key={i}>
        {row.map((square, j) => {
          const squareRepresentation = `${String.fromCharCode(97 + j)}${8 - i}`;
          return (
            <div
              key={j}
              onClick={() => handleSquareClick(squareRepresentation as Square)}
              style={{
                width: boxSize,
                height: boxSize,
                backgroundColor: selectedSquare === squareRepresentation ? 'black' :
                  ((i + j) % 2 === 0 ? '#f0d9b5' : '#417519'),
              }}
              className="square relative flex justify-center items-center"
            >
              <ChessSquare square={square} />
            </div>
          );
        })}
      </div>
    ));
  };

  return (
    <div className="chess-board inline-block mt-12 border-2 border-black">
      {(gameOver && win)? <Confetti />:null}
      {(gameOver && !win)?<BetterLuckSign/>:null}
      {renderBoard()}
    </div>
  );
};

export default ChessBoard;
