// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @notice Test-only stand-in for USDG (or any stablecoin) — this OpenZeppelin install has no
 * `contracts/mocks` package, so this is the minimal ERC-20 FloorwarsStore.ts's tests mint and
 * approve against. Never deployed anywhere real; 6 decimals to match USDG's actual precision.
 */
contract MockERC20 is ERC20 {
    constructor() ERC20("Mock USDG", "USDG") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
