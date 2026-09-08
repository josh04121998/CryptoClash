import { DiscoveredWallet } from "../useWallet.js";

export interface WalletPickerProps {
  wallets: DiscoveredWallet[];
  onSelect: (uuid: string) => void;
  onClose: () => void;
}

/** Shown whenever more than one EIP-6963 wallet is installed — lets the user pick which extension to sign in with, instead of the app silently grabbing whichever one claimed `window.ethereum`. */
export function WalletPicker({ wallets, onSelect, onClose }: WalletPickerProps) {
  return (
    <div className="wallet-picker__backdrop" onClick={onClose}>
      <div className="wallet-picker" onClick={(e) => e.stopPropagation()}>
        <span className="wallet-picker__title">Choose a wallet</span>
        {wallets.map((w) => (
          <button key={w.uuid} type="button" className="wallet-picker__option" onClick={() => onSelect(w.uuid)}>
            <img src={w.icon} alt="" className="wallet-picker__icon" />
            {w.name}
          </button>
        ))}
      </div>
    </div>
  );
}
