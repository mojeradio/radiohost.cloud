import React from 'react';

interface ResizerProps {
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
}

const Resizer: React.FC<ResizerProps> = ({ onMouseDown }) => {
  return (
    <div
      onMouseDown={onMouseDown}
      className="flex-shrink-0 w-2 h-full cursor-col-resize group"
    >
        <div className="w-full h-full bg-transparent group-hover:bg-blue-500/50 group-active:bg-blue-600 transition-colors duration-200 ease-in-out"></div>
    </div>
  );
};

export default React.memo(Resizer);