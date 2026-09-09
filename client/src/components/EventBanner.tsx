import { useEffect, useState } from "react";
import { apiFetch } from "../api.js";

interface ActiveEvent {
  id: string;
  name: string;
  description: string;
  coinMultiplier: number;
  startsAt: string;
  endsAt: string;
}

/**
 * spec.md Section 21's "Events" Coins source, scoped down to a time-boxed multiplier banner —
 * see server/src/eventsRepo.ts's top comment for the full scope note (a Coins multiplier on
 * Play Online match rewards only, no event-exclusive content). Public — no wallet needed to see
 * a bonus is running, same "no login wall to look" principle as the Leaderboard/Packs list.
 * Renders nothing when there's no active event, which is the common case until a real one is
 * ever configured via POST /api/admin/events.
 */
export function EventBanner() {
  const [event, setEvent] = useState<ActiveEvent | null>(null);

  useEffect(() => {
    apiFetch<{ event: ActiveEvent | null }>("/api/events/active", {})
      .then((res) => setEvent(res.event))
      .catch(() => setEvent(null));
  }, []);

  if (!event) return null;

  return (
    <div className="event-banner">
      <span className="event-banner__name">
        🎉 {event.name}
        {event.coinMultiplier !== 1 ? ` — ${event.coinMultiplier}× Coins from matches` : ""}
      </span>
      <span className="event-banner__desc">{event.description}</span>
      <span className="event-banner__ends">Ends {new Date(event.endsAt).toLocaleString()}</span>
    </div>
  );
}
