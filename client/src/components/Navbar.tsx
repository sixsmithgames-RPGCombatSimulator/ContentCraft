/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PlusIcon, HomeIcon, BookOpenIcon } from 'lucide-react';
import { clsx } from 'clsx';

export const Navbar: React.FC = () => {
  const location = useLocation();

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link to="/" className="flex items-center space-x-2">
              <BookOpenIcon className="w-8 h-8 text-primary-600" />
              <span className="text-xl font-bold text-gray-900">ContentCraft</span>
            </Link>

            <div className="flex space-x-4">
              <Link
                to="/"
                className={clsx(
                  'flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  location.pathname === '/'
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                )}
              >
                <HomeIcon className="w-4 h-4" />
                <span>Dashboard</span>
              </Link>
            </div>
          </div>

          <div>
            <Link
              to="/projects/new"
              className="btn-primary flex items-center space-x-2"
            >
              <PlusIcon className="w-4 h-4" />
              <span>New Project</span>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
};