import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Chess, Square } from 'chess.js';
import ChessSquare from './ChessSquare';
import Confetti from 'react-confetti';
import { RootState } from '../../redux/store';
import { setSelectedSquare } from '../../redux/gameSlice';
import { MessageType } from '../../shared/constants/messageTypes';
import BetterLuckSign from '../Constants/betterLuckNextTime';

const ChessBoard: React.FC<{ socket?: WebSocket | null }> = ({ socket }) => {
  const dispatch = useDispatch();
  const { fen, selectedSquare, gameOver, colour, winner } = useSelector(
    (state: RootState) => state.game
  );
  const boxSize = 80;

  const game = new Chess(fen);
  const isMyTurn = colour === (game.turn() === 'w' ? 'white' : 'black');
  const isWinner = gameOver && winner === colour;
  const isDraw = gameOver && winner === null;

  const makeMove = (move: { from: string; to: string }) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: MessageType.MOVE, move }));
    }
  };

  const handleSquareClick = (square: Square) => {
    if (gameOver) return;

    if (selectedSquare) {
      if (selectedSquare === square) {
        dispatch(setSelectedSquare(null));
        return;
      }
      if (isMyTurn) makeMove({ from: selectedSquare, to: square });
      dispatch(setSelectedSquare(null));
    } else {
      if (!isMyTurn) return;
      const piece = game.get(square);
      if (!piece || piece.color !== (colour === 'white' ? 'w' : 'b')) return;
      dispatch(setSelectedSquare(square));
    }
  };

  const renderBoard = () => {
    return game.board().map((row, i) => (
      <div className="flex" key={i}>
        {row.map((square, j) => {
          const squareId = `${String.fromCharCode(97 + j)}${8 - i}`;
          return (
            <div
              key={j}
              onClick={() => handleSquareClick(squareId as Square)}
              style={{
                width: boxSize,
                height: boxSize,
                backgroundColor:
                  selectedSquare === squareId
                    ? '#aaa23a'
                    : (i + j) % 2 === 0
                    ? '#f0d9b5'
                    : '#b58863',
              }}
              className="square relative flex justify-center items-center cursor-pointer"
            >
              <ChessSquare square={square} />
            </div>
          );
        })}
      </div>
    ));
  };

  return (
    <div className="chess-board inline-block border-2 border-gray-700 shadow-2xl">
      {isWinner && !isDraw && <Confetti />}
      {gameOver && !isWinner && !isDraw && <BetterLuckSign />}
      {renderBoard()}
    </div>
  );
};

export default ChessBoard;
