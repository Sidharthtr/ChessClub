import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import type { RootState } from '../redux/store';

interface GameRecord {
  id: string;
  winner: string | null;
  reason: string;
  timeControlMs: number;
  startedAt: string;
  endedAt: string;
  whitePlayer: { id: string; username: string; rating: number } | null;
  blackPlayer: { id: string; username: string; rating: number } | null;
}

function formatTc(ms: number): string {
  const m = Math.round(ms / 60000);
  return `${m} min`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function resultLabel(game: GameRecord, myId: string): { label: string; color: string } {
  if (!game.winner) return { label: 'Draw', color: 'text-yellow-400' };
  const iWon =
    (game.winner === 'white' && game.whitePlayer?.id === myId) ||
    (game.winner === 'black' && game.blackPlayer?.id === myId);
  return iWon
    ? { label: 'Won', color: 'text-green-400' }
    : { label: 'Lost', color: 'text-red-400' };
}

const History = () => {
  const navigate = useNavigate();
  const authUser = useSelector((state: RootState) => state.auth.user);
  const [games, setGames] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/auth/games')
      .then((r) => setGames(r.data))
      .catch(() => setError('Failed to load game history.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Navbar */}
      <nav className="bg-gray-800 border-b border-gray-700/60 px-8 py-3 flex items-center justify-between shrink-0">
        <span
          onClick={() => navigate('/game')}
          className="text-white text-xl font-bold tracking-wide select-none cursor-pointer hover:text-green-400 transition-colors"
        >
          ♟ Chess Club
        </span>
        <div className="flex items-center gap-6">
          <span
            onClick={() => navigate('/game')}
            className="text-gray-400 text-sm font-medium hover:text-white cursor-pointer transition-colors"
          >
            Play
          </span>
          <span className="text-white text-sm font-medium cursor-default">History</span>
          {authUser && (
            <div className="flex items-center gap-2 border-l border-gray-700 pl-6">
              <div className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center text-xs font-bold text-white">
                {authUser.username[0].toUpperCase()}
              </div>
              <span className="text-gray-300 text-sm">{authUser.username}</span>
              <span className="text-gray-500 text-xs">({authUser.rating})</span>
            </div>
          )}
        </div>
      </nav>

      <div className="flex-1 p-8 max-w-4xl mx-auto w-full">
        <h1 className="text-2xl font-bold text-white mb-6">Game History</h1>

        {loading && <div className="text-gray-500 text-center py-16">Loading…</div>}
        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}
        {!loading && !error && games.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-500 text-lg">No games played yet.</p>
            <button
              onClick={() => navigate('/game')}
              className="mt-4 bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-6 rounded-xl transition-colors text-sm"
            >
              Play your first game
            </button>
          </div>
        )}
        {!loading && games.length > 0 && (
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400 uppercase text-xs tracking-wider">
                  <th className="text-left px-5 py-3">Result</th>
                  <th className="text-left px-5 py-3">White</th>
                  <th className="text-left px-5 py-3">Black</th>
                  <th className="text-left px-5 py-3">Reason</th>
                  <th className="text-left px-5 py-3">Time</th>
                  <th className="text-left px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {games.map((game, i) => {
                  const res = authUser
                    ? resultLabel(game, authUser.id)
                    : { label: game.winner ?? 'Draw', color: 'text-gray-300' };
                  return (
                    <tr
                      key={game.id}
                      className={`border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors ${
                        i === games.length - 1 ? 'border-b-0' : ''
                      }`}
                    >
                      <td className={`px-5 py-3 font-bold ${res.color}`}>{res.label}</td>
                      <td className="px-5 py-3 text-gray-300">
                        {game.whitePlayer?.username ?? 'Anonymous'}
                      </td>
                      <td className="px-5 py-3 text-gray-300">
                        {game.blackPlayer?.username ?? 'Anonymous'}
                      </td>
                      <td className="px-5 py-3 text-gray-500 capitalize">
                        {game.reason.replace(/_/g, ' ')}
                      </td>
                      <td className="px-5 py-3 text-gray-500">{formatTc(game.timeControlMs)}</td>
                      <td className="px-5 py-3 text-gray-500">{formatDate(game.endedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default History;
