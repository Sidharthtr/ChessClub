import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import { useSocket } from '../hooks/useSocket';
import ChessBoard from '../components/ChessBoard/Chessboard';
import GameControls from '../components/GameControls';
import { logout, updateRating } from '../redux/authSlice';
import {
  setStartGame,
  gameMove,
  resetGame,
  setColour,
  setGameId,
  setOpponentUsername,
  setGameOver,
  setClock,
  setWaiting,
  setPendingDraw,
  setPendingTakeback,
  setPendingRematch,
  setOutgoingRematch,
  setRatingChange,
  setFenFromServer,
} from '../redux/gameSlice';
import { MessageType } from '../shared/constants/messageTypes';
import type { RootState } from '../redux/store';

interface TimeOption {
  label: string;
  baseMs: number;
  incrementMs: number;
}

const TIME_OPTIONS: TimeOption[] = [
  { label: '10 min — Rapid', baseMs: 600_000, incrementMs: 0 },
  { label: '10+5 — Rapid', baseMs: 600_000, incrementMs: 5_000 },
  { label: '15+10 — Rapid', baseMs: 900_000, incrementMs: 10_000 },
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
        isActive ? 'bg-gray-700 ring-2 ring-green-500' : 'bg-gray-800/60'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-6 h-6 rounded-full border-2 shadow-sm flex-shrink-0 ${
            pieceColor === 'white' ? 'bg-gray-100 border-gray-300' : 'bg-gray-950 border-gray-600'
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
    pendingRematchRequest,
    outgoingRematch,
    ratingChange,
  } = useSelector((state: RootState) => state.game);

  const [selectedTcIdx, setSelectedTcIdx] = useState(0);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);

  // ── Timestamp-based clock ───────────────────────────────────────────────────
  // Store the last server clock snapshot + the moment it arrived.
  // All display values are derived from this ref — no drift ever accumulates.
  const clockRefRef = useRef<{ white: number; black: number; receivedAt: number } | null>(null);
  const [, setTick] = useState(0); // used only to force a re-render every 50 ms

  const chess = new Chess(fen);
  const activeTurn = chess.turn() === 'w' ? 'white' : 'black';

  // 50 ms repaint loop — just for clock display
  useEffect(() => {
    if (!gameStarted || gameOver) return;
    const id = setInterval(() => setTick((t) => t + 1), 50);
    return () => clearInterval(id);
  }, [gameStarted, gameOver]);

  // Compute live clock values from the timestamp-anchored snapshot
  const ref = clockRefRef.current;
  const elapsedSinceSnapshot = ref ? Math.max(0, Date.now() - ref.receivedAt) : 0;
  const liveWhite = ref
    ? Math.max(0, ref.white - (activeTurn === 'white' ? elapsedSinceSnapshot : 0))
    : (clockWhiteMs ?? TIME_OPTIONS[selectedTcIdx].baseMs);
  const liveBlack = ref
    ? Math.max(0, ref.black - (activeTurn === 'black' ? elapsedSinceSnapshot : 0))
    : (clockBlackMs ?? TIME_OPTIONS[selectedTcIdx].baseMs);

  const opponentColor = colour === 'white' ? 'black' : 'white';
  const isMyTurn = colour !== null && colour === activeTurn;
  const isWinner = gameOver && winner === colour;
  const isDraw = gameOver && winner === null;
  const myClockMs = colour === 'white' ? liveWhite : liveBlack;
  const opponentClockMs = colour === 'white' ? liveBlack : liveWhite;

  // WebSocket message handler
  useEffect(() => {
    if (!socket) return;
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case MessageType.INIT_GAME:
          // Reset every stale piece of the previous game first — game-over
          // overlay, winner, rating change, pending rematch flags. Without
          // this the new game starts under the prior game's gameOver=true,
          // so the requester stays stuck on the "Game Over" panel.
          dispatch(resetGame());
          dispatch(setStartGame(true));
          dispatch(setColour(message.payload.color));
          dispatch(setGameId(message.payload.gameId));
          dispatch(setOpponentUsername(message.payload.opponentUsername ?? null));
          dispatch(setClock({ white: message.payload.timeMs, black: message.payload.timeMs }));
          dispatch(setFenFromServer(new Chess().fen()));
          clockRefRef.current = {
            white: message.payload.timeMs,
            black: message.payload.timeMs,
            receivedAt: Date.now(),
          };
          setOpponentDisconnected(false);
          break;

        case MessageType.GAME_RESUME:
          dispatch(setStartGame(true));
          dispatch(setColour(message.payload.color));
          dispatch(setGameId(message.payload.gameId));
          dispatch(setOpponentUsername(message.payload.opponentUsername ?? null));
          dispatch(setFenFromServer(message.payload.fen));
          dispatch(setClock(message.payload.clock));
          clockRefRef.current = { ...message.payload.clock, receivedAt: Date.now() };
          setOpponentDisconnected(false);
          break;

        case MessageType.MOVE:
          dispatch(gameMove(message.payload.move));
          dispatch(setClock(message.payload.clock));
          clockRefRef.current = { ...message.payload.clock, receivedAt: Date.now() };
          setOpponentDisconnected(false);
          break;

        case MessageType.GAME_OVER:
          dispatch(
            setGameOver({
              winner: message.payload.winner,
              reason: message.payload.reason ?? 'unknown',
            }),
          );
          setOpponentDisconnected(false);
          break;

        case MessageType.RATING_UPDATE:
          dispatch(updateRating(message.payload.newRating));
          dispatch(setRatingChange(message.payload.change));
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

        case MessageType.REMATCH_REQUEST:
          dispatch(setPendingRematch(true));
          break;

        case MessageType.REMATCH_REJECT:
          // Clear both sides: the incoming-request modal (if any) AND our own
          // outgoing-wait state (in case the rejecter is responding to us).
          dispatch(setPendingRematch(false));
          dispatch(setOutgoingRematch(false));
          break;

        case MessageType.GAME_ALERT:
          if (typeof message.payload === 'string') {
            if (message.payload.includes('disconnected')) setOpponentDisconnected(true);
            if (message.payload.includes('reconnected')) setOpponentDisconnected(false);
          }
          break;
      }
    };
  }, [socket, dispatch]);

  const send = (type: string, payload?: object) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, ...payload }));
    }
  };

  const startGame = () => {
    const tc = TIME_OPTIONS[selectedTcIdx];
    dispatch(setWaiting(true));
    send(MessageType.INIT_GAME, { timeControlMs: tc.baseMs, incrementMs: tc.incrementMs });
  };

  const handleNewGame = () => {
    clockRefRef.current = null;
    dispatch(resetGame());
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Navbar */}
      <nav className="bg-gray-800 border-b border-gray-700/60 px-8 py-3 flex items-center justify-between shrink-0">
        <span className="text-white text-xl font-bold tracking-wide select-none">♟ Chess Club</span>
        <div className="flex items-center gap-6">
          <div className="flex gap-6 text-gray-400 text-sm font-medium">
            <span className="hover:text-white cursor-pointer transition-colors">Play</span>
            <span
              onClick={() => navigate('/history')}
              className="hover:text-white cursor-pointer transition-colors"
            >
              History
            </span>
          </div>
          {authUser && (
            <div className="flex items-center gap-3 border-l border-gray-700 pl-6">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center text-xs font-bold text-white">
                  {authUser.username[0].toUpperCase()}
                </div>
                <span className="text-gray-300 text-sm font-medium">{authUser.username}</span>
                <span className="text-gray-500 text-xs">
                  ({authUser.rating}
                  {ratingChange !== null && (
                    <span className={ratingChange >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {' '}
                      {ratingChange >= 0 ? '+' : ''}
                      {ratingChange}
                    </span>
                  )}
                  )
                </span>
              </div>
              <button
                onClick={() => {
                  dispatch(logout());
                  navigate('/login');
                }}
                className="text-gray-500 hover:text-red-400 text-xs transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Board + Sidebar */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          padding: 24,
          flex: 1,
        }}
      >
        {/* Chess board */}
        <div style={{ flexShrink: 0, position: 'relative' }}>
          <ChessBoard socket={socket} />
          {opponentDisconnected && gameStarted && !gameOver && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center rounded-lg gap-3">
              <div className="w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-yellow-300 font-semibold text-sm text-center px-4">
                Opponent disconnected
                <br />
                <span className="text-gray-300 text-xs font-normal">Waiting up to 30 s…</span>
              </p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div
          style={{
            width: 288,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            minHeight: 640,
          }}
        >
          {/* Opponent clock bar */}
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

          {/* Middle panel */}
          <div className="flex-1 flex flex-col gap-3">
            {/* Pre-game */}
            {!gameStarted && (
              <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 flex flex-col gap-4 h-full">
                <div>
                  <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">
                    Time Control
                  </p>
                  <select
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2.5 text-sm border border-gray-600 focus:outline-none focus:border-green-500 transition-colors"
                    value={selectedTcIdx}
                    onChange={(e) => setSelectedTcIdx(parseInt(e.target.value))}
                    disabled={isWaiting}
                  >
                    {TIME_OPTIONS.map((opt, idx) => (
                      <option key={idx} value={idx}>
                        {opt.label}
                      </option>
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
                    Waiting for a {TIME_OPTIONS[selectedTcIdx].label} opponent
                  </p>
                )}
              </div>
            )}

            {/* Active game */}
            {gameStarted && !gameOver && (
              <div className="flex flex-col gap-3 h-full">
                <div className="bg-gray-800 rounded-xl px-5 py-3 border border-gray-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-4 h-4 rounded-full border ${colour === 'white' ? 'bg-gray-100 border-gray-300' : 'bg-gray-950 border-gray-600'}`}
                    />
                    <span className="text-gray-300 text-sm font-medium capitalize">
                      Playing as {colour}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      isMyTurn ? 'bg-green-600/20 text-green-400' : 'bg-gray-700 text-gray-400'
                    }`}
                  >
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

                {ratingChange !== null && (
                  <p
                    className={`text-sm font-semibold ${ratingChange >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    Rating: {ratingChange >= 0 ? '+' : ''}
                    {ratingChange} → {authUser?.rating}
                  </p>
                )}

                <div className="flex flex-col gap-2 w-full mt-2">
                  {outgoingRematch ? (
                    <div className="flex flex-col items-center gap-2 py-2.5 px-4 rounded-xl bg-blue-900/40 border border-blue-700/50 w-full">
                      <p className="text-blue-200 text-sm font-semibold">↺ Waiting for opponent…</p>
                      <button
                        className="text-xs text-gray-400 hover:text-gray-200 underline"
                        onClick={() => dispatch(setOutgoingRematch(false))}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 px-8 rounded-xl w-full transition-all text-sm"
                      onClick={() => {
                        send(MessageType.REMATCH_REQUEST);
                        dispatch(setOutgoingRematch(true));
                      }}
                    >
                      ↺ Rematch
                    </button>
                  )}
                  <button
                    className="bg-green-600 hover:bg-green-500 text-white font-bold py-2.5 px-8 rounded-xl w-full transition-all shadow-lg hover:shadow-green-500/20 text-sm"
                    onClick={handleNewGame}
                  >
                    New Game
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* My clock bar */}
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

      {/* Incoming rematch request modal */}
      {pendingRematchRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 flex flex-col items-center gap-4 shadow-2xl border border-gray-600 max-w-xs w-full mx-4">
            <p className="text-3xl">↺</p>
            <p className="text-white text-lg font-bold text-center">Opponent wants a rematch!</p>
            <div className="flex gap-3 w-full">
              <button
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg transition-colors"
                onClick={() => {
                  send(MessageType.REMATCH_ACCEPT);
                  dispatch(setPendingRematch(false));
                  dispatch(resetGame());
                  clockRefRef.current = null;
                }}
              >
                Accept
              </button>
              <button
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded-lg transition-colors"
                onClick={() => {
                  send(MessageType.REMATCH_REJECT);
                  dispatch(setPendingRematch(false));
                }}
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Game;
