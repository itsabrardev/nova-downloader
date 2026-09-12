import React from 'react';
import { CheckCircle2, Heart, DownloadCloud, AlertCircle } from 'lucide-react';

export default function Toast({ message, type = 'info' }) {
  if (!message) return null;

  const getIcon = () => {
    if (message.toLowerCase().includes('favorite') || message.toLowerCase().includes('liked')) {
      return <Heart size={16} fill="#ec4899" stroke="#ec4899" className="toast-icon" />;
    }
    if (message.toLowerCase().includes('download')) {
      return <DownloadCloud size={16} stroke="#06b6d4" className="toast-icon" />;
    }
    if (message.toLowerCase().includes('error') || message.toLowerCase().includes('no ')) {
      return <AlertCircle size={16} stroke="#f59e0b" className="toast-icon" />;
    }
    return <CheckCircle2 size={16} stroke="#10b981" className="toast-icon" />;
  };

  return (
    <div className="toast">
      {getIcon()}
      <span className="toast-text">{message}</span>
    </div>
  );
}
