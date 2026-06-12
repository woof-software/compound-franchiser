// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.30;

import { IFranchiserPoolFactory } from "./interfaces/FranchiserPoolFactory/IFranchiserPoolFactory.sol";
import { FranchiserImmutableState } from "./base/FranchiserImmutableState.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IVotingToken } from "./interfaces/IVotingToken.sol";
import { FranchiserPool } from "./FranchiserPool.sol";

/// @notice Governance's sole entry point for creating, funding, and halting
///         FranchiserPool programs, and for adjusting their parameters.
///         All functions are restricted to the immutable governance address.
contract FranchiserPoolFactory is IFranchiserPoolFactory, FranchiserImmutableState {
    using SafeERC20 for IERC20;

    /// @inheritdoc IFranchiserPoolFactory
    uint256 public constant MINIMUM_FREEZE_PERIOD = 10 days;

    /// @inheritdoc IFranchiserPoolFactory
    address public immutable governance;

    /// @inheritdoc IFranchiserPoolFactory
    mapping(address => bool) public isKnownPool;

    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance(msg.sender, governance);
        _;
    }

    modifier onlyKnownPool(address pool) {
        if (!isKnownPool[pool]) revert UnknownPool(pool);
        _;
    }

    constructor(IVotingToken votingToken_, address governance_)
        FranchiserImmutableState(votingToken_)
    {
        if (governance_ == address(0)) revert ZeroAddress();
        governance = governance_;
    }

    // -------------------------------------------------------------------------
    // Governance functions
    // -------------------------------------------------------------------------

    /// @inheritdoc IFranchiserPoolFactory
    function createPool(
        address coordinator_,
        address guardian_,
        uint256 maxDelegatees_,
        uint256 freezePeriod_,
        uint256 amount
    ) external onlyGovernance returns (FranchiserPool pool) {
        pool = new FranchiserPool(
            votingToken,
            coordinator_,
            guardian_,
            maxDelegatees_,
            freezePeriod_
        );
        isKnownPool[address(pool)] = true;

        if (amount > 0) {
            IERC20(address(votingToken)).safeTransferFrom(
                msg.sender,
                address(pool),
                amount
            );
        }

        emit PoolCreated(
            address(pool),
            coordinator_,
            guardian_,
            maxDelegatees_,
            freezePeriod_,
            amount
        );
    }

    /// @inheritdoc IFranchiserPoolFactory
    function fundPool(address pool, uint256 amount) external onlyGovernance onlyKnownPool(pool) {
        IERC20(address(votingToken)).safeTransferFrom(msg.sender, pool, amount);

        emit PoolFunded(pool, amount);
    }

    /// @inheritdoc IFranchiserPoolFactory
    function transferToPool(address pool, uint256 amount) external onlyGovernance onlyKnownPool(pool) {
        IERC20(address(votingToken)).safeTransfer(pool, amount);

        emit PoolFunded(pool, amount);
    }

    /// @inheritdoc IFranchiserPoolFactory
    function haltPool(address pool, address recipient) external onlyGovernance onlyKnownPool(pool) {
        FranchiserPool(pool).halt(recipient);

        emit PoolHalted(pool, recipient);
    }

    /// @inheritdoc IFranchiserPoolFactory
    function setCoordinator(address pool, address coordinator_) external onlyGovernance onlyKnownPool(pool) {
        FranchiserPool(pool).setCoordinator(coordinator_);

        emit CoordinatorUpdated(pool, coordinator_);
    }

    /// @inheritdoc IFranchiserPoolFactory
    function setGuardian(address pool, address guardian_) external onlyGovernance onlyKnownPool(pool) {
        FranchiserPool(pool).setGuardian(guardian_);

        emit GuardianUpdated(pool, guardian_);
    }

    /// @inheritdoc IFranchiserPoolFactory
    function setMaxDelegatees(address pool, uint256 maxDelegatees_) external onlyGovernance onlyKnownPool(pool) {
        FranchiserPool(pool).setMaxDelegatees(maxDelegatees_);

        emit MaxDelegateesUpdated(pool, maxDelegatees_);
    }

    /// @inheritdoc IFranchiserPoolFactory
    function setFreezePeriod(address pool, uint256 freezePeriod_) external onlyGovernance onlyKnownPool(pool) {
        FranchiserPool(pool).setFreezePeriod(freezePeriod_);

        emit FreezePeriodUpdated(pool, freezePeriod_);
    }

    /// @inheritdoc IFranchiserPoolFactory
    function unfreezePool(address pool) external onlyGovernance onlyKnownPool(pool) {
        FranchiserPool(pool).unfreeze();

        emit PoolUnfrozen(pool);
    }
}
