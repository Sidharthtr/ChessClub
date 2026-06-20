import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import { useSocket } from '../hooks/useSocket';
import ChessBoard from '../components/ChessBoard/Chessboard';
import GameControls from '../components/GameControls';
import { logout } from '../redux/authSlice';
import {
  setStartGame,
  gameMove,
  resetGame,
  setColour,
  setOpponentUsername,
  setGameOver,
  setClock,
  setWaiting,
  setPendingDraw,
  setPendingTakeback,
  setFenFromServer,
} from '../redux/gameSlice';
import { MessageType } from '../shared/constants/messageTypes';
import { RootState } from '../redux/store';

const TIME_OPTIONS = [
  { label: '10 min — Rapid', value: 600000 },
  { label: '5 min — Blitz', value: 300000 },
  { label: '3 min — Blitz', value: 180000 },
  { label: '1 min — Bullet', value: 60000 },
];

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function ClockBar({
  name,
  colorLabel,
  pieceColor,
  timeMs,
  isActive,
}: {
  name: string;
  colorLabel: string;
  pieceColor: 'white' | 'black';
  timeMs: number;
  isActive: boolean;
}) {
  const isLow = timeMs < 30000 && timeMs > 0;
  return (
    <div
      className={`flex items-center justify-between px-5 py-4 rounded-xl transition-all duration-200 ${
        isActive
          ? 'bg-gray-700 ring-2 ring-green-500'
          : 'bg-gray-800/60'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-6 h-6 rounded-full border-2 shadow-sm flex-shrink-0 ${
            pieceColor === 'white'
              ? 'bg-gray-100 border-gray-300'
              : 'bg-gray-950 border-gray-600'
          }`}
        />
        <div>
          <p className="text-white font-semibold text-sm leading-tight">{name}</p>
          <p className="text-gray-500 text-xs capitalize">{colorLabel}</p>
        </div>
      </div>
      <span
        className={`font-mono text-3xl font-bold tabular-nums tracking-tight ${
          isLow ? 'text-red-400 animate-pulse' : isActive ? 'text-green-300' : 'text-gray-300'
        }`}
      >
        {formatMs(timeMs)}
      </span>
    </div>
  );
}

