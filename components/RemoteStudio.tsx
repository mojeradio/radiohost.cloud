
import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { MicrophoneIcon } from './icons/MicrophoneIcon';
import VolumeMeter from './VolumeMeter';
import { type PlayoutPolicy } from '../types';

interface RemoteStudioProps {
    onLiveStatusChange: (isLive: boolean) => void;
    onStreamAvailable: (stream: MediaStream | null) => void;
    playoutPolicy: PlayoutPolicy;
    onUpdatePolicy: (newPolicy: PlayoutPolicy) => void;
}

export interface RemoteStudioRef {
    connectMic: () => void;
}

type MicStatus = 'disconnected' | 'connecting' | 'ready' | 'error';

const RemoteStudio = forwardRef<RemoteStudioRef, RemoteStudioProps>((props, ref) => {
    const { onLiveStatusChange, onStreamAvailable, playoutPolicy, onUpdatePolicy } = props;
    const [micStatus, setMicStatus] = useState<MicStatus>('disconnected');
    const [isLive, setIsLive] = useState(false);
    const [volume, setVolume] = useState(0);
    const [errorMessage, setErrorMessage] = useState('');
    const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedInputDeviceId, setSelectedInputDeviceId] = useState<string>('default');

    const analyserRef = useRef<AnalyserNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animationFrameId = useRef<number | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    const visualize = useCallback(() => {
        if (analyserRef.current) {
            const bufferLength = analyserRef.current.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyserRef.current.getByteTimeDomainData(dataArray);
            
            let sumSquares = 0.0;
            for (const amplitude of dataArray) {
                const normalizedAmplitude = (amplitude / 128.0) - 1.0;
                sumSquares += normalizedAmplitude * normalizedAmplitude;
            }
            const rms = Math.sqrt(sumSquares / bufferLength);
            const volumeLevel = Math.min(100, Math.max(0, rms * 300));
            setVolume(volumeLevel);
            
            animationFrameId.current = requestAnimationFrame(visualize);
        }
    }, []);

    const updateDeviceLists = useCallback(async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const inputs = devices.filter(device => device.kind === 'audioinput');
            setAudioInputDevices(inputs);
        } catch (err) {
            console.error("Could not list audio devices:", err);
        }
    }, []);
    
    useEffect(() => {
        navigator.mediaDevices.addEventListener('devicechange', updateDeviceLists);
        return () => {
            navigator.mediaDevices.removeEventListener('devicechange', updateDeviceLists);
        };
    }, [updateDeviceLists]);

    const connectMicrophone = useCallback(async (deviceId: string) => {
        if (micStatus === 'connecting') return;

        // Clean up previous stream if it exists (for device changes)
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }

        setMicStatus('connecting');
        setErrorMessage('');
        
        try {
            const constraints = { audio: { deviceId: deviceId === 'default' ? undefined : { exact: deviceId } } };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;
            
            if (audioInputDevices.length === 0) {
                 await updateDeviceLists();
            }
            
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
            
            const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
            if (!analyserRef.current) {
                analyserRef.current = audioContextRef.current.createAnalyser();
                analyserRef.current.fftSize = 256;
            }
            
            source.connect(analyserRef.current);
            
            onStreamAvailable(stream);
            setMicStatus('ready');
            if (!animationFrameId.current) {
                visualize();
            }
        } catch (err) {
            console.error("Error accessing microphone:", err);
            setMicStatus('error');
            setIsLive(false);
            if (err instanceof Error) {
                if(err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    setErrorMessage('Microphone permission denied.');
                } else if (err.name === 'NotFoundError') {
                    setErrorMessage('Selected microphone not found.');
                }
                else {
                    setErrorMessage('Could not access microphone.');
                }
            }
        }
    }, [micStatus, audioInputDevices.length, onStreamAvailable, updateDeviceLists, visualize]);

    useEffect(() => {
        // Cleanup on unmount
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
             if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                 audioContextRef.current.close().catch(e => console.error("Error closing audio context on cleanup", e));
            }
             if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, []);
    
    useEffect(() => {
        onLiveStatusChange(isLive);
    }, [isLive, onLiveStatusChange]);

    const handleMicToggle = async () => {
        if (micStatus === 'ready') {
            setIsLive(prev => !prev);
        } else if (micStatus === 'disconnected' || micStatus === 'error') {
            await connectMicrophone(selectedInputDeviceId);
            setIsLive(true);
        }
    };

    const handleDeviceSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newDeviceId = e.target.value;
        setSelectedInputDeviceId(newDeviceId);
        connectMicrophone(newDeviceId);
    };

     useImperativeHandle(ref, () => ({
        connectMic: async () => {
            if (micStatus !== 'ready') {
                await connectMicrophone(selectedInputDeviceId);
            }
            setIsLive(true);
        }
    }), [micStatus, selectedInputDeviceId, connectMicrophone]);


    const handleDuckingChange = (level: number) => {
        onUpdatePolicy({ ...playoutPolicy, micDuckingLevel: level });
    };

    const handleDuckingFadeChange = (duration: number) => {
        onUpdatePolicy({ ...playoutPolicy, micDuckingFadeDuration: duration });
    };

    const getStatusInfo = () => {
        if (isLive) return { text: 'ON AIR', color: 'text-red-500 animate-pulse' };
        switch (micStatus) {
            case 'disconnected': return { text: 'Mic Disconnected', color: 'text-neutral-400 dark:text-neutral-500' };
            case 'connecting': return { text: 'Connecting Mic...', color: 'text-yellow-500' };
            case 'ready': return { text: 'Mic Ready', color: 'text-green-500' };
            case 'error': return { text: 'Mic Error', color: 'text-red-500' };
        }
    };
    const status = getStatusInfo();
    const buttonText = micStatus === 'ready'
        ? (isLive ? 'Go Off Air' : 'Go On Air')
        : 'Connect Microphone';


    return (
        <div className="flex flex-col h-full p-4">
            <div className="space-y-4">

                <div className="text-center space-y-1">
                    <p className={`font-medium ${status.color}`}>{status.text}</p>
                    {errorMessage && <p className="text-xs text-red-500">{errorMessage}</p>}
                </div>
                
                <div className="h-16 w-full bg-neutral-200/50 dark:bg-neutral-900/50 border border-neutral-300 dark:border-neutral-800 rounded-lg p-2">
                    <VolumeMeter volume={volume} />
                </div>

                <div className="space-y-2">
                    <label htmlFor="mic-select" className="text-sm font-medium text-neutral-800 dark:text-neutral-300">
                        Microphone Input
                    </label>
                    <select
                        id="mic-select"
                        value={selectedInputDeviceId}
                        onChange={handleDeviceSelectChange}
                        disabled={micStatus === 'connecting'}
                        className="w-full bg-white dark:bg-black border border-neutral-300 dark:border-neutral-700 rounded-md px-3 py-2 text-black dark:text-white focus:ring-black dark:focus:ring-white focus:border-black dark:focus:border-white sm:text-sm disabled:bg-neutral-200 dark:disabled:bg-neutral-800 disabled:text-neutral-500"
                    >
                        <option value="default">Default Microphone</option>
                        {audioInputDevices.map((device, index) => (
                            <option key={device.deviceId} value={device.deviceId}>
                                {device.label || `Microphone ${index + 1}`}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="space-y-2">
                    <label htmlFor="mic-ducking" className="flex justify-between text-sm font-medium text-neutral-800 dark:text-neutral-300">
                        <span>Music Ducking Level</span>
                        <span className="font-mono text-neutral-500">{Math.round(playoutPolicy.micDuckingLevel * 100)}%</span>
                    </label>
                    <input
                        id="mic-ducking"
                        type="range" min="0" max="1" step="0.01"
                        value={playoutPolicy.micDuckingLevel}
                        onChange={(e) => handleDuckingChange(parseFloat(e.target.value))}
                        className="w-full h-2 bg-neutral-300 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                    />
                     <p className="text-xs text-neutral-500">How much to lower music volume when the mic is active.</p>
                </div>
                <div className="space-y-2">
                    <label htmlFor="mic-ducking-fade" className="flex justify-between text-sm font-medium text-neutral-800 dark:text-neutral-300">
                        <span>Ducking Fade Duration</span>
                        <span className="font-mono text-neutral-500">{(playoutPolicy.micDuckingFadeDuration ?? 0.5).toFixed(1)}s</span>
                    </label>
                    <input
                        id="mic-ducking-fade"
                        type="range" min="0.1" max="2" step="0.1"
                        value={playoutPolicy.micDuckingFadeDuration ?? 0.5}
                        onChange={(e) => handleDuckingFadeChange(parseFloat(e.target.value))}
                        className="w-full h-2 bg-neutral-300 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                    />
                </div>
                <div className="space-y-3 pt-2">
                    <button
                        onClick={handleMicToggle}
                        disabled={micStatus === 'connecting'}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-neutral-400 dark:border-neutral-700 text-sm font-medium rounded-md shadow-sm text-black dark:text-white bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-100 dark:focus:ring-offset-neutral-900 focus:ring-black dark:focus:ring-white disabled:bg-neutral-200/50 dark:disabled:bg-neutral-800/50 disabled:text-neutral-400 dark:disabled:text-neutral-500 disabled:cursor-not-allowed transition-colors"
                    >
                        <MicrophoneIcon className="w-5 h-5" />
                        <span>{buttonText}</span>
                    </button>
                </div>
            </div>
        </div>
    );
});

export default React.memo(RemoteStudio);