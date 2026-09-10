-- Leaderboard read-path index (STATUS.md Section 8 item 16's audit finding). leaderboardRepo.ts
-- runs `where reason = $2` (getTopWins/getMyWins) and `where reason = any($n::text[])`
-- (getTopWinRate/getMyWinRate, over MATCH_REASONS) grouped by account_id on every Leaderboard
-- page view. The only existing index on coin_transactions is
-- coin_transactions_account_id_idx(account_id) (0003_coins_and_packs.sql) — nothing covers
-- `reason`, so every one of those queries does a full table scan. A composite (reason,
-- account_id) btree lets Postgres seek straight to the matching reason(s) and, since
-- account_id is the immediate next column, satisfies the `group by account_id` off the index
-- itself rather than a heap scan per row.
--
-- getTopCoinsEarned/getMyCoinsEarned filter on `amount > 0`, not `reason`, so they're
-- deliberately not what this index targets.

create index if not exists coin_transactions_reason_account_id_idx on coin_transactions(reason, account_id);
