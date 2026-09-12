import React from 'react';
import { Play, Star, Flame, Tv, Zap, Shield, Rocket, Film } from 'lucide-react';

const GENRES = [
  { id: 'popular', label: 'Trending', icon: Flame },
  { id: 'anime', label: 'Anime', icon: Tv },
  { id: 'action', label: 'Action', icon: Zap },
  { id: 'superhero', label: 'Superhero', icon: Shield },
  { id: 'scifi', label: 'Sci-Fi', icon: Rocket },
];

export default function MoviesView({ movies, loading, activeGenre, onSelectGenre, onOpenMovie }) {
  return (
    <section className="page-view">
      <div className="section-title-wrap">
        <div className="title-row">
          <div className="title-indicator title-indicator-cyan" />
          <h2>Movies &amp; Series</h2>
        </div>
        <span className="subtitle">Direct stream &amp; ultra-fast download in 1080p Full HD</span>
      </div>

      <div className="pill-scroll">
        {GENRES.map(g => {
          const Icon = g.icon;
          const isActive = activeGenre === g.id;
          return (
            <button
              key={g.id}
              className={`mv-pill ${isActive ? 'active' : ''}`}
              onClick={() => onSelectGenre(g.id)}
            >
              <Icon size={14} className="pill-icon" />
              <span>{g.label}</span>
            </button>
          );
        })}
      </div>

      <div className="movies-grid">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <span>Loading cinema catalog…</span>
          </div>
        ) : movies.length === 0 ? (
          <div className="empty-state">
            <Film size={40} className="empty-icon" />
            <p>No titles found. Try searching a different movie or anime name!</p>
          </div>
        ) : (
          movies.map((m, idx) => (
            <div key={m.id || idx} className="card movie-card" onClick={() => onOpenMovie(m)}>
              <div className="card-thumb-wrap">
                <img
                  className="card-thumb"
                  src={m.image || ''}
                  alt={m.title}
                  loading="lazy"
                  onError={e => { e.currentTarget.style.opacity = '0.3'; }}
                />
                <div className="card-overlay-gradient" />

                {/* Rating Badge with Lucide Star SVG */}
                <div className="card-badge rating-badge">
                  <Star size={11} fill="#fbbf24" stroke="#fbbf24" />
                  <span>{m.rating || '8.8'}</span>
                </div>

                {m.year && (
                  <div className="card-year-badge">
                    <span>{m.year}</span>
                  </div>
                )}

                <div className="card-play-overlay">
                  <Play size={16} fill="currentColor" />
                </div>
              </div>

              <div className="card-info">
                <div className="card-title" title={m.title}>{m.title}</div>
                <div className="card-sub">{m.year || 'Cinema'} • {m.subjectType === 2 ? 'TV Series' : 'Movie'}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