const Game = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const socket = useSocket();
  const authUser = useSelector((state: RootState) => state.auth.user);
  const {
    gameStarted,
    isWaiting,
    gameOver,
    colour,
    winner,
    gameOverReason,
    fen,
    clockWhiteMs,
    clockBlackMs,
    opponentUsername,
  } = useSelector((state: RootState) => state.game);

  const [selectedTc, setSelectedTc] = useState(TIME_OPTIONS[0].value);
  const [liveWhite, setLiveWhite] = useState(0);
  const [liveBlack, setLiveBlack] = useState(0);

  const chess = new Chess(fen);
  const isMyTurn = colour !== null && colour === (chess.turn() === 'w' ? 'white' : 'black');
  const opponentColor = colour === 'white' ? 'black' : 'white';
  const isWinner = gameOver && winner === colour;
  const isDraw = gameOver && winner === null;

  const myClockMs = colour === 'white' ? liveWhite : liveBlack;
  const opponentClockMs = colour === 'white' ? liveBlack : liveWhite;

  // Sync live clocks whenever server sends a snapshot
  useEffect(() => {
    setLiveWhite(clockWhiteMs ?? selectedTc);
    setLiveBlack(clockBlackMs ?? selectedTc);
  }, [clockWhiteMs, clockBlackMs]);

  // Local 100ms countdown tied to whose turn it is (resets on each FEN change)
  useEffect(() => {
    if (!gameStarted || gameOver) return;
    const activeTurn = chess.turn() === 'w' ? 'white' : 'black';
    const interval = setInterval(() => {
      if (activeTurn === 'white') setLiveWhite(prev => Math.max(0, prev - 100));
      else setLiveBlack(prev => Math.max(0, prev - 100));
    }, 100);
    return () => clearInterval(interval);
  }, [fen, gameStarted, gameOver]);

  // WebSocket message handler
  useEffect(() => {
    if (!socket) return;
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case MessageType.INIT_GAME:
          dispatch(setStartGame(true));
          dispatch(setColour(message.payload.color));
          dispatch(setOpponentUsername(message.payload.opponentUsername ?? null));
          dispatch(setClock({ white: message.payload.timeMs, black: message.payload.timeMs }));
          break;
        case MessageType.MOVE:
          dispatch(gameMove(message.payload.move));
          dispatch(setClock(message.payload.clock));
          break;
        case MessageType.GAME_OVER:
          dispatch(setGameOver({
            winner: message.payload.winner,
            reason: message.payload.reason ?? 'unknown',
          }));
          break;
        case MessageType.DRAW_REQUEST:
          dispatch(setPendingDraw(true));
          break;
        case MessageType.DRAW_REJECT:
          dispatch(setPendingDraw(false));
          break;
        case MessageType.TAKEBACK_REQUEST:
          dispatch(setPendingTakeback(true));
          break;
        case MessageType.TAKEBACK_ACCEPT:
          dispatch(setFenFromServer(message.payload.fen));
          dispatch(setPendingTakeback(false));
          break;
        case MessageType.TAKEBACK_REJECT:
          dispatch(setPendingTakeback(false));
          break;
      }
    };
  }, [socket, dispatch]);

  const startGame = () => {
    dispatch(setWaiting(true));
    socket?.send(JSON.stringify({ type: MessageType.INIT_GAME, timeControlMs: selectedTc }));
  };

  const handleNewGame = () => {
    dispatch(resetGame());
    setLiveWhite(selectedTc);
    setLiveBlack(selectedTc);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Navbar */}
      <nav className="bg-gray-800 border-b border-gray-700/60 px-8 py-3 flex items-center justify-between shrink-0">
        <span className="text-white text-xl font-bold tracking-wide select-none">♟ Chess Club</span>
        <div className="flex items-center gap-6">
          <div className="flex gap-6 text-gray-400 text-sm font-medium">
            <span className="hover:text-white cursor-pointer transition-colors">Play</span>
            <span onClick={() => navigate('/history')} className="hover:text-white cursor-pointer transition-colors">History</span>
            <span className="hover:text-white cursor-pointer transition-colors">Leaderboard</span>
          </div>
          {authUser && (
            <div className="flex items-center gap-3 border-l border-gray-700 pl-6">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center text-xs font-bold text-white">
                  {authUser.username[0].toUpperCase()}
                </div>
                <span className="text-gray-300 text-sm font-medium">{authUser.username}</span>
                <span className="text-gray-500 text-xs">({authUser.rating})</span>
              </div>
              <button
                onClick={() => { dispatch(logout()); navigate('/login'); }}
                className="text-gray-500 hover:text-red-400 text-xs transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Board + Sidebar */}
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 24, flex: 1 }}>

        {/* Chess board — wrapped so it is always a fixed-size flex item */}
        <div style={{ flexShrink: 0 }}>
          <ChessBoard socket={socket} />
        </div>

        {/* Sidebar */}
        <div style={{ width: 288, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 640 }}>

          {/* Opponent bar (top) — only when a game is in progress */}
          {gameStarted ? (
            <ClockBar
              name={opponentUsername ?? 'Opponent'}
              colorLabel={opponentColor}
              pieceColor={opponentColor}
              timeMs={opponentClockMs}
              isActive={!gameOver && !isMyTurn}
            />
          ) : (
            <div className="rounded-xl px-5 py-4 bg-gray-800/30 border border-gray-700/40 text-gray-600 text-sm">
              Opponent
            </div>
          )}

          {/* Middle — grows to fill available space */}
          <div className="flex-1 flex flex-col gap-3">

            {/* Pre-game */}
            {!gameStarted && (
              <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 flex flex-col gap-4 h-full">
                <div>
                  <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">Time Control</p>
                  <select
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2.5 text-sm border border-gray-600 focus:outline-none focus:border-green-500 transition-colors"
                    value={selectedTc}
                    onChange={e => setSelectedTc(parseInt(e.target.value))}
                    disabled={isWaiting}
                  >
                    {TIME_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <button
                  className={`font-bold py-3 rounded-xl w-full transition-all text-sm ${
                    isWaiting
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-500 text-white shadow-lg hover:shadow-green-500/20'
                  }`}
                  onClick={startGame}
                  disabled={isWaiting}
                >
                  {isWaiting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-gray-500 border-t-gray-300 rounded-full animate-spin" />
                      Searching for opponent…
                    </span>
                  ) : (
                    '▶  Play Now'
                  )}
                </button>

                {isWaiting && (
                  <p className="text-gray-500 text-xs text-center leading-relaxed">
                    Waiting for a {TIME_OPTIONS.find(o => o.value === selectedTc)?.label} opponent
                  </p>
                )}
              </div>
            )}

            {/* Active game */}
            {gameStarted && !gameOver && (
              <div className="flex flex-col gap-3 h-full">
                <div className="bg-gray-800 rounded-xl px-5 py-3 border border-gray-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full border ${colour === 'white' ? 'bg-gray-100 border-gray-300' : 'bg-gray-950 border-gray-600'}`} />
                    <span className="text-gray-300 text-sm font-medium capitalize">Playing as {colour}</span>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    isMyTurn ? 'bg-green-600/20 text-green-400' : 'bg-gray-700 text-gray-400'
                  }`}>
                    {isMyTurn ? 'Your turn' : 'Waiting'}
                  </span>
                </div>

                <div className="flex-1">
                  <GameControls socket={socket} />
                </div>
              </div>
            )}

            {/* Post-game result */}
            {gameOver && (
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 flex flex-col items-center gap-4 h-full justify-center">
                {isWinner && (
                  <>
                    <p className="text-5xl">🏆</p>
                    <p className="text-green-400 font-bold text-3xl">You Win!</p>
                  </>
                )}
                {!isDraw && !isWinner && (
                  <>
                    <p className="text-5xl">💀</p>
                    <p className="text-red-400 font-bold text-3xl">You Lose</p>
                  </>
                )}
                {isDraw && (
                  <>
                    <p className="text-5xl">🤝</p>
                    <p className="text-yellow-400 font-bold text-3xl">Draw</p>
                  </>
                )}
                {gameOverReason && (
                  <p className="text-gray-500 text-sm capitalize text-center">
                    {gameOverReason.replace(/_/g, ' ')}
                  </p>
                )}
                <button
                  className="mt-2 bg-green-600 hover:bg-green-500 text-white font-bold py-2.5 px-8 rounded-xl w-full transition-all shadow-lg hover:shadow-green-500/20 text-sm"
                  onClick={handleNewGame}
                >
                  New Game
                </button>
              </div>
            )}
          </div>

          {/* My bar (bottom) — only when a game is in progress */}
          {gameStarted ? (
            <ClockBar
              name={authUser?.username ?? 'You'}
              colorLabel={colour ?? '—'}
              pieceColor={colour === 'white' ? 'white' : 'black'}
              timeMs={myClockMs}
              isActive={!gameOver && isMyTurn}
            />
          ) : (
            <div className="rounded-xl px-5 py-4 bg-gray-800/30 border border-gray-700/40 text-gray-600 text-sm">
              {authUser?.username ?? 'You'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Game;
