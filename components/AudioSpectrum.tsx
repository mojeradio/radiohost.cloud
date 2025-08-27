
import React, { useState, useEffect, useRef } from 'react';

interface AudioSpectrumProps {
  isPlaying: boolean;
  barCount?: number;
}

const AudioSpectrum: React.FC<AudioSpectrumProps> = ({ isPlaying, barCount = 64 }) => {
  const [barHeights, setBarHeights] = useState<number[]>(() => Array(barCount).fill(2));
  const animationFrameId = useRef<number | null>(null);

  const animate = () => {
    const newHeights = Array.from({ length: barCount }, () => Math.random() * 95 + 5);
    setBarHeights(newHeights);
    animationFrameId.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (isPlaying) {
      // Start animation slightly delayed to sync with perception
      const timeoutId = setTimeout(() => {
        animationFrameId.current = requestAnimationFrame(animate);
      }, 100);

      return () => clearTimeout(timeoutId);
    } else {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
      // Animate bars down to idle state
      setBarHeights(Array(barCount).fill(2));
    }

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isPlaying, barCount]);

  return (
    <div className="flex items-end justify-center w-full h-full gap-px">
      {barHeights.map((height, index) => (
        <div
          key={index}
          className="w-full bg-neutral-700"
          style={{ 
            height: `${height}%`, 
            borderRadius: '1px',
            transition: 'height 0.15s ease-out'
          }}
        />
      ))}
    </div>
  );
};

export default AudioSpectrum;
