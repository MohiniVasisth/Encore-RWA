"use strict";

/**
 * ATS security-token role hashes.
 *
 * Verbatim from `@hashgraph/asset-tokenization-contracts@8` —
 * `contracts/constants/roles.sol` (and the SDK's SecurityRole enum). These are
 * the keccak role ids used by the ATS diamond's AccessControl facet.
 *
 * The Encore `admin` account must hold the roles marked below before
 * `ATS_MODE=ats` will work. Grant them with `scripts/ats/grantRoles.js`
 * (run by the ATS token's DEFAULT_ADMIN / diamond owner).
 */

module.exports = {
  DEFAULT_ADMIN_ROLE:
    "0x0000000000000000000000000000000000000000000000000000000000000000",

  // needed by Encore admin:
  ROLE_KYC: "0x754f499f9fdfbb089d12bdec817a6863d593d8a3ea7f546c00a5cafd20957bfc",
  ROLE_KYC_MANAGER:
    "0xec811504e835acf29535b5b62307b08000468f0c61ca6163ed6f17a03629b91e",
  ROLE_INTERNAL_KYC_MANAGER:
    "0xdd78fdcd1b38a5360405cef8d91e758ad0f42bf2ced681b803b3c2704b0a32a7",
  ROLE_FREEZE_MANAGER:
    "0x71ae38482e1ab1c28e767d64766d686215b490c8c1bd7dfe6b101525187c2155",
  ROLE_ISSUER: "0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f",
  ROLE_CORPORATE_ACTION:
    "0xa1acfc499025c99f55059195e6276f639d34a18aad7b8121b9192b7f438c55cd",
  ROLE_SNAPSHOT:
    "0xf7d999723d2160432933a2aeffaae83e262a5a46fe94f34614a7676d1d1f67c6",

  // other common roles, for reference:
  ROLE_CONTROLLER:
    "0xb4d2b850c3ed8a234d390d5c157bbb1824883213c335ffe2a0f0761bb168713e",
  ROLE_PAUSER: "0x3cb8b459fdb6e7dc3d2a2aa529e530f885d45e03584adb438423209c86a2731f",
  ROLE_CONTROL_LIST:
    "0x6ed9a91e996c6475ecdc28ecbdbe9bd1122fc62b30cdbe6da8271884b51ec74d",

  /** Roles the Encore admin needs on the ATS token. */
  ENCORE_ADMIN_ROLES: [
    "ROLE_INTERNAL_KYC_MANAGER",
    "ROLE_KYC",
    "ROLE_FREEZE_MANAGER",
    "ROLE_ISSUER",
    "ROLE_SNAPSHOT",
    "ROLE_CORPORATE_ACTION",
  ],
};
