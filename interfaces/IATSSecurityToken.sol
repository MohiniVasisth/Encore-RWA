// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/**
 * @title IATSSecurityToken
 * @notice The subset of the Asset Tokenization Studio (ATS) diamond that
 *         Encore calls when `ATS_MODE=ats`.
 *
 *         An ATS security token is an EIP-2535 diamond: every function below
 *         lives on a different facet but is called on the ONE diamond proxy
 *         address (`REVENUE_RIGHT_EVM_ADDRESS`). The backend talks to it with
 *         ethers via the JSON-RPC relay, signed by the Encore `admin`
 *         account, which must hold the ATS roles listed against each function.
 *
 *         Role hashes come from the ATS contracts package
 *         (hashgraph/asset-tokenization-contracts, constants/roles.sol) and are
 *         mirrored in backend/src/hedera/atsRoles.js.
 *
 *         This interface is documentation-as-code -- Encore does not deploy
 *         it. Verified against ATS contracts + SDK v8.0.0.
 */
interface IATSSecurityToken {
    // ----------------------------- AccessControl ---------------------------- //
    // caller: DEFAULT_ADMIN_ROLE (diamond owner)
    function grantRole(bytes32 role, address account) external returns (bool);
    function revokeRole(bytes32 role, address account) external returns (bool);
    function hasRole(bytes32 role, address account) external view returns (bool);
    function applyRoles(bytes32[] calldata roles, bool[] calldata actives, address account)
        external;

    // --------------------------------- KYC --------------------------------- //
    // Internal-KYC mode lets ROLE_KYC grant KYC without an external VC issuer.
    function initializeInternalKyc(bool activate) external; // usually done at issuance
    function activateInternalKyc() external returns (bool); // caller: ROLE_INTERNAL_KYC_MANAGER
    function isInternalKycActivated() external view returns (bool);

    // caller: ROLE_KYC
    function grantKyc(
        address account,
        string calldata vcId,
        uint256 validFrom,
        uint256 validTo,
        address issuer
    ) external returns (bool);
    function revokeKyc(address account) external returns (bool);
    function getKycStatusFor(address account) external view returns (uint8); // 0 = revoked, 1 = granted

    // -------------------------------- Freeze ------------------------------- //
    // caller: ROLE_FREEZE_MANAGER
    function setAddressFrozen(address account, bool frozen) external;
    function freezePartialTokens(address account, uint256 amount) external;
    function unfreezePartialTokens(address account, uint256 amount) external;
    function isFrozen(address account) external view returns (bool);
    function getFrozenTokens(address account) external view returns (uint256);

    // ------------------------- Issuance / transfer ------------------------- //
    function mint(address to, uint256 amount) external; // caller: ROLE_ISSUER
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function decimals() external view returns (uint8);

    // ------------------------------ Snapshots ------------------------------ //
    function takeSnapshot() external returns (uint256 snapshotId); // caller: ROLE_SNAPSHOT

    // -------------------------- Corporate actions ------------------------- //
    struct Dividend {
        uint256 recordDate;
        uint256 executionDate;
        uint256 amount; // payout per token, in `amountDecimals`
        uint8 amountDecimals;
    }

    // caller: ROLE_CORPORATE_ACTION. Registers the dividend; funding + payout to
    // holders is then handled by the ATS Mass Payout tool / holder claims.
    function setDividend(Dividend calldata newDividend) external returns (uint256 dividendId);
    function getDividendsCount() external view returns (uint256);
}
