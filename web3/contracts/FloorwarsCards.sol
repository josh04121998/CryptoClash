// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FloorwarsCards
 * @notice On-chain custody groundwork for Floorwars card instances (architecture.md Section 8) —
 * deliberately minimal. This is NOT the final minting design: it proves out read/write plumbing
 * against a real testnet, nothing more.
 *
 * ERC-1155 per architecture.md Section 8 ("efficient batch mint, natural fit for 'many copies of
 * one design'"). Minting is owner-gated — the opt-in/async flow it describes has the game
 * backend's Web3 Service submit mints on a player's behalf, never the player calling this
 * contract directly.
 *
 * Deliberately does NOT encode a token-ID-to-serial-number scheme (e.g. one ID per edition vs.
 * one ID per individually-serialed instance) — collectibility.md Section 13 explicitly leaves
 * that schema shape undecided ("no code path mints card_instances at all yet"). Inventing it here
 * under "groundwork" would silently make a real product decision that isn't this contract's to
 * make; a future minting pass should decide that and, if needed, replace or extend this contract.
 */
contract FloorwarsCards is ERC1155, Ownable {
    constructor(string memory uri_, address initialOwner) ERC1155(uri_) Ownable(initialOwner) {}

    function mint(address to, uint256 id, uint256 amount, bytes memory data) external onlyOwner {
        _mint(to, id, amount, data);
    }

    function setURI(string memory newUri) external onlyOwner {
        _setURI(newUri);
    }
}
