"use strict";

/**
 * Hand-maintained ABI fragments for the Encore contracts and the ERC-20
 * stablecoin facade. Only the members the backend actually calls are listed.
 * Keep in sync with contracts/TicketEscrow.sol and contracts/FundingVault.sol.
 */

const ERC20 = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const TICKET_ESCROW = [
  // config / admin
  "function ADMIN_ROLE() view returns (bytes32)",
  "function ORGANIZER_ROLE() view returns (bytes32)",
  "function associateStablecoin()",
  "function configureEvent(uint256 ticketPrice, uint16 investorShareBps, uint256 maxTickets)",
  "function setSalesOpen(bool open)",
  // primary sale
  "function buyTicket() returns (uint256 serial)",
  "function buyTicketFor(address buyer) returns (uint256 serial)",
  // royalties / settlement
  "function syncRoyalties() returns (uint256 synced)",
  "function closeAndSettle(uint256 revenueRightSupply)",
  "function allocatePayouts(address[] holders, uint256[] balances)",
  "function claim()",
  "function sweepDust(address to)",
  // views
  "function organizer() view returns (address)",
  "function ticketPrice() view returns (uint256)",
  "function investorShareBps() view returns (uint16)",
  "function maxTickets() view returns (uint256)",
  "function ticketsSold() view returns (uint256)",
  "function primaryRevenue() view returns (uint256)",
  "function organizerProceeds() view returns (uint256)",
  "function poolCredited() view returns (uint256)",
  "function poolDistributed() view returns (uint256)",
  "function royaltiesCollected() view returns (uint256)",
  "function salesOpen() view returns (bool)",
  "function settled() view returns (bool)",
  "function poolAtSettlement() view returns (uint256)",
  "function supplySnapshot() view returns (uint256)",
  "function claimable(address) view returns (uint256)",
  "function poolBalance() view returns (uint256)",
  "function estimatedPayoutPerToken(uint256 revenueRightSupply) view returns (uint256)",
  "function financials() view returns (uint256 sold, uint256 cap, uint256 grossPrimary, uint256 toOrganizer, uint256 poolNow, uint256 royalties, bool isSettled)",
  // events
  "event TicketPurchased(address indexed buyer, uint256 indexed serial, uint256 pricePaid, uint256 organizerCut, uint256 investorCut)",
  "event RoyaltiesSynced(uint256 amount, uint256 poolBalance)",
  "event Settled(uint256 poolAtSettlement, uint256 supplySnapshot)",
  "event PayoutClaimed(address indexed holder, uint256 amount)",
];

const FUNDING_VAULT = [
  "function ADMIN_ROLE() view returns (bytes32)",
  "function ORGANIZER_ROLE() view returns (bytes32)",
  "function associateStablecoin()",
  "function setKyc(address account, bool approved)",
  "function setKycBatch(address[] accounts, bool approved)",
  "function invest(uint256 amount)",
  "function finalize()",
  "function withdrawOrganizerFunds()",
  "function refund()",
  "function markTokensDelivered(address investor)",
  // views
  "function status() view returns (uint8)",
  "function fundingTarget() view returns (uint256)",
  "function pricePerToken() view returns (uint256)",
  "function tokensForSale() view returns (uint256)",
  "function tokensSold() view returns (uint256)",
  "function totalRaised() view returns (uint256)",
  "function deadline() view returns (uint256)",
  "function organizerWithdrawn() view returns (bool)",
  "function kyc(address) view returns (bool)",
  "function contributed(address) view returns (uint256)",
  "function tokenAllocation(address) view returns (uint256)",
  "function tokensDelivered(address) view returns (bool)",
  "function fundingProgressBps() view returns (uint256)",
  "function summary() view returns (uint8 status, uint256 target, uint256 raised, uint256 tokensForSale, uint256 tokensSold, uint256 deadline)",
  // events
  "event Invested(address indexed investor, uint256 amount, uint256 tokens, uint256 totalRaised)",
  "event Finalized(uint8 status, uint256 totalRaised)",
  "event Refunded(address indexed investor, uint256 amount)",
];

/**
 * ATS security-token diamond — the facet functions Encore calls in
 * `ATS_MODE=ats`. All invoked on the single diamond proxy address. Verified
 * against @hashgraph/asset-tokenization-contracts@8 + SDK v8.
 */
const ATS_SECURITY_TOKEN = [
  // AccessControl facet
  "function grantRole(bytes32 role, address account) returns (bool)",
  "function revokeRole(bytes32 role, address account) returns (bool)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function applyRoles(bytes32[] roles, bool[] actives, address account)",
  // Kyc facet
  "function activateInternalKyc() returns (bool)",
  "function isInternalKycActivated() view returns (bool)",
  "function grantKyc(address account, string vcId, uint256 validFrom, uint256 validTo, address issuer) returns (bool)",
  "function revokeKyc(address account) returns (bool)",
  "function getKycStatusFor(address account) view returns (uint8)",
  // Freeze facet
  "function setAddressFrozen(address account, bool frozen)",
  "function isFrozen(address account) view returns (bool)",
  "function getFrozenTokens(address account) view returns (uint256)",
  // Mint / ERC-20 view facets
  "function mint(address to, uint256 amount)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
  // Snapshots facet
  "function takeSnapshot() returns (uint256 snapshotId)",
  // Dividend / corporate-actions facet
  "function setDividend((uint256 recordDate, uint256 executionDate, uint256 amount, uint8 amountDecimals) newDividend) returns (uint256 dividendId)",
  "function getDividendsCount() view returns (uint256)",
];

module.exports = { ERC20, TICKET_ESCROW, FUNDING_VAULT, ATS_SECURITY_TOKEN };
