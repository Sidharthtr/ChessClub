import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { Square } from 'chess.js';
import { Chess } from 'chess.js';
import ChessSquare from './ChessSquare';
import Confetti from 'react-confetti';
import type { RootState } from '../../redux/store';
import { setSelectedSquare } from '../../redux/gameSlice';
import { MessageType } from '../../shared/constants/messageTypes';
import BetterLuckSign from '../Constants/betterLuckNextTime';

const ChessBoard: React.FC<{ socket?: WebSocket | null }> = ({ socket }) => {
  const dispatch = useDispatch();
  const { fen, selectedSquare, gameOver, colour, winner } = useSelector(
    (state: RootState) => state.game,
  );
  const boxSize = 80;

  const game = new Chess(fen);
  const isMyTurn = colour === (game.turn() === 'w' ? 'white' : 'black');
  const isWinner = gameOver && winner === colour;
  const isDraw = gameOver && winner === null;

  // Black plays from the bottom — flip when we're the black player
  const flipped = colour === 'black';

  // When the side to move is in check, find their king's square so we can
  // paint it red. chess.js doesn't expose the king position directly — scan
  // the board for the king of the player whose turn it is.
  const checkedKingSquare: Square | null = (() => {
    if (!game.inCheck()) return null;
    const sideToMove = game.turn();
    for (const row of game.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === sideToMove) {
          return cell.square;
        }
      }
    }
    return null;
  })();

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
    const rows = flipped ? [...game.board()].reverse() : game.board();

    return rows.map((row, i) => {
      const cells = flipped ? [...row].reverse() : row;

      return (
        <div className="flex" key={i}>
          {cells.map((square, j) => {
            // Compute the actual chess square id for this display cell
            const rank = flipped ? i + 1 : 8 - i;
            const fileIndex = flipped ? 7 - j : j;
            const squareId = `${String.fromCharCode(97 + fileIndex)}${rank}` as Square;

            const isSelected = selectedSquare === squareId;
            const isDark = (i + j) % 2 !== 0;
            const isCheckedKing = squareId === checkedKingSquare;

            // Check highlight takes priority over selection highlight so the
            // player can't miss it — the king is in danger right now.
            const bgColor = isCheckedKing
              ? '#e63946'
              : isSelected
                ? '#aaa23a'
                : isDark
                  ? '#b58863'
                  : '#f0d9b5';

            return (
              <div
                key={j}
                onClick={() => handleSquareClick(squareId)}
                style={{
                  width: boxSize,
                  height: boxSize,
                  backgroundColor: bgColor,
                  boxShadow: isCheckedKing ? 'inset 0 0 20px rgba(0,0,0,0.4)' : undefined,
                }}
                className="square relative flex justify-center items-center cursor-pointer"
              >
                <ChessSquare square={square} />
              </div>
            );
          })}
        </div>
      );
    });
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
