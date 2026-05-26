import React, { useEffect, useRef } from 'react';
import type { LogEntry } from '../../models/report';
import './StatusLog.css';

interface StatusLogProps {
  entries: LogEntry[];
  maxHeight?: string;
}

const LEVEL_ICON: Record<LogEntry['level'], string> = {
  info: 'ℹ',
  warning: '⚠',
  error: '✕',
};

const StatusLog: React.FC<StatusLogProps> = ({ entries, maxHeight = '240px' }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest entry whenever entries change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="status-log" style={{ maxHeight }} role="log" aria-live="polite">
      {entries.map((entry, i) => (
        <div key={i} className={`status-log__entry status-log__entry--${entry.level}`}>
          <span className="status-log__icon" aria-hidden="true">
            {LEVEL_ICON[entry.level]}
          </span>
          <span className="status-log__time">{entry.timestamp.slice(11, 19)}</span>
          <span className="status-log__message">{entry.message}</span>
          {entry.specObjectId && (
            <span className="status-log__context">[{entry.specObjectId}]</span>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
};

export default StatusLog;
