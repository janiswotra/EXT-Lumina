import React, { useState } from 'react';
import { Button } from './Button';
import { Input } from './ui/Input';

// Fix: Declare chrome for TS
declare const chrome: any;

interface AuthScreenProps {
    onSuccess: () => void;
    onClose: () => void;
    isChecking?: boolean;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSuccess, onClose, isChecking = false }) => {
    const [apiKey, setApiKey] = useState('');
    const [isConnecting, setIsConnecting] = useState(false);
    const [authError, setAuthError] = useState('');

    const handleConnect = () => {
        if (!apiKey.trim()) return;
        setIsConnecting(true);
        setAuthError('');

        chrome.storage.local.set({ lumina_api_key: apiKey.trim() }, () => {
            chrome.runtime.sendMessage({ type: 'CHECK_AUTH' }, (response: any) => {
                setIsConnecting(false);
                if (response && response.success) {
                    onSuccess();
                } else {
                    setAuthError(response?.message || 'Failed to connect. Please check your key.');
                }
            });
        });
    };

    return (
        <div className="fixed right-0 top-0 h-full w-[400px] bg-[#09090b] text-[#EEEFF1] shadow-2xl flex flex-col font-sans border-l border-[#27282B] z-[2147483647] pointer-events-auto overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute top-[-100px] left-[50%] w-[300px] h-[300px] bg-[#864AFF]/10 blur-[100px] rounded-full pointer-events-none" />

            {/* Header */}
            <div className="relative px-5 py-4 border-b border-[#27282B] flex items-center justify-between bg-[#0a0a0c]/80 backdrop-blur-md z-10">
                <div className="flex items-center gap-2.5">
                    <img
                        src={chrome.runtime.getURL('icons/icon-32.png')}
                        alt="Yena"
                        className="w-6 h-6 object-contain"
                    />
                    <span className="font-semibold text-[#EEEFF1] tracking-[-0.02em]">Yena</span>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-md text-[#A2A4A7] hover:text-[#EEEFF1] hover:bg-white/5 transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 flex flex-col items-center justify-center p-8 z-10">
                <div className="w-14 h-14 rounded-xl bg-[#1A1D21] shadow-[inset_0px_0px_0px_1px_#2F3033] flex items-center justify-center mb-6">
                    <svg className="w-7 h-7 text-[#9B69FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                </div>

                {isChecking ? (
                    <>
                        <h2 className="text-lg font-semibold text-[#EEEFF1] tracking-[-0.02em] mb-2 text-center">Connecting...</h2>
                        <p className="text-sm font-medium tracking-[-0.02em] text-[#A2A4A7] text-center mb-8 max-w-[280px]">
                            Checking your authentication status...
                        </p>
                        <div className="w-6 h-6 border-2 border-[#864AFF] border-t-transparent rounded-full animate-spin" />
                    </>
                ) : (
                    <>
                        <h2 className="text-lg font-semibold text-[#EEEFF1] tracking-[-0.02em] mb-2 text-center">Authentication Required</h2>
                        <p className="text-sm font-medium tracking-[-0.02em] text-[#A2A4A7] text-center mb-8 max-w-[280px]">
                            Enter your personal API Key from Yena Settings. Do not share API keys if you want correct ownership attribution.
                        </p>

                        <div className="w-full space-y-4">
                            <Input
                                label="API Key"
                                placeholder="lumina_sk_..."
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                className="text-center font-mono"
                            />

                            {authError && (
                                <div className="text-xs font-medium tracking-[-0.02em] text-[#FF5454] text-center bg-[#692623]/30 py-2 px-3 rounded-lg shadow-[inset_0px_0px_0px_1px_rgb(105,38,35)]">
                                    {authError}
                                </div>
                            )}

                            <Button
                                size="lg"
                                variant="primary"
                                onClick={handleConnect}
                                isLoading={isConnecting}
                                fullWidth
                            >
                                Connect to Yena
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
