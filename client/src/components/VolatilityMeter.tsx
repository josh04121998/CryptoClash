export interface VolatilityMeterProps {
  volatility: number;
}

/** The shared global meter from batlleSpec.md Section 16 — belongs to neither player, so it renders between the two boards. */
export function VolatilityMeter({ volatility }: VolatilityMeterProps) {
  return (
    <div
      className="volatility-meter"
      title="Reaching 10 triggers a random Market Event, then resets to 0."
      role="img"
      aria-label={`Volatility ${volatility} of 10 — reaching 10 triggers a random Market Event`}
    >
      <span className="volatility-meter__label" aria-hidden="true">
        VOLATILITY {volatility}/10
      </span>
      <div className="volatility-meter__track">
        <div
          className={volatility >= 8 ? "volatility-meter__fill volatility-meter__fill--critical" : "volatility-meter__fill"}
          style={{ width: `${(volatility / 10) * 100}%` }}
        />
      </div>
    </div>
  );
}
