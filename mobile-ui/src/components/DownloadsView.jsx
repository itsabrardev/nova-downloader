import React from 'react';
import { DownloadCloud, CheckCircle2 } from 'lucide-react';

export default function DownloadsView({ downloads = [] }) {
  return (
    <section className="page-view">
      <div className="section-title-wrap">
        <div className="title-row">
          <div className="title-indicator title-indicator-gold" />
          <h2>Download Manager</h2>
        </div>
        <span className="subtitle">Saved directly to your phone's Download directory</span>
      </div>

      <div className="download-list">
        {downloads.length === 0 ? (
          <div className="empty-state">
            <DownloadCloud size={44} className="empty-icon empty-icon-cyan" strokeWidth={1.5} />
            <h3 className="empty-title">No active downloads</h3>
            <p className="empty-desc">Tap download on any song or video stream to save files locally for offline enjoyment.</p>
          </div>
        ) : (
          downloads.map((d, i) => (
            <div key={i} className="list-item">
              <div className="list-item-left">
                <div className="list-item-thumb">
                  <CheckCircle2 size={18} stroke="#10b981" />
                </div>
                <div className="list-item-meta">
                  <div className="list-item-title">{d.name}</div>
                  <div className="list-item-sub">{d.status || 'Completed'}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
