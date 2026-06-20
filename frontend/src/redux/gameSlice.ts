import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Chess } from 'chess.js';

type Color = 'white' | 'black' | null;

interface GameState {
  fen: string;
  selectedSquare: string | null;
  gameStarted: boolean;
  isWaiting: boolean;
  gameOver: boolean;
  gameOverReason: string | null;
  winner: string | null;
  colour: Color;
  opponentUsername: string | null;
  pendingDrawRequest: boolean;
  pendingTakebackRequest: boolean;
  clockWhiteMs: number | null;
  clockBlackMs: number | null;
}

interface Move {
  from: string;
  to: string;
}

const initialState: GameState = {
  fen: new Chess().fen(),
  selectedSquare: null,
  gameStarted: false,
  isWaiting: false,
  gameOver: false,
  gameOverReason: null,
  winner: null,
  colour: null,
  opponentUsername: null,
  pendingDrawRequest: false,
  pendingTakebackRequest: false,
  clockWhiteMs: null,
  clockBlackMs: null,
};

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    setFen(state, action: PayloadAction<string>) {
      state.fen = action.payload;
    },
    setSelectedSquare(state, action: PayloadAction<string | null>) {
      state.selectedSquare = action.payload;
    },
    setWaiting(state, action: PayloadAction<boolean>) {
      state.isWaiting = action.payload;
    },
    setStartGame(state, action: PayloadAction<boolean>) {
      state.gameStarted = action.payload;
      if (action.payload) state.isWaiting = false;
    },
    setGameOver(state, action: PayloadAction<{ winner: string | null; reason: string }>) {
      state.gameOver = true;
      state.winner = action.payload.winner;
      state.gameOverReason = action.payload.reason;
    },
    setColour(state, action: PayloadAction<Color>) {
      state.colour = action.payload;
    },
    setOpponentUsername(state, action: PayloadAction<string | null>) {
      state.opponentUsername = action.payload;
    },
    setClock(state, action: PayloadAction<{ white: number; black: number }>) {
      state.clockWhiteMs = action.payload.white;
      state.clockBlackMs = action.payload.black;
    },
    setPendingDraw(state, action: PayloadAction<boolean>) {
      state.pendingDrawRequest = action.payload;
    },
    setPendingTakeback(state, action: PayloadAction<boolean>) {
      state.pendingTakebackRequest = action.payload;
    },
    setFenFromServer(state, action: PayloadAction<string>) {
      state.fen = action.payload;
    },
    resetGame(state) {
      state.fen = new Chess().fen();
      state.selectedSquare = null;
      state.gameStarted = false;
      state.isWaiting = false;
      state.gameOver = false;
      state.gameOverReason = null;
      state.winner = null;
      state.colour = null;
      state.opponentUsername = null;
      state.pendingDrawRequest = false;
      state.pendingTakebackRequest = false;
      state.clockWhiteMs = null;
      state.clockBlackMs = null;
    },
    gameMove(state, action: PayloadAction<Move>) {
      const chess = new Chess(state.fen);
      const moveResult = chess.move(action.payload);
      if (moveResult) {
        state.fen = chess.fen();
      } else {
        console.error('Invalid move from server:', action.payload);
      }
    },
  },
});

export const {
  setFen,
  setSelectedSquare,
  setWaiting,
  setStartGame,
  setGameOver,
  setColour,
  setOpponentUsername,
  setClock,
  setPendingDraw,
  setPendingTakeback,
  setFenFromServer,
  resetGame,
  gameMove,
} = gameSlice.actions;

export default gameSlice.reducer;
