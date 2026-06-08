"use client";

import Link from "next/link";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useSettings } from "@/app/Component/Settings/SettingsProvider";

export default function Navbar() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const settings = useSettings();
  const logo = settings?.logo || "/logo.jpeg";

  return (
    <nav className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt="Ad Buzz" className="h-9 w-auto" />
            <span className="text-xl font-bold text-primary">{settings?.siteName || "Ad Buzz"}</span>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            <Link href="/" className="text-sm text-slate-600 hover:text-slate-900">Home</Link>
            {user ? (
              <Link href="/user-dashboard" className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700">
                Dashboard
              </Link>
            ) : (
              <Link href="/" className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700">
                Login
              </Link>
            )}
          </div>

          <button onClick={() => setOpen(!open)} className="md:hidden p-2 text-slate-600">
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {open && (
          <div className="md:hidden pb-4 space-y-2">
            <Link href="/" className="block px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg" onClick={() => setOpen(false)}>Home</Link>
            {user ? (
              <Link href="/user-dashboard" className="block px-3 py-2 text-sm bg-primary text-white rounded-lg" onClick={() => setOpen(false)}>Dashboard</Link>
            ) : (
              <Link href="/" className="block px-3 py-2 text-sm bg-primary text-white rounded-lg" onClick={() => setOpen(false)}>Login</Link>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
