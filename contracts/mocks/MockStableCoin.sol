// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockStableCoin
 * @notice Local-only stand-in for the HTS test stablecoin. On Hedera testnet the
 *         real settlement token is an HTS fungible token created via
 *         `scripts/hedera/createStablecoin.js`; its ERC-20 facade address is what
 *         the contracts consume. This mock is used exclusively by the Hardhat
 *         test suite.
 */
contract MockStableCoin is ERC20 {
    uint8 private immutable _decimals;

    constructor(uint8 decimals_) ERC20("Encore Mock USD", "mUSD") {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
