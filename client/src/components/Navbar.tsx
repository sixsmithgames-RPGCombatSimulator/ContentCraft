/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { HomeIcon, BookOpenIcon, MoonIcon, SunIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { useTheme } from '../contexts/ThemeContext';

export const Navbar: React.FC = () => {
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm transition-colors dark:bg-slate-900 dark:border-slate-800">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link to="/" className="flex items-center space-x-2">
              <BookOpenIcon className="w-8 h-8 text-primary-600" />
              <span className="text-xl font-bold text-gray-900 dark:text-slate-100">ContentCraft</span>
            </Link>

            <div className="flex space-x-4">
              <Link
                to="/"
                className={clsx(
                  'flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  location.pathname === '/'
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-600/20 dark:text-blue-200'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800'
                )}
              >
                <HomeIcon className="w-4 h-4" />
                <span>Dashboard</span>
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
              <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};
