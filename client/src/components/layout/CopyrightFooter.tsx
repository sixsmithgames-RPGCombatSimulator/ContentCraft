/**
 * Copyright Footer Component
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

export default function CopyrightFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-gray-200 bg-gray-50 py-4 px-6 mt-auto">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <span>© {currentYear} Sixsmith Games. All rights reserved.</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-500">ContentCraft v1.0.0</span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-500">Proprietary & Confidential</span>
        </div>
      </div>
    </footer>
  );
}
