import React, { useState, useEffect } from 'react';
import Confetti from 'react-confetti';

const BetterLuckSign: React.FC = () => {
  const [showConfetti, setShowConfetti] = useState<boolean>(false);

  useEffect(() => {
    // Trigger confetti after a small delay for effect
    const timeout = setTimeout(() => {
      setShowConfetti(true);
    }, 500);

    return () => clearTimeout(timeout); // Clean up the timeout on unmount
  }, []);

  return (
    <div style={{ position: 'relative', textAlign: 'center', padding: '50px' }}>
      {showConfetti && (
        <Confetti
          width={window.innerWidth}
          height={window.innerHeight}
          numberOfPieces={200} // Adjust the number of confetti pieces
        />
      )}
      <h1 style={{ fontSize: '4em', color: 'gray', textShadow: '2px 2px 4px rgba(0, 0, 0, 0.3)' }}>
        Better Luck Next Time!
      </h1>
      <p style={{ fontSize: '1.5em', color: 'gray' }}>
        Don't worry, you'll get it next time!
      </p>
    </div>
  );
};

export default BetterLuckSign;

