import React from 'react';
import { Search, X, RotateCw, Sparkles } from 'lucide-react';

export default function Header({ activeTab, searchQuery, setSearchQuery, onRefresh }) {
  const getPlaceholder = () => {
    switch (activeTab) {
      case 'movies':
        return 'Search movies, series, anime…';
      case 'liked':
        return 'Search liked songs…';
      case 'library':
        return 'Search offline library…';
      default:
        return 'Search songs, artists, albums…';
    }
  };

  return (
    <header className="top-bar">
      <div className="top-bar-inner">
        <div className="brand">
          <div className="brand-logo-wrap">
            <Sparkles size={16} className="brand-icon" />
          </div>
          <div className="brand-text-wrap">
            <span className="brand-name">NOVA</span>
            <span className="brand-sub">STUDIO</span>
          </div>
        </div>
        <div className="top-actions">
          <button className="icon-btn" onClick={onRefresh} title="Refresh Content" aria-label="Refresh">
            <RotateCw size={17} />
          </button>
        </div>
      </div>

      <div className="search-bar-wrap">
        <div className="search-input-box">
          <Search size={16} className="search-svg" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={getPlaceholder()}
            autoComplete="off"
            spellCheck="false"
          />
          {searchQuery && (
            <button className="clear-btn" onClick={() => setSearchQuery('')} aria-label="Clear search">
              <X size={15} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
