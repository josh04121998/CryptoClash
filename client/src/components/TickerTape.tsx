export interface TickerItem {
  text: string;
  direction?: "up" | "down";
}

/** A scrolling "exchange floor readout" strip — ambient trading-floor texture, not real data. Content is duplicated so the CSS marquee loops seamlessly at the halfway point. */
export function TickerTape({ items }: { items: TickerItem[] }) {
  const doubled = [...items, ...items];
  return (
    <div className="ticker-tape">
      <div className="ticker-tape__track">
        {doubled.map((item, i) => (
          <span
            key={i}
            className={
              item.direction === "up"
                ? "ticker-tape__item ticker-tape__item--up"
                : item.direction === "down"
                  ? "ticker-tape__item ticker-tape__item--down"
                  : "ticker-tape__item"
            }
          >
            {item.direction === "up" && "▲ "}
            {item.direction === "down" && "▼ "}
            {item.text}
          </span>
        ))}
      </div>
    </div>
  );
}
