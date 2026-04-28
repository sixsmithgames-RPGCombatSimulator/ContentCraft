/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import React from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, LayoutGrid, BookOpen, StickyNote, Clock, Library } from 'lucide-react';
import { clsx } from 'clsx';
import { getProductConfig } from '../../config/products';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

/** Sub-navigation rendered on all /projects/:id/* routes. */
export const ProjectSubNav: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const product = getProductConfig();

  if (!id) return null;

  const items: NavItem[] = [
    {
      label: 'Content',
      href: `/projects/${id}`,
      icon: <LayoutGrid className="w-4 h-4" />,
    },
    {
      label: product.navigationLabels.lore,
      href: `/projects/${id}/world`,
      icon: <BookOpen className="w-4 h-4" />,
    },
    {
      label: product.navigationLabels.notes,
      href: `/projects/${id}/notes`,
      icon: <StickyNote className="w-4 h-4" />,
    },
    {
      label: product.navigationLabels.timeline,
      href: `/projects/${id}/timeline`,
      icon: <Clock className="w-4 h-4" />,
    },
    {
      label: 'Canon',
      href: `/projects/${id}/canon`,
      icon: <Library className="w-4 h-4" />,
    },
  ];

  const isActive = (href: string) => {
    if (href === `/projects/${id}`) {
      return location.pathname === href;
    }
    return location.pathname.startsWith(href);
  };

  return (
    <div className="border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm mb-6">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-1 overflow-x-auto">
          <Link
            to="/"
            className="flex items-center gap-1.5 px-3 py-3 text-sm text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors shrink-0 mr-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{product.workspaceNounPlural}</span>
          </Link>

          <div className="w-px h-5 bg-gray-200 dark:bg-slate-700 mr-2 shrink-0" />

          {items.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className={clsx(
                'flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0',
                isActive(item.href)
                  ? 'border-primary-600 text-primary-700 dark:border-primary-400 dark:text-primary-300'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:border-slate-600',
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};
