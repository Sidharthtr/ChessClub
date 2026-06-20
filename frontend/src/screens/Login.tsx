import { useState, FormEvent } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import { setCredentials } from '../redux/authSlice';

const Login = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await api.post('/auth/login', { email, password });
      dispatch(setCredentials({ token: data.token, user: data.user }));
      navigate('/game');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-5xl">♟</span>
          <h1 className="text-3xl font-bold text-white mt-3">Chess Club</h1>
          <p className="text-gray-400 mt-1">Sign in to your account</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-gray-800 rounded-2xl p-8 border border-gray-700 flex flex-col gap-4"
        >
          {error && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-gray-400 text-sm font-medium">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="bg-gray-700 text-white rounded-lg px-4 py-2.5 border border-gray-600 focus:outline-none focus:border-green-500 transition-colors"
              placeholder="you@example.com"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-gray-400 text-sm font-medium">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="bg-gray-700 text-white rounded-lg px-4 py-2.5 border border-gray-600 focus:outline-none focus:border-green-500 transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors mt-2"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>

          <p className="text-gray-500 text-sm text-center mt-2">
            Don't have an account?{' '}
            <Link to="/register" className="text-green-400 hover:text-green-300 font-medium">
              Register
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Login;
