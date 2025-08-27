
import React, { useState } from 'react';
import { BroadcastIcon } from './icons/BroadcastIcon';
import { ClipboardIcon } from './icons/ClipboardIcon';

interface BroadcastProps {
    isBroadcasting: boolean;
    isStarting: boolean;
    statusMessage: string;
    publicUrl: string | null;
    onStart: () => void;
    onStop: () => void;
}

const Broadcast: React.FC<BroadcastProps> = ({
    isBroadcasting,
    isStarting,
    statusMessage,
    publicUrl,
    onStart,
    onStop
}) => {
    const [copied, setCopied] = useState(false);

    const handleCopyUrl = () => {
        if (!publicUrl) return;
        navigator.clipboard.writeText(publicUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(err => {
            console.error('Failed to copy URL: ', err);
        });
    };

    if (isStarting) {
        return (
            <button
                disabled
                className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-neutral-400 bg-neutral-700 cursor-wait"
            >
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                {statusMessage}
            </button>
        );
    }

    if (isBroadcasting) {
        return (
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-red-500">
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                    </span>
                    <span className="text-sm font-bold uppercase tracking-wider">{statusMessage}</span>
                </div>
                {publicUrl ? (
                    <div className="flex items-center gap-1 bg-black border border-neutral-700 rounded-md p-1">
                        <input
                            type="text" readOnly value={publicUrl}
                            className="w-40 bg-transparent border-none focus:ring-0 text-xs text-neutral-400 p-1"
                            aria-label="Public Stream URL"
                        />
                        <button
                            onClick={handleCopyUrl}
                            className="flex-shrink-0 px-2 py-1 text-xs font-medium text-white bg-neutral-700 hover:bg-neutral-600 rounded-sm transition-colors"
                            title="Copy stream URL"
                        >
                            {copied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                ) : (
                    <span className="text-sm text-neutral-400">Public URL not available.</span>
                )}
                <button
                    onClick={onStop}
                    className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700"
                >
                    Stop
                </button>
            </div>
        );
    }


    // Offline state
    return (
        <button
            onClick={onStart}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-black bg-white hover:bg-neutral-200"
        >
            <BroadcastIcon className="w-5 h-5" />
            Start Broadcast
        </button>
    );
};

export default Broadcast;
