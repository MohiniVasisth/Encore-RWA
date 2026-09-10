// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IHRC719} from "./interfaces/IHRC719.sol";


contract TicketEscrow is AccessControl, ReentrancyGuard {
using SafeERC20 for IERC20;

    // --------------------------------------------------------------------- //
    //                                Roles                                  //
    // --------------------------------------------------------------------- //

    /// @notice Platform operator: opens/closes sales, settles, allocates payouts.
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @notice The event organizer. Informational on the primary flow (their
    ///         share is auto-transferred), used to gate organizer-only reads/actions.
    bytes32 public constant ORGANIZER_ROLE = keccak256("ORGANIZER_ROLE");

    uint16 internal constant BPS_DENOMINATOR = 10_000;

    // --------------------------------------------------------------------- //
    //                          Immutable config                            //
    // --------------------------------------------------------------------- //

    IERC20 public immutable stablecoin;

    // --------------------------------------------------------------------- //
    //                           Mutable config                             //
    // --------------------------------------------------------------------- //

    address public organizer;
    uint256 public ticketPrice; // stablecoin smallest unit
    uint16 public investorShareBps; // e.g. 1800 == 18%
    uint256 public maxTickets;

    // --------------------------------------------------------------------- //
    //                              Accounting                              //
    // --------------------------------------------------------------------- //

    uint256 public ticketsSold;
    uint256 public primaryRevenue; // gross primary ticket revenue through escrow
    uint256 public organizerProceeds; // cumulative sent to organizer
    uint256 public poolCredited; // cumulative credited to investor pool (primary + royalties)
    uint256 public poolDistributed; // cumulative paid out to investors
    uint256 public royaltiesCollected; // subset of poolCredited that came from resale royalties

    bool public salesOpen;
    bool public settled;

    // --------------------------------------------------------------------- //
    //                        Settlement snapshot                            //
    // --------------------------------------------------------------------- //

    uint256 public poolAtSettlement; // distributable amount frozen at settlement
    uint256 public supplySnapshot; // revenue-right token total supply at settlement
    uint256 public allocated; // sum of claimable[] allocated so far
    mapping(address => uint256) public claimable;

     // --------------------------------------------------------------------- //
    //                                Events                                 //
    // --------------------------------------------------------------------- //

    event EventConfigured(
        address indexed organizer, uint256 ticketPrice, uint16 investorShareBps, uint256 maxTickets
    );
    event OrganizerUpdated(address indexed oldOrganizer, address indexed newOrganizer);
    event SalesStatusChanged(bool open);
    event TicketPurchased(
        address indexed buyer,
        uint256 indexed serial,
        uint256 pricePaid,
        uint256 organizerCut,
        uint256 investorCut
    );
    event RoyaltiesSynced(uint256 amount, uint256 poolBalance);
    event Settled(uint256 poolAtSettlement, uint256 supplySnapshot);
    event PayoutAllocated(address indexed holder, uint256 amount, uint256 totalAllocated);
    event PayoutClaimed(address indexed holder, uint256 amount);
    event DustSwept(address indexed to, uint256 amount);

    // --------------------------------------------------------------------- //
    //                               Errors                                  //
    // --------------------------------------------------------------------- //

    error SalesClosed();
    error SoldOut();
    error AlreadySettled();
    error NotSettled();
    error ConfigLocked(); // cannot change terms after the first sale
    error ZeroAddress();
    error InvalidShare();
    error NothingClaimable();
    error AllocationExceedsPool();
    error LengthMismatch();

    // --------------------------------------------------------------------- //
    //                             Constructor                               //
    // --------------------------------------------------------------------- //

    /**
     * @param _stablecoin      ERC-20 facade address of the settlement stablecoin.
     * @param _admin           Platform admin (gets DEFAULT_ADMIN_ROLE + ADMIN_ROLE).
     * @param _organizer       Event organizer account (gets ORGANIZER_ROLE).
     * @param _ticketPrice     Primary ticket price in stablecoin smallest units.
     * @param _investorShareBps Investor share of each primary sale, in bps (<= 10000).
     * @param _maxTickets      Hard cap on primary tickets sold through escrow.
     */
      constructor(
        address _stablecoin,
        address _admin,
        address _organizer,
        uint256 _ticketPrice,
        uint16 _investorShareBps,
        uint256 _maxTickets
    ) {
        if (_stablecoin == address(0) || _admin == address(0) || _organizer == address(0)) {
            revert ZeroAddress();
        }
        if (_investorShareBps == 0 || _investorShareBps >= BPS_DENOMINATOR) revert InvalidShare();

        stablecoin = IERC20(_stablecoin);
        organizer = _organizer;
        ticketPrice = _ticketPrice;
        investorShareBps = _investorShareBps;
        maxTickets = _maxTickets;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(ORGANIZER_ROLE, _organizer);

        emit EventConfigured(_organizer, _ticketPrice, _investorShareBps, _maxTickets);
    }

    // --------------------------------------------------------------------- //
    //                          Admin: configuration                         //
    // --------------------------------------------------------------------- //

    /**
     * @notice Associate this contract with the stablecoin HTS token (Hedera only).
     *         Idempotent; safe to call on networks without HIP-719 (treated as no-op).
     */
    function associateStablecoin() external onlyRole(ADMIN_ROLE) {
        try IHRC719(address(stablecoin)).associate() returns (uint256) {}
        catch {}
    }

    /// @notice Update event terms. Locked once the first ticket is sold.
    function configureEvent(
        uint256 _ticketPrice,
        uint16 _investorShareBps,
        uint256 _maxTickets
    ) external onlyRole(ADMIN_ROLE) {
        if (ticketsSold != 0) revert ConfigLocked();
        if (_investorShareBps == 0 || _investorShareBps >= BPS_DENOMINATOR) revert InvalidShare();

        ticketPrice = _ticketPrice;
        investorShareBps = _investorShareBps;
        maxTickets = _maxTickets;

        emit EventConfigured(organizer, _ticketPrice, _investorShareBps, _maxTickets);
    }

     /// @notice Point the organizer payout at a new account. Locked after first sale.
    function updateOrganizer(address newOrganizer) external onlyRole(ADMIN_ROLE) {
        if (newOrganizer == address(0)) revert ZeroAddress();
        if (ticketsSold != 0) revert ConfigLocked();

        address old = organizer;
        _revokeRole(ORGANIZER_ROLE, old);
        _grantRole(ORGANIZER_ROLE, newOrganizer);
        organizer = newOrganizer;

        emit OrganizerUpdated(old, newOrganizer);
    }

    /// @notice Open or close primary ticket sales.
    function setSalesOpen(bool open) external onlyRole(ADMIN_ROLE) {
        if (settled) revert AlreadySettled();
        salesOpen = open;
        emit SalesStatusChanged(open);
    }

    // --------------------------------------------------------------------- //
    //                          Public: primary sale                         //
    // --------------------------------------------------------------------- //

    /**
     * @notice Buy one primary ticket. The caller must have approved this
     *         contract for at least `ticketPrice` of the stablecoin.
     *
     *         The organizer's share is transferred out immediately; the
     *         investors' share stays locked in the contract.
     *
     * @return serial The 1-indexed ticket serial. The backend mints the matching
     *                HTS ticket NFT with this serial to the buyer.
     */
    function buyTicket() external nonReentrant returns (uint256 serial) {
        return _buyTicketFor(msg.sender);
    }

    /**
     * @notice Buy a ticket, funded by the caller, assigned to `buyer`.
     *         Lets the platform relayer purchase on behalf of a fan while the
     *         fan still receives the NFT. Payment is still pulled from `msg.sender`.
     */
    function buyTicketFor(address buyer) external nonReentrant returns (uint256 serial) {
        if (buyer == address(0)) revert ZeroAddress();
        return _buyTicketFor(buyer);
    }

    function _buyTicketFor(address buyer) internal returns (uint256 serial) {
        if (!salesOpen || settled) revert SalesClosed();
        if (ticketsSold >= maxTickets) revert SoldOut();

        uint256 price = ticketPrice;
        uint256 investorCut = (price * investorShareBps) / BPS_DENOMINATOR;
        uint256 organizerCut = price - investorCut;

        // Effects
        ticketsSold += 1;
        serial = ticketsSold;
        primaryRevenue += price;
        poolCredited += investorCut;
        organizerProceeds += organizerCut;

        // Interactions: pull full price in, push organizer share out, keep investor share.
        stablecoin.safeTransferFrom(msg.sender, address(this), price);
        if (organizerCut > 0) {
            stablecoin.safeTransfer(organizer, organizerCut);
        }

        emit TicketPurchased(buyer, serial, price, organizerCut, investorCut);
    }



    // --------------------------------------------------------------------- //
    //                       Public: resale royalty sync                     //
    // --------------------------------------------------------------------- //

    /**
     * @notice Fold any stablecoin sitting in the contract above the tracked
     *         owed balance into the investor pool. This is how HTS resale
     *         royalties (paid directly to this address by the network) are
     *         accounted for. Permissionless: it can only ever increase what
     *         investors are owed.
     */
    function syncRoyalties() public returns (uint256 synced) {
        uint256 owed = poolCredited - poolDistributed;
        uint256 bal = stablecoin.balanceOf(address(this));
        if (bal <= owed) return 0;

        synced = bal - owed;
        poolCredited += synced;
        royaltiesCollected += synced;

        emit RoyaltiesSynced(synced, bal);
    }

    // --------------------------------------------------------------------- //
    //                        Admin: settlement (fallback)                   //
    // --------------------------------------------------------------------- //

    /**
     * @notice Close sales, sync royalties, and freeze the distributable pool.
     * @param revenueRightSupply Total supply of the ATS revenue-right token,
     *        used as the denominator for pro-rata allocation.
     *
     *        Preferred path is an ATS dividend / Mass Payout; call this only
     *        when settling through the contract from an off-chain balance snapshot.
     */
    function closeAndSettle(uint256 revenueRightSupply) external onlyRole(ADMIN_ROLE) {
        if (settled) revert AlreadySettled();
        if (revenueRightSupply == 0) revert InvalidShare();

        syncRoyalties();

        salesOpen = false;
        settled = true;
        supplySnapshot = revenueRightSupply;
        poolAtSettlement = poolCredited - poolDistributed;

        emit SalesStatusChanged(false);
        emit Settled(poolAtSettlement, supplySnapshot);
    }

    /**
     * @notice Allocate pro-rata claims to revenue-right holders from an
     *         off-chain balance snapshot. Idempotent per holder is NOT assumed:
     *         call once per holder with their final snapshot balance.
     *
     * @param holders  Revenue-right token holder accounts (EVM addresses).
     * @param balances Their token balances at the snapshot block.
     */
    function allocatePayouts(address[] calldata holders, uint256[] calldata balances)
        external
        onlyRole(ADMIN_ROLE)
    {
        if (!settled) revert NotSettled();
        if (holders.length != balances.length) revert LengthMismatch();

        uint256 _pool = poolAtSettlement;
        uint256 _supply = supplySnapshot;
        uint256 _allocated = allocated;

        for (uint256 i = 0; i < holders.length; i++) {
            address h = holders[i];
            if (h == address(0)) revert ZeroAddress();

            uint256 amount = (_pool * balances[i]) / _supply;
            claimable[h] += amount;
            _allocated += amount;

            emit PayoutAllocated(h, amount, _allocated);
        }

        if (_allocated > _pool) revert AllocationExceedsPool();
        allocated = _allocated;
    }

    /// @notice Pull your allocated payout after settlement.
    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingClaimable();

        claimable[msg.sender] = 0;
        poolDistributed += amount;

        stablecoin.safeTransfer(msg.sender, amount);
        emit PayoutClaimed(msg.sender, amount);
    }

    /**
     * @notice Sweep rounding dust left after all holders have claimed.
     *         Only callable once settled and only for the amount above what is
     *         still allocated-but-unclaimed.
     */
    function sweepDust(address to) external onlyRole(ADMIN_ROLE) {
        if (!settled) revert NotSettled();
        if (to == address(0)) revert ZeroAddress();

        uint256 stillOwed = allocated - poolDistributed;
        uint256 bal = stablecoin.balanceOf(address(this));
        if (bal <= stillOwed) revert NothingClaimable();

        uint256 dust = bal - stillOwed;
        poolDistributed += dust;
        stablecoin.safeTransfer(to, dust);
        emit DustSwept(to, dust);
    }

    // --------------------------------------------------------------------- //
    //                                Views                                  //
    // --------------------------------------------------------------------- //

    /// @notice Stablecoin currently owed to investors (locked in the contract).
    function poolBalance() external view returns (uint256) {
        return poolCredited - poolDistributed;
    }

    /**
     * @notice Live estimated payout per revenue-right token, pre-settlement.
     * @param revenueRightSupply Total supply of the revenue-right token.
     */
    function estimatedPayoutPerToken(uint256 revenueRightSupply)
        external
        view
        returns (uint256)
    {
        if (revenueRightSupply == 0) return 0;
        uint256 owed = poolCredited - poolDistributed;
        return owed / revenueRightSupply;
    }

    /// @notice Snapshot of the event's on-chain financial health for the dashboard.
    function financials()
        external
        view
        returns (
            uint256 sold,
            uint256 cap,
            uint256 grossPrimary,
            uint256 toOrganizer,
            uint256 poolNow,
            uint256 royalties,
            bool isSettled
        )
    {
        return (
            ticketsSold,
            maxTickets,
            primaryRevenue,
            organizerProceeds,
            poolCredited - poolDistributed,
            royaltiesCollected,
            settled
        );
    }
}
