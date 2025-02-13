import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Chess } from 'chess.js';

interface GameState {
  fen: string;  // Store only the FEN string
  selectedSquare: string | null;
  gameStarted: boolean;
  gameOver: boolean;
  colour:string | null
}

interface Move {
  from: string;
  to: string;
}

const initialState: GameState = {
  fen: new Chess().fen(),  // Start with the initial FEN
  selectedSquare: null,
  gameStarted: false,
  gameOver: false,
  colour: ''
};

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    setFen(state, action: PayloadAction<string>) {
      state.fen = action.payload;  // Store the FEN string
    },
    setSelectedSquare(state, action: PayloadAction<string | null>) {
      state.selectedSquare = action.payload;
    },
    setStartGame(state, action: PayloadAction<boolean>) {
      state.gameStarted = action.payload;
    },
    setGameOver(state, action: PayloadAction<boolean>) {
      state.gameOver = action.payload;
    },
    setColour(state, action: PayloadAction<string>) {
      state.colour = action.payload
    },
    resetGame(state) {
      state.fen = new Chess().fen();  // Reset to the starting FEN
      state.selectedSquare = null;
      state.gameStarted = false;
      state.gameOver = false;
    },
    // Action to make a move and update the FEN
    gameMove(state, action: PayloadAction<Move>) {
      const chess = new Chess(state.fen);  // Recreate the Chess object from FEN
      const moveResult = chess.move(action.payload);  // Make the move
     
      if (moveResult) {
        state.fen = chess.fen();  // Update the FEN after the move
        
        // console.log(moveResult)
        // Optionally, check if the game is over
        // if (chess.game_over()) {
        //   state.gameOver = true;
        // }
      } else {
        // Handle invalid move case (optional)
        // You might want to dispatch an error message or some other action
        console.error('Invalid move attempted:', action.payload);
      }
    },
  },
});

export const { setFen, setSelectedSquare, setStartGame, setGameOver, resetGame, gameMove,setColour } = gameSlice.actions;
export default gameSlice.reducer;
