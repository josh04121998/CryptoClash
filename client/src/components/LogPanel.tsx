import { LogEntry } from "@cryptoclash/engine";
import { useEffect, useRef } from "react";

export interface LogPanelProps {
  log: LogEntry[];
  open: boolean;
  onClose: () => void;
}

export function LogPanel({ log, open, onClose }: LogPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [log.length, open]);

  return (
    <aside className={`log-panel ${open ? "log-panel--open" : ""}`} aria-label="Match log">
      <div className="log-panel__header">
        <span>Match Log</span>
        <button type="button" className="log-panel__close" aria-label="Close match log" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="log-panel__entries">
        {log.map((entry, i) => (
          <div key={i} className="log-panel__entry">
            <span className="log-panel__turn">T{entry.turn}</span> {entry.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </aside>
  );
}
