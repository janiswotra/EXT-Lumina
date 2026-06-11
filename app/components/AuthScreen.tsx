import React, { useState } from 'react';
import { Button } from './Button';
import { Input } from './ui/Input';
import { ACTIVE_ENV_KEY, STORAGE_KEYS, ENVIRONMENTS } from '../constants';

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

        // Read active env and store API key under per-env key
        chrome.storage.local.get(ACTIVE_ENV_KEY, (envResult: Record<string, unknown>) => {
            const envId = (envResult[ACTIVE_ENV_KEY] as string) || ENVIRONMENTS[0].id;
            const storageKey = STORAGE_KEYS.apiKey(envId);
            chrome.storage.local.set({ [storageKey]: apiKey.trim() }, () => {
                chrome.runtime.sendMessage({ type: 'CHECK_AUTH' }, (response: any) => {
                    setIsConnecting(false);
                    if (response && response.success) {
                        onSuccess();
                    } else {
                        setAuthError(response?.message || 'Failed to connect. Please check your key.');
                    }
                });
            });
        });
    };

    return (
        <div className="fixed right-0 top-0 h-full w-[400px] bg-[#f7f8fa] text-[#181c25] shadow-2xl flex flex-col font-sans border-l border-[#dde1e8] z-[2147483647] pointer-events-auto overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute top-[-100px] left-[50%] w-[300px] h-[300px] bg-[#ff6a26]/8 blur-[100px] rounded-full pointer-events-none" />

            {/* Header */}
            <div className="relative px-5 py-4 border-b border-[#dde1e8] flex items-center justify-between bg-white/80 backdrop-blur-md z-10">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#ff6a26] flex items-center justify-center shadow-sm">
                        <img
                            src={chrome.runtime.getURL('icons/icon-32.png')}
                            alt="Yena"
                            className="w-5 h-5 object-contain"
                        />
                    </div>
                    <span className="font-semibold text-[#181c25] tracking-[-0.02em]">Yena</span>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-md text-[#4a5364] hover:text-[#181c25] hover:bg-black/[0.04] transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 flex flex-col items-center justify-center p-8 z-10">
                <div className="w-14 h-14 rounded-xl bg-white shadow-[0px_1px_2px_rgba(0,0,0,0.05),inset_0px_0px_0px_1px_#dde1e8] flex items-center justify-center mb-6">
                    <svg className="w-7 h-7 text-[#ff6a26]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                </div>

                {isChecking ? (
                    <>
                        <h2 className="text-xl font-semibold text-[#181c25] tracking-[-0.02em] mb-2 text-center">Connecting...</h2>
                        <p className="text-base font-medium tracking-[-0.02em] text-[#4a5364] text-center mb-8 max-w-[280px]">
                            Checking your authentication status...
                        </p>
                        <div className="w-6 h-6 border-2 border-[#2563eb] border-t-transparent rounded-full animate-spin" />
                    </>
                ) : (
                    <>
                        <h2 className="text-xl font-semibold text-[#181c25] tracking-[-0.02em] mb-2 text-center">Authentication Required</h2>
                        <p className="text-base font-medium tracking-[-0.02em] text-[#4a5364] text-center mb-8 max-w-[280px]">
                            Enter your personal API Key from Yena Settings. Do not share API keys if you want correct ownership attribution.
                        </p>

                        <form className="w-full space-y-4" onSubmit={(e) => { e.preventDefault(); handleConnect(); }}>
                            <Input
                                label="API Key"
                                type="password"
                                placeholder="yena_sk_..."
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                className="text-center font-mono"
                                autoComplete="off"
                            />

                            {authError && (
                                <div className="text-sm font-medium tracking-[-0.02em] text-[#dc2626] text-center bg-[#fef2f2] py-2 px-3 rounded-lg border border-[#fecaca]">
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
                        </form>
                    </>
                )}
            </div>
        </div>
    );
};
