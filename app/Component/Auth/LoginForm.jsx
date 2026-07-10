"use client";

import { useState } from "react";
import {
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "@/lib/firebaseClient";
import { completeAuthFlow, getAuthErrorMessage } from "@/lib/authUtils";
import { useSettings } from "@/app/Component/Settings/SettingsProvider";
import { Mail, Lock, ArrowRight, Shield, Zap, BarChart3 } from "lucide-react";

export default function LoginForm({ onSuccess }) {
  const settings = useSettings();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const logo = settings?.logo || "/logo.jpeg";
  const siteName = settings?.siteName || "Ad Buzz";

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      await completeAuthFlow(userCredential.user, onSuccess);
    } catch (err) {
      setError(getAuthErrorMessage(err));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Hero panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary via-primary-700 to-[#0a2d4d]">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-secondary rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20 text-white">
          <div className="flex items-center gap-3 mb-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt={siteName} className="h-14 w-auto rounded-lg shadow-lg" />
            {/* <span className="text-3xl font-bold tracking-tight">{siteName}</span> */}
          </div>

          <h2 className="text-4xl xl:text-5xl font-bold leading-tight mb-6">
            Manage Your Ad Accounts
            <span className="text-secondary"> Smarter</span>
          </h2>

          <p className="text-lg text-white/80 mb-12 max-w-md leading-relaxed">
            Track balances, deposits, analyze campaign performance, and manage meta ad accounts - all in one powerful dashboard.
          </p>

          <div className="space-y-5">
            {[
              { icon: BarChart3, text: "Real-time balance & spending insights" },
              { icon: Shield, text: "Secure account management" },
              { icon: Zap, text: "Fast deposits & Secure Topup " },
              { icon: Zap, text: "Realtime Data Showing. " },
              { icon: Zap, text: "24h Dedicated Dedicated Support" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 backdrop-blur">
                  <Icon size={20} className="text-secondary" />
                </div>
                <span className="text-white/90">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Auth panel */}
      <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-primary-100 via-white to-secondary-100 px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt={siteName} className="h-12 w-auto mx-auto mb-3 rounded-lg" />
            <h1 className="text-2xl font-bold text-slate-900">{siteName}</h1>
            <p className="text-sm text-slate-500 mt-1">Ad Account Management Platform</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 sm:p-10">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-slate-900">
                Welcome Back
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Sign in to access your dashboard
              </p>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl mb-5 border border-red-100 flex items-start gap-2">
                <span className="mt-0.5 shrink-0">⚠</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleEmailAuth} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    className="w-full border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                    className="w-full border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white rounded-xl py-3 text-sm font-semibold hover:bg-primary-700 transition disabled:opacity-60 flex items-center justify-center gap-2 group"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            &copy; {new Date().getFullYear()} {siteName}. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
