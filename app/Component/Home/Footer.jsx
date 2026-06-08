"use client";

import Link from "next/link";
import { useSettings } from "@/app/Component/Settings/SettingsProvider";

export default function Footer() {
  const settings = useSettings();
  const siteName = settings?.siteName || "Ad Buzz";

  return (
    <footer className="bg-primary text-white mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-lg font-bold text-secondary mb-3">{siteName}</h3>
            <p className="text-sm text-white/70">Ad Account Management Platform</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-3">Quick Links</h3>
            <div className="space-y-2 text-sm text-white/70">
              <Link href="/" className="block hover:text-white">Home</Link>
              <Link href="/" className="block hover:text-white">Login</Link>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-3">Contact</h3>
            <p className="text-sm text-white/70">support@adbuzz.com</p>
          </div>
        </div>
        <div className="border-t border-white/20 mt-8 pt-8 text-center text-sm text-white/50">
          &copy; {new Date().getFullYear()} {siteName}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
