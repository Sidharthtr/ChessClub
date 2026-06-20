import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../redux/store';
import { setPendingDraw, setPendingTakeback } from '../../redux/gameSlice';
import { MessageType } from '../../shared/constants/messageTypes';

interface Props {
  socket: WebSocket | null;
}

const GameControls: React.FC<Props> = ({ socket }) => {
  const dispatch = useDispatch();
  const { pendingDrawRequest, pendingTakebackRequest } = useSelector(
    (state: RootState) => state.game
  );
  const [confirmResign, setConfirmResign] = useState(false);

  const send = (type: string) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type }));
    }
  };

  return (
    <>
      {/* Action buttons */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 flex flex-col gap-2">
        <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Game Actions</p>

        <button
          className="bg-gray-700 hover:bg-red-700 text-white text-sm font-semibold py-2 px-4 rounded-lg w-full transition-colors text-left"
          onClick={() => setConfirmResign(true)}
        >
          🏳 Resign
        </button>
        <button
          className="bg-gray-700 hover:bg-blue-700 text-white text-sm font-semibold py-2 px-4 rounded-lg w-full transition-colors text-left"
          onClick={() => send(MessageType.DRAW_REQUEST)}
        >
          🤝 Offer Draw
        </button>
        <button
          className="bg-gray-700 hover:bg-yellow-700 text-white text-sm font-semibold py-2 px-4 rounded-lg w-full transition-colors text-left"
          onClick={() => send(MessageType.TAKEBACK_REQUEST)}
        >
          ↩ Request Takeback
        </button>
      </div>

      {/* Resign confirmation */}
      {confirmResign && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 flex flex-col items-center gap-4 shadow-2xl border border-gray-600 max-w-xs w-full mx-4">
            <p className="text-white text-lg font-bold text-center">Are you sure you want to resign?</p>
            <p className="text-gray-400 text-sm text-center">This will count as a loss.</p>
            <div className="flex gap-3 w-full">
              <button
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded-lg transition-colors"
                onClick={() => { send(MessageType.RESIGN); setConfirmResign(false); }}
              >
                Yes, Resign
              </button>
              <button
                className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 rounded-lg transition-colors"
                onClick={() => setConfirmResign(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Incoming draw request */}
      {pendingDrawRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 flex flex-col items-center gap-4 shadow-2xl border border-gray-600 max-w-xs w-full mx-4">
            <p className="text-3xl">🤝</p>
            <p className="text-white text-lg font-bold text-center">Opponent offers a draw</p>
            <div className="flex gap-3 w-full">
              <button
                className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded-lg transition-colors"
                onClick={() => { send(MessageType.DRAW_ACCEPT); dispatch(setPendingDraw(false)); }}
              >
                Accept
              </button>
              <button
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded-lg transition-colors"
                onClick={() => { send(MessageType.DRAW_REJECT); dispatch(setPendingDraw(false)); }}
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Incoming takeback request */}
      {pendingTakebackRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 flex flex-col items-center gap-4 shadow-2xl border border-gray-600 max-w-xs w-full mx-4">
            <p className="text-3xl">↩</p>
            <p className="text-white text-lg font-bold text-center">Opponent requests a takeback</p>
            <div className="flex gap-3 w-full">
              <button
                className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded-lg transition-colors"
                onClick={() => { send(MessageType.TAKEBACK_ACCEPT); dispatch(setPendingTakeback(false)); }}
              >
                Accept
              </button>
              <button
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded-lg transition-colors"
                onClick={() => { send(MessageType.TAKEBACK_REJECT); dispatch(setPendingTakeback(false)); }}
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default GameControls;
