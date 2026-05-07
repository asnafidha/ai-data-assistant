'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface LayoutProps {
  children: React.ReactNode;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onCleanClick?: () => void;
  onExportClick?: () => void;
}

export default function Layout({ 
  children, 
  activeTab = 'overview', 
  onTabChange, 
  onCleanClick, 
  onExportClick 
}: LayoutProps) {
  const navItems = [
    { id: 'overview', label: 'Overview' },
    { id: 'missing', label: 'Missing' },
    { id: 'statistics', label: 'Statistics' },
    { id: 'visuals', label: 'Visuals' },
    { id: 'insights', label: 'Insights' },
    { id: 'cleaning', label: 'Cleaning' }
  ];

  return (
    <div className="min-h-screen bg-[#0b0f14] text-white flex">
      {/* Sidebar */}
      <aside className="w-64 bg-[#071021] border-r border-gray-800 p-4 hidden md:block">
        <div className="mb-8">
          <div className="text-2xl font-bold">DataChat</div>
          <div className="text-sm text-gray-400">LLM-powered EDA</div>
        </div>
        <nav className="space-y-2 text-sm">
          {navItems.map((item) => (
            <div
              key={item.id}
              className={`px-3 py-2 rounded cursor-pointer transition-colors ${
                activeTab === item.id 
                  ? 'bg-purple-600 text-white' 
                  : 'hover:bg-gray-800 text-gray-300'
              }`}
              onClick={() => onTabChange?.(item.id)}
            >
              {item.label}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        {/* Navbar */}
        <header className="h-16 bg-gradient-to-r from-black to-[#071021] flex items-center justify-between px-6 border-b border-gray-800">
          <div className="flex items-center gap-4">
            <div className="text-lg font-bold">DataChat</div>
            <div className="text-sm text-gray-400 hidden sm:block">EDA dashboard — now pro</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-gray-800 w-9 h-9 flex items-center justify-center">U</div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {/* Floating action buttons */}
      <div className="fixed right-6 bottom-6 flex flex-col gap-3 z-50">
        <motion.button 
          whileHover={{ scale: 1.05 }} 
          className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg flex items-center justify-center"
          onClick={onCleanClick}
          title="Deep Clean"
        >
          🧹
        </motion.button>
        <motion.button 
          whileHover={{ scale: 1.05 }} 
          className="w-14 h-14 rounded-full bg-gradient-to-br from-green-500 to-teal-400 shadow-lg flex items-center justify-center"
          onClick={onExportClick}
          title="Export Data"
        >
          📤
        </motion.button>
      </div>
    </div>
  );
}