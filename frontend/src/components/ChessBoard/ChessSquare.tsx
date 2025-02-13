
import { Color, PieceSymbol, Square } from 'chess.js';

const ChessSquare = ({
    square,
  }: {
    square: {
      square: Square;
      type: PieceSymbol;
      color: Color;
    }|null;
  })=> {
  if (!square) return null;

  const { type, color } = square

  return (
    <div className={`piece ${color}`} style={{ fontSize: '40px' }}>
      {type === 'p' && (color === 'w' ? '♙' : '♟')}
      {type === 'r' && (color === 'w' ? '♖' : '♜')}
      {type === 'n' && (color === 'w' ? '♘' : '♞')}
      {type === 'b' && (color === 'w' ? '♗' : '♝')}
      {type === 'q' && (color === 'w' ? '♕' : '♛')}
      {type === 'k' && (color === 'w' ? '♔' : '♚')}
    </div>
  );
};

export default ChessSquare;
