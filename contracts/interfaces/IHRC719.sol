// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/**
 * @title IHRC719
 * @notice Minimal interface for the Hedera token-association facade (HIP-719).
 *         On Hedera, a contract must be "associated" with an HTS token before it
 *         can receive or hold a balance of it. Calling `associate()` on the
 *         token's EVM address associates `msg.sender` (this contract).
 *
 *         On a non-Hedera EVM (local Hardhat) this call is not available, so
 *         callers wrap it in a try/catch and treat failure as a no-op.
 */
interface IHRC719 {
    function associate() external returns (uint256 responseCode);

    function dissociate() external returns (uint256 responseCode);

    function isAssociated() external view returns (bool);
}
