import { CardTemplate } from "@cryptoclash/engine";
import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "../api.js";
import { conditionBandName } from "../conditionGrade.js";

interface InstanceSummary {
  id: string;
  isFoil: boolean;
  conditionGrade: number | null;
  serialNumber: number | null;
  isFirstEdition: boolean;
  /** Set once mintInstance() on the server has confirmed the on-chain mint. */
  onchainTokenId: string | null;
  /** A mint attempt is already in flight for this instance (e.g. from another tab). */
  minting: boolean;
}

interface MintResult {
  tokenId: string;
  txHash: string;
  imageUrl: string;
  metadataUrl: string;
}

export interface MintPanelProps {
  token: string;
  template: CardTemplate;
  onClose: () => void;
}

/**
 * Per-template instance picker — the Collection screen only ever showed aggregated counts
 * (owned/foil totals), never individual card_instances rows, so there was nothing for a player
 * to actually point at and say "mint *this* one." Opens on a card click, lists this account's
 * own copies with their real per-instance attributes, and lets the player mint any not-yet-minted
 * one (session 37's new POST /api/mint/:instanceId — see server/src/mintingRepo.ts).
 */
export function MintPanel({ token, template, onClose }: MintPanelProps) {
  const [instances, setInstances] = useState<InstanceSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mintingId, setMintingId] = useState<string | null>(null);
  const [justMinted, setJustMinted] = useState<Record<string, MintResult>>({});
  const [mintErrors, setMintErrors] = useState<Record<string, string>>({});

  function load() {
    apiFetch<{ instances: InstanceSummary[] }>(`/api/collection/${template.id}/instances`, { token })
      .then((res) => setInstances(res.instances))
      .catch((e) => setLoadError((e as Error).message));
  }

  useEffect(load, [token, template.id]);

  async function handleMint(instanceId: string) {
    setMintingId(instanceId);
    setMintErrors((prev) => ({ ...prev, [instanceId]: "" }));
    try {
      const result = await apiFetch<MintResult>(`/api/mint/${instanceId}`, { method: "POST", token });
      setJustMinted((prev) => ({ ...prev, [instanceId]: result }));
      load();
    } catch (e) {
      const message =
        e instanceof ApiError && e.status === 501 ? "Minting isn't live on this server yet." : (e as Error).message;
      setMintErrors((prev) => ({ ...prev, [instanceId]: message }));
    } finally {
      setMintingId(null);
    }
  }

  return (
    <div className="tutorial-offer__backdrop" onClick={onClose}>
      <div className="mint-panel" role="dialog" aria-modal="true" aria-labelledby="mint-panel-title" onClick={(e) => e.stopPropagation()}>
        <h2 className="tutorial-offer__title" id="mint-panel-title">
          {template.name} — your copies
        </h2>

        {loadError && <p className="deck-picker__empty">Couldn't load your copies: {loadError}</p>}
        {!loadError && !instances && <p className="deck-picker__prompt">Loading…</p>}
        {instances?.length === 0 && <p className="deck-picker__empty">You don't own any copies of this card.</p>}

        <ul className="mint-panel__list">
          {instances?.map((instance) => (
            <li key={instance.id} className="mint-panel__row">
              <div className="mint-panel__badges">
                {instance.isFoil && <span className="mint-panel__badge mint-panel__badge--foil">✨ Foil</span>}
                {instance.conditionGrade !== null && (
                  <span className="mint-panel__badge">
                    {conditionBandName(instance.conditionGrade)} ({instance.conditionGrade}/10)
                  </span>
                )}
                {instance.serialNumber !== null && <span className="mint-panel__badge">#{instance.serialNumber}</span>}
                {instance.isFirstEdition && <span className="mint-panel__badge">1st Edition</span>}
              </div>
              <div className="mint-panel__action">
                {instance.onchainTokenId ? (
                  <span className="mint-panel__minted">✅ Minted</span>
                ) : justMinted[instance.id] ? (
                  <span className="mint-panel__minted">
                    ✅ Minted —{" "}
                    <a href={justMinted[instance.id].metadataUrl} target="_blank" rel="noreferrer">
                      view metadata
                    </a>
                  </span>
                ) : (
                  <button type="button" disabled={mintingId === instance.id || instance.minting} onClick={() => handleMint(instance.id)}>
                    {mintingId === instance.id || instance.minting ? "Minting…" : "Mint"}
                  </button>
                )}
                {mintErrors[instance.id] && <span className="mint-panel__error">{mintErrors[instance.id]}</span>}
              </div>
            </li>
          ))}
        </ul>

        <div className="tutorial-offer__actions">
          <button type="button" className="tutorial-offer__secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
