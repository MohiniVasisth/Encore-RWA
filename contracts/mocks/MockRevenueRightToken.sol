// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockRevenueRightToken
 * @notice Local-only stand-in for the ATS revenue-right security token. It
 *         emulates the two ATS behaviours the demo relies on:
 *           - a KYC / control list that gates who may receive tokens, and
 *           - an admin freeze that blocks a specific holder from transferring.
 *
 *         On Hedera testnet this token is issued through the Asset Tokenization
 *         Studio UI (ERC-3643 / ERC-1400 style) and ATS enforces these rules
 *         natively. See docs/ATS_INTEGRATION.md.
 */
contract MockRevenueRightToken is ERC20, Ownable {
    mapping(address => bool) public isKycApproved;
    mapping(address => bool) public isFrozen;

    event KycSet(address indexed account, bool approved);
    event FrozenSet(address indexed account, bool frozen);

    error ReceiverNotKyc(address account);
    error SenderFrozen(address account);
    error ReceiverFrozen(address account);

    constructor() ERC20("Encore Revenue Right (Mock)", "ENCRR") Ownable(msg.sender) {}

    function setKyc(address account, bool approved) external onlyOwner {
        isKycApproved[account] = approved;
        emit KycSet(account, approved);
    }

    function setFrozen(address account, bool frozen) external onlyOwner {
        isFrozen[account] = frozen;
        emit FrozenSet(account, frozen);
    }

    /// @notice Issue tokens to a KYC-approved holder (models an ATS primary issuance).
    function issue(address to, uint256 amount) external onlyOwner {
        if (!isKycApproved[to]) revert ReceiverNotKyc(to);
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        // Mint (from == 0) is already KYC-checked in issue(); burn (to == 0) is allowed.
        if (from != address(0) && to != address(0)) {
            if (!isKycApproved[to]) revert ReceiverNotKyc(to);
            if (isFrozen[from]) revert SenderFrozen(from);
            if (isFrozen[to]) revert ReceiverFrozen(to);
        }
        super._update(from, to, value);
    }
}
