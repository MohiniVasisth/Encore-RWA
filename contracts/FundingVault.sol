// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IHRC719} from "./interfaces/IHRC719.sol";

/**
 * @title FundingVault
 * @notice All-or-nothing raise for an Encore offering.
 *
 *         KYC-approved investors deposit the settlement stablecoin in exchange
 *         for a recorded allocation of the ATS revenue-right token. If the
 *         funding target is reached by the deadline, the organizer withdraws the
 *         raise and the platform delivers revenue-right tokens through ATS
 *         (which re-checks KYC on transfer). If the target is missed, every
 *         investor is refunded in full and the organizer receives nothing.
 *
 * @dev KYC state here is a local mirror of the ATS control list, maintained by
 *      the platform admin. ATS remains the source of truth and enforces
 *      compliance on the actual token transfer; this mirror only gates deposits
 *      so we never take money from an account that could not receive the token.
 */
contract FundingVault is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --------------------------------------------------------------------- //
    //                                Roles                                  //
    // --------------------------------------------------------------------- //

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ORGANIZER_ROLE = keccak256("ORGANIZER_ROLE");

    // --------------------------------------------------------------------- //
    //                               Config                                  //
    // --------------------------------------------------------------------- //

    IERC20 public immutable stablecoin;
    address public organizer;

    uint256 public fundingTarget; // stablecoin smallest unit
    uint256 public pricePerToken; // stablecoin smallest unit, per revenue-right token
    uint256 public tokensForSale; // total revenue-right tokens on offer
    uint256 public deadline; // unix seconds

    // --------------------------------------------------------------------- //
    //                                State                                  //
    // --------------------------------------------------------------------- //

    enum Status {
        Open,
        Funded,
        Failed
    }

    Status public status;
    uint256 public totalRaised;
    uint256 public tokensSold;
    bool public organizerWithdrawn;

    mapping(address => bool) public kyc;
    mapping(address => uint256) public contributed; // stablecoin in
    mapping(address => uint256) public tokenAllocation; // revenue-right tokens owed
    mapping(address => bool) public tokensDelivered; // ATS transfer done

    // --------------------------------------------------------------------- //
    //                                Events                                 //
    // --------------------------------------------------------------------- //

    event OfferingConfigured(
        uint256 fundingTarget, uint256 pricePerToken, uint256 tokensForSale, uint256 deadline
    );
    event KycUpdated(address indexed account, bool approved);
    event Invested(address indexed investor, uint256 amount, uint256 tokens, uint256 totalRaised);
    event Finalized(Status status, uint256 totalRaised);
    event OrganizerWithdrawal(address indexed organizer, uint256 amount);
    event Refunded(address indexed investor, uint256 amount);
    event TokensDelivered(address indexed investor, uint256 tokens);

    // --------------------------------------------------------------------- //
    //                                Errors                                 //
    // --------------------------------------------------------------------- //

    error NotOpen();
    error DeadlinePassed();
    error DeadlineNotReached();
    error NotKyc();
    error ZeroAmount();
    error NotWholeToken();
    error ExceedsOffer();
    error WrongStatus();
    error NothingToRefund();
    error AlreadyWithdrawn();
    error NothingAllocated();
    error AlreadyDelivered();
    error ZeroAddress();

    // --------------------------------------------------------------------- //
    //                             Constructor                               //
    // --------------------------------------------------------------------- //

    constructor(
        address _stablecoin,
        address _admin,
        address _organizer,
        uint256 _fundingTarget,
        uint256 _pricePerToken,
        uint256 _tokensForSale,
        uint256 _deadline
    ) {
        if (_stablecoin == address(0) || _admin == address(0) || _organizer == address(0)) {
            revert ZeroAddress();
        }
        if (_pricePerToken == 0 || _tokensForSale == 0) revert ZeroAmount();

        stablecoin = IERC20(_stablecoin);
        organizer = _organizer;
        fundingTarget = _fundingTarget;
        pricePerToken = _pricePerToken;
        tokensForSale = _tokensForSale;
        deadline = _deadline;
        status = Status.Open;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(ORGANIZER_ROLE, _organizer);

        emit OfferingConfigured(_fundingTarget, _pricePerToken, _tokensForSale, _deadline);
    }

    // --------------------------------------------------------------------- //
    //                          Admin: setup / KYC                           //
    // --------------------------------------------------------------------- //

    function associateStablecoin() external onlyRole(ADMIN_ROLE) {
        try IHRC719(address(stablecoin)).associate() returns (uint256) {}
        catch {}
    }

    /// @notice Approve or revoke an investor in the local KYC mirror.
    function setKyc(address account, bool approved) external onlyRole(ADMIN_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        kyc[account] = approved;
        emit KycUpdated(account, approved);
    }

    /// @notice Batch KYC update.
    function setKycBatch(address[] calldata accounts, bool approved)
        external
        onlyRole(ADMIN_ROLE)
    {
        for (uint256 i = 0; i < accounts.length; i++) {
            if (accounts[i] == address(0)) revert ZeroAddress();
            kyc[accounts[i]] = approved;
            emit KycUpdated(accounts[i], approved);
        }
    }

    // --------------------------------------------------------------------- //
    //                          Public: investing                            //
    // --------------------------------------------------------------------- //

    /**
     * @notice Invest `amount` of stablecoin. Must be a whole multiple of
     *         `pricePerToken`. Caller must be KYC-approved and must have
     *         approved this contract for `amount`.
     */
    function invest(uint256 amount) external nonReentrant {
       
    }

    // --------------------------------------------------------------------- //
    //                           Finalize the raise                          //
    // --------------------------------------------------------------------- //

    /**
     * @notice Move the offering out of `Open`. Permissionless.
     *         - Funded: target reached (allowed any time), or deadline passed with
     *           raise >= target.
     *         - Failed: deadline passed with raise < target.
     */
    function finalize() external {
        
    }

    /// @notice Organizer pulls the full raise once the offering is Funded.
    function withdrawOrganizerFunds() external nonReentrant onlyRole(ORGANIZER_ROLE) {
        
    }

    /// @notice Investor reclaims their full contribution if the offering Failed.
    function refund() external nonReentrant {
       
    }

    /**
     * @notice Bookkeeping: mark that the platform has delivered an investor's
     *         revenue-right tokens through ATS. Does not move value here.
     */
    function markTokensDelivered(address investor) external onlyRole(ADMIN_ROLE) {
        
    }

    // --------------------------------------------------------------------- //
    //                                Views                                  //
    // --------------------------------------------------------------------- //

    function fundingProgressBps() external view returns (uint256) {
       
    }

    function summary()
        external
        view
        returns (
            Status _status,
            uint256 _target,
            uint256 _raised,
            uint256 _tokensForSale,
            uint256 _tokensSold,
            uint256 _deadline
        )
    {
        return (status, fundingTarget, totalRaised, tokensForSale, tokensSold, deadline);
    }
}
