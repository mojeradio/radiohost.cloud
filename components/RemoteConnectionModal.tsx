import React, { useState, useCallback, useEffect } from 'react';
import { CloseIcon } from './icons/CloseIcon';
import { ClipboardIcon } from './icons/ClipboardIcon';

interface RemoteConnectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
    connectionError: string | null;
    peerId: string | null;
    isHost: boolean;
    onStartHost: () => void;
    onJoinHost: (hostId: string) => void;
    onDisconnect: () => void;
}

type ModalView = 'initial' | 'hosting' | 'joining';

const RemoteConnectionModal: React.FC<RemoteConnectionModalProps> = ({ 
    isOpen, onClose, connectionStatus, connectionError, peerId, isHost, onStartHost, onJoinHost, onDisconnect 
}) => {
    const [view, setView] = useState<ModalView>('initial');
    const [hostIdToJoin, setHostIdToJoin] = useState('');
    const [copied, setCopied] = useState<boolean>(false);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const handleStart = () => {
        onStartHost();
        setView('hosting');
    };

    const handleJoin = () => {
        if (hostIdToJoin.trim()) {
            onJoinHost(hostIdToJoin.trim());
        }
    };

    const resetState = () => {
        setView('initial');
        setHostIdToJoin('');
    };

    const handleClose = () => {
        // If we close the modal, and we initiated a connection that is not established yet, disconnect.
        if (connectionStatus !== 'connected') {
            onDisconnect();
        }
        resetState();
        onClose();
    };

    useEffect(() => {
        if (isOpen && connectionStatus === 'connected') {
            if (isHost) {
                setView('hosting');
            } else {
                // If connected as remote, just close the modal.
                onClose();
            }
        } else if (!isOpen) {
             resetState();
        }
    }, [isOpen, connectionStatus, isHost, onClose]);

    if (!isOpen) return null;
    
    const getStatusText = () => {
        if (connectionError) return { text: connectionError, color: 'text-red-400' };
        switch(connectionStatus) {
            case 'connecting': return { text: 'Connecting...', color: 'text-yellow-400' };
            case 'connected': return { text: `Connected ${isHost ? 'as Host' : 'to Host'}`, color: 'text-green-400' };
            case 'disconnected':
            case 'error':
            default: return { text: 'Disconnected', color: 'text-neutral-400' };
        }
    };
    const status = getStatusText();

    const renderInitialView = () => (
        <div className="p-8 flex flex-col items-center gap-6">
            <h3 className="text-lg font-medium text-center text-white">How would you like to connect?</h3>
            <div className="w-full flex flex-col sm:flex-row gap-4">
                <button onClick={handleStart} className="flex-1 p-4 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-left transition-colors">
                    <p className="font-semibold text-white">Start Remote Session</p>
                    <p className="text-sm text-neutral-400">Host a session and invite a presenter to join you.</p>
                </button>
                 <button onClick={() => setView('joining')} className="flex-1 p-4 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-left transition-colors">
                    <p className="font-semibold text-white">Join Remote Session</p>
                    <p className="text-sm text-neutral-400">Connect to a host's session using an ID.</p>
                </button>
            </div>
        </div>
    );

    const renderHostingView = () => (
        <div className="p-6 space-y-4 text-center">
            <h3 className="text-lg font-semibold text-white">Hosting Session</h3>
            {peerId ? (
                <>
                    <p className="text-sm text-neutral-400">Your session is active. Send this ID to your presenter:</p>
                    <div className="relative w-full max-w-sm mx-auto">
                        <input
                            type="text"
                            readOnly
                            value={peerId}
                            className="w-full bg-black border border-neutral-700 rounded-lg py-3 px-4 text-center font-mono text-white"
                        />
                        <button
                            onClick={() => handleCopy(peerId)}
                            title="Copy Session ID"
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"
                        >
                            <ClipboardIcon className="w-5 h-5" />
                        </button>
                    </div>
                    {copied && <p className="text-sm text-green-400">Session ID copied to clipboard!</p>}
                    <p className="text-sm text-neutral-400 pt-2">Waiting for presenter to connect...</p>
                </>
            ) : (
                 <div className="flex items-center justify-center gap-2 text-yellow-400">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                    <span>Initializing session...</span>
                </div>
            )}
        </div>
    );

    const renderJoiningView = () => (
         <div className="p-6 space-y-4">
            <button onClick={() => setView('initial')} className="text-sm text-neutral-400 hover:text-white">← Back</button>
            <h3 className="text-lg font-semibold text-white">Join a Session</h3>
            <p className="text-sm text-neutral-400">Paste the Session ID from the host to connect.</p>
            <div className="flex items-center gap-2">
                <input 
                    value={hostIdToJoin} 
                    onChange={(e) => setHostIdToJoin(e.target.value)} 
                    placeholder="Enter Host's Session ID..." 
                    className="flex-grow w-full bg-black border border-neutral-700 rounded-md p-2 font-mono"
                />
                <button 
                    onClick={handleJoin} 
                    disabled={!hostIdToJoin || connectionStatus === 'connecting'} 
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:bg-neutral-600 disabled:cursor-not-allowed"
                >
                    {connectionStatus === 'connecting' ? 'Connecting...' : 'Connect'}
                </button>
            </div>
         </div>
    );

    const isSessionActive = connectionStatus !== 'disconnected';
    let currentView;
    if (isSessionActive && isHost) {
        currentView = renderHostingView();
    } else {
        switch(view) {
            case 'initial': currentView = renderInitialView(); break;
            case 'hosting': currentView = renderHostingView(); break;
            case 'joining': currentView = renderJoiningView(); break;
            default: currentView = renderInitialView(); break;
        }
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={handleClose}>
            <div className="bg-neutral-900 rounded-lg shadow-xl border border-neutral-800 w-full max-w-lg m-4" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b border-neutral-800">
                    <h2 className="text-xl font-semibold text-white">Remote Studio Connection</h2>
                    <button onClick={handleClose} className="p-1 rounded-full hover:bg-neutral-700">
                        <CloseIcon className="w-6 h-6 text-neutral-400" />
                    </button>
                </div>

                {currentView}

                <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-4">
                     <div className="text-sm">
                        Status: <span className={`font-semibold ${status.color}`}>{status.text}</span>
                    </div>
                    {isSessionActive && (
                         <button 
                            onClick={onDisconnect}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-sm"
                        >
                            Disconnect
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default React.memo(RemoteConnectionModal);