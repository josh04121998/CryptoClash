/**
 * One-sentence hover explanations for the five launch keywords, condensed
 * from batlleSpec.md Section 11's canonical wording (not reworded from
 * scratch) so tooltip text always matches the spec's stated rules.
 */
export const KEYWORD_TOOLTIPS: Record<string, string> = {
  Rush: "This creature can attack the same turn it's played, instead of waiting a turn.",
  Guard: "This creature protects its player — the opponent must deal with it before attacking the player or any other creature on this side.",
  Stealth: "The opponent can't target this creature until it attacks or otherwise reveals itself.",
  Burn: "Deals direct or ongoing damage — straight to the enemy player, or a little each turn.",
  HODL: "The longer this creature survives, the stronger it grows — it gains a bonus at the start of your turn.",
};
