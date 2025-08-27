import React, { useState, useEffect } from 'react';
import { type TimeFixMarker } from '../types';

interface AddTimeMarkerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { time: string; markerType: 'hard' | 'soft', title?: string }) => void;
  initialData?: Partial<TimeFixMarker> & { index?: number } | null;
}

const AddTimeMarkerModal: React.FC<AddTimeMarkerModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [time, setTime] = useState('');
  const [markerType, setMarkerType] = useState<'hard' | 'soft'>('hard');
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (initialData?.time) {
        const timeParts = initialData.time.split(':');
        const formattedTime = [
            (timeParts[0] || '00').padStart(2, '0'),
            (timeParts[1] || '00').padStart(2, '0'),
            (timeParts[2] || '00').padStart(2, '0')
        ].join(':');
        setTime(formattedTime);
        setMarkerType(initialData.markerType || 'hard');
        setTitle(initialData.title || '');
      } else {
        const now = new Date();
        now.setMinutes(now.getMinutes() + 1);
        const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
        setTime(defaultTime);
        setMarkerType('hard');
        setTitle('');
      }
    }
  }, [isOpen, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (time) {
      onSave({ time, markerType, title });
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-neutral-900 rounded-lg shadow-xl border border-neutral-800 w-full max-w-sm m-4" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-6">
            <h3 className="text-lg font-semibold text-white">{initialData?.id ? 'Edit Time Marker' : 'Add Time Marker'}</h3>
            
            <div className="flex bg-black rounded-lg p-1 border border-neutral-700">
                <button type="button" onClick={() => setMarkerType('hard')} className={`flex-1 p-2 rounded-md text-sm font-semibold transition-colors ${markerType === 'hard' ? 'bg-yellow-500 text-black' : 'text-neutral-300 hover:bg-neutral-800'}`}>
                    Hard Fix
                </button>
                <button type="button" onClick={() => setMarkerType('soft')} className={`flex-1 p-2 rounded-md text-sm font-semibold transition-colors ${markerType === 'soft' ? 'bg-blue-500 text-white' : 'text-neutral-300 hover:bg-neutral-800'}`}>
                    Soft Fix
                </button>
            </div>
            
            <div className="text-xs text-neutral-400 p-3 bg-black rounded-md border border-neutral-800 min-h-[70px]">
                {markerType === 'hard' ? (
                    <>
                        <p className="font-bold text-yellow-400">Hard Fix:</p>
                        <p>The currently playing track is faded out, and playback immediately jumps to the next track after the marker at the specified time.</p>
                    </>
                ) : (
                    <>
                        <p className="font-bold text-blue-400">Soft Fix:</p>
                        <p>Allows the current track to finish playing. After it ends, playback will jump to the track following this marker.</p>
                    </>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="marker-time" className="block text-sm font-medium text-neutral-300">Time</label>
                  <input 
                    type="text" 
                    id="marker-time" 
                    value={time} 
                    onChange={e => setTime(e.target.value)} 
                    required
                    pattern="([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]"
                    placeholder="HH:MM:SS"
                    title="Enter time in HH:MM:SS format"
                    className="mt-1 w-full bg-black border border-neutral-700 rounded-md px-3 py-2 text-white font-mono" />
                </div>
                 <div>
                  <label htmlFor="marker-title" className="block text-sm font-medium text-neutral-300">Label (Optional)</label>
                  <input 
                    type="text" 
                    id="marker-title" 
                    value={title} 
                    onChange={e => setTitle(e.target.value)} 
                    placeholder="e.g., News"
                    className="mt-1 w-full bg-black border border-neutral-700 rounded-md px-3 py-2 text-white" />
                </div>
            </div>
          </div>
          <div className="bg-neutral-800/50 px-6 py-3 flex flex-row-reverse gap-3 rounded-b-lg">
            <button type="submit"
              className="inline-flex justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-200">
              {initialData?.id ? 'Save Changes' : 'Add Marker'}
            </button>
            <button type="button" onClick={onClose}
              className="inline-flex justify-center rounded-md bg-neutral-700 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-600">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default React.memo(AddTimeMarkerModal);