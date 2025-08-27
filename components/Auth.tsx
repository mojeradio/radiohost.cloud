

import React, { useState } from 'react';

interface AuthProps {
    onLogin: (email: string) => void;
    onSignup: (email: string) => void;
}

const USERS_STORAGE_KEY = 'radiohost_users';

const Auth: React.FC<AuthProps> = ({ onLogin, onSignup }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [nickname, setNickname] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!isLogin && !nickname.trim()) {
            setError('Nickname is required.');
            return;
        }

        if (!email || !password) {
            setError('Email and password are required.');
            return;
        }
        if (!/\S+@\S+\.\S+/.test(email)) {
            setError('Please enter a valid email address.');
            return;
        }

        const storedUsers = JSON.parse(localStorage.getItem(USERS_STORAGE_KEY) || '[]');

        if (isLogin) {
            const user = storedUsers.find(
                (u: any) => u.email === email && u.password === password
            );
            if (user) {
                onLogin(email);
            } else {
                setError('Invalid email or password.');
            }
        } else { // Signup
            const existingUser = storedUsers.find((u: any) => u.email === email);
            if (existingUser) {
                setError('An account with this email already exists.');
                return;
            }
            const newUser = { email, password, nickname };
            const updatedUsers = [...storedUsers, newUser];
            localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));
            onSignup(email);
        }
    };

    return (
        <div className="fixed inset-0 bg-white/80 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="w-full max-w-md p-8 space-y-8 bg-white dark:bg-neutral-900 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-800">
                <div className="text-center">
                     <div className="text-3xl font-bold tracking-tight leading-tight text-black dark:text-white inline-block">
                        <div>radio</div>
                        <div>host<span className="text-red-500">.</span></div>
                        <div>cloud</div>
                    </div>
                    <p className="mt-2 text-center text-sm text-neutral-600 dark:text-neutral-400">
                        {isLogin ? 'Sign in to your account' : 'Create a new account'}
                    </p>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    <div className="rounded-md shadow-sm -space-y-px">
                         {!isLogin && (
                             <div>
                                <label htmlFor="nickname" className="sr-only">Nickname</label>
                                <input
                                    id="nickname"
                                    name="nickname"
                                    type="text"
                                    autoComplete="nickname"
                                    required
                                    value={nickname}
                                    onChange={(e) => setNickname(e.target.value)}
                                    className="appearance-none rounded-none relative block w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black placeholder-neutral-400 dark:placeholder-neutral-500 text-black dark:text-white rounded-t-md focus:outline-none focus:ring-black dark:focus:ring-white focus:border-black dark:focus:border-white focus:z-10 sm:text-sm"
                                    placeholder="Nickname"
                                />
                            </div>
                        )}
                        <div>
                            <label htmlFor="email-address" className="sr-only">Email address</label>
                            <input
                                id="email-address"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className={`appearance-none rounded-none relative block w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black placeholder-neutral-400 dark:placeholder-neutral-500 text-black dark:text-white ${isLogin ? 'rounded-t-md' : ''} focus:outline-none focus:ring-black dark:focus:ring-white focus:border-black dark:focus:border-white focus:z-10 sm:text-sm`}
                                placeholder="Email address"
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="sr-only">Password</label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black placeholder-neutral-400 dark:placeholder-neutral-500 text-black dark:text-white rounded-b-md focus:outline-none focus:ring-black dark:focus:ring-white focus:border-black dark:focus:border-white focus:z-10 sm:text-sm"
                                placeholder="Password"
                            />
                        </div>
                    </div>

                    {error && <p className="text-sm text-red-500 text-center">{error}</p>}

                    <div>
                        <button
                            type="submit"
                            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white dark:text-black bg-black dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900 focus:ring-black dark:focus:ring-white"
                        >
                            {isLogin ? 'Sign In' : 'Sign Up'}
                        </button>
                    </div>
                </form>

                <p className="mt-2 text-center text-sm text-neutral-600 dark:text-neutral-500">
                    {isLogin ? "Don't have an account?" : 'Already have an account?'}
                    <button onClick={() => { setIsLogin(!isLogin); setError(''); }} className="font-medium text-black dark:text-white hover:text-neutral-800 dark:hover:text-neutral-300 ml-1">
                        {isLogin ? 'Sign Up' : 'Sign In'}
                    </button>
                </p>
            </div>
        </div>
    );
};

export default Auth;