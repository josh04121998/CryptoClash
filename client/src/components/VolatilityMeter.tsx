export interface VolatilityMeterProps {
  volatility: number;
}

/** The shared global meter from batlleSpec.md Section 16 — belongs to neither player, so it renders between the two boards. */
export function VolatilityMeter({ volatility }: VolatilityMeterProps) {
  return (
    <div className="volatility-meter" title="Reaching 10 triggers a random Market Event, then resets to 0.">
      <span className="volatility-meter__label">VOLATILITY {volatility}/10</span>
      <div className="volatility-meter__track">
        <div className="volatility-meter__fill" style={{ width: `${(volatility / 10) * 100}%` }} />
      </div>
    </div>
  );
}
