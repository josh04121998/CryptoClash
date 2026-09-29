// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FloorwarsStore
 * @notice The Founders Set real-money purchase path (collectibility.md Section 13 item 5) — a
 * one-time launch-event product paid in USDG on Robinhood Chain, not a general multi-item store.
 *
 * Deliberately a program call the player makes themselves, not a raw token transfer to a
 * treasury address the backend then has to fuzzy-match by amount and timing — that was the
 * first design considered here and rejected: a bare transfer carries no on-chain record of
 * *which* purchase it was for, so correlating it server-side means guessing from amount/timing,
 * which is exactly the kind of ambiguity a real payment shouldn't have. Calling this contract
 * instead lets the purchase carry its own intentId on-chain, and `purchased[intentId]` is the
 * whole idempotency/replay guard — a player generates a fresh random id, calls
 * `purchaseFoundersSet`, and the server verifies the resulting transaction directly rather than
 * scanning for a matching transfer.
 *
 * No pre-registration step needed: nothing here requires the server to have created the intent
 * first. A player can only get value from calling this at all by actually paying `price` in
 * `paymentToken` — the contract does not care who initiated the id, only that it hasn't been
 * used before.
 *
 * SafeERC20 rather than a bare `transferFrom`/`require` on its return value — real stablecoins
 * are not all equally well-behaved ERC-20 implementations, and this is a payment path.
 */
contract FloorwarsStore is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable paymentToken;
    address public treasury;
    uint256 public price;

    mapping(bytes32 => bool) public purchased;

    event Purchase(address indexed buyer, bytes32 indexed intentId, uint256 amount);

    constructor(address paymentToken_, address treasury_, uint256 price_, address initialOwner) Ownable(initialOwner) {
        paymentToken = IERC20(paymentToken_);
        treasury = treasury_;
        price = price_;
    }

    /// @param intentId A fresh, caller-chosen 32-byte id (e.g. a random UUID) identifying this specific purchase attempt. Never reusable once paid.
    function purchaseFoundersSet(bytes32 intentId) external {
        require(!purchased[intentId], "FloorwarsStore: intent already used");
        purchased[intentId] = true;
        paymentToken.safeTransferFrom(msg.sender, treasury, price);
        emit Purchase(msg.sender, intentId, price);
    }

    function setPrice(uint256 newPrice) external onlyOwner {
        price = newPrice;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "FloorwarsStore: zero address");
        treasury = newTreasury;
    }
}
