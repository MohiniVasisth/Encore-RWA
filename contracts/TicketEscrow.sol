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


}
