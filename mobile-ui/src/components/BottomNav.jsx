import React from 'react';
import { Home, Film, Heart, FolderDown, Download } from 'lucide-react';

const TABS = [
  { id: 'music', label: 'Home', icon: Home },
  { id: 'movies', label: 'Movies', icon: Film },
  { id: 'liked', label: 'Liked', icon: Heart, featured: true },
  { id: 'library', label: 'Offline', icon: FolderDown },
  { id: 'downloads', label: 'Downloads', icon: Download },
];

export default function BottomNav({ activeTab, onSelectTab }) {
  return (
    <nav className="fixed-bottom-nav">
      <div className="bottom-nav-inner">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              className={`nav-tab-btn ${isActive ? 'active' : ''} ${tab.featured ? 'featured-tab' : ''}`}
              onClick={() => onSelectTab(tab.id)}
            >
              <div className="nav-icon-wrap">
                <Icon size={tab.featured ? 20 : 19} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className="nav-tab-label">{tab.label}</span>
              {isActive && <div className="nav-active-pill" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
