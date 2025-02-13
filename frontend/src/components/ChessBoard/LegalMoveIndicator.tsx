import React from 'react';

const LegalMoveIndicator: React.FC = () => {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(255, 255, 0, 0.5)',
        borderRadius: '50%',
      }}
    />
  );
};

export default LegalMoveIndicator;
