// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.35;

import { IFranchiserPoolFactoryErrors } from "./interfaces/FranchiserPoolFactory/IFranchiserPoolFactoryErrors.sol";
import { IFranchiserPoolFactoryEvents } from "./interfaces/FranchiserPoolFactory/IFranchiserPoolFactoryEvents.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IVotingToken } from "./interfaces/IVotingToken.sol";
import { FranchiserPool } from "./FranchiserPool.sol";

/// @notice Governance's sole entry point for creating, funding, and halting
///         FranchiserPool programs, and for adjusting their parameters.
///         All functions are restricted to the immutable governance address.
contract FranchiserPoolFactory is IFranchiserPoolFactoryErrors, IFranchiserPoolFactoryEvents {
    using SafeERC20 for IERC20;

    /// @inheritdoc IFranchiserPoolFactory
    uint256 public constant MINIMUM_FREEZE_PERIOD = 10 days;
    /// @notice The `votingToken` of the contract.
    /// @return The `votingToken`.
    IERC20 public immutable votingToken;

    /// @inheritdoc IFranchiserPoolFactory
    address public immutable governance;

    /// @inheritdoc IFranchiserPoolFactory
    mapping(address => bool) public isKnownPool;

    address[] internal _pools;

    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance(msg.sender, governance);
        _;
    }

    modifier onlyKnownPool(address pool) {
        if (!isKnownPool[pool]) revert UnknownPool(pool);
        _;
    }

    constructor(IVotingToken votingToken_, address governance_)
    {
        if (governance_ == address(0)) revert ZeroAddress();
        governance = governance_;
    }

    // -------------------------------------------------------------------------
    // Governance functions
    // -------------------------------------------------------------------------
        votingToken = votingToken_;

    function _createPool(
        address coordinator_,
        address guardian_,
        uint256 maxDelegatees_,
        uint256 freezePeriod_
    ) internal returns (FranchiserPool pool) {
        pool = new FranchiserPool(
            votingToken,
            coordinator_,
            guardian_,
            maxDelegatees_,
            freezePeriod_
        );

        isKnownPool[address(pool)] = true;
        _pools.push(address(pool));

        emit PoolCreated(
            address(pool),
            coordinator_,
            guardian_,
            maxDelegatees_,
            freezePeriod_
        );
    }

    /// @inheritdoc IFranchiserPoolFactory
    function createPool(
        address coordinator_,
        address guardian_,
        uint256 maxDelegatees_,
        uint256 freezePeriod_,
        uint256 amount
    ) external onlyGovernance returns (FranchiserPool pool) {
        pool = _createPool(coordinator_, guardian_, maxDelegatees_, freezePeriod_);

        if (amount > 0) {
            IERC20(address(votingToken)).safeTransferFrom(
                msg.sender,
                address(pool),
                amount
            );

            emit PoolFunded(address(pool), amount);
        }
    }

    /// @inheritdoc IFranchiserPoolFactory
    function createPoolAndFund(
        address coordinator_,
        address guardian_,
        uint256 maxDelegatees_,
        uint256 freezePeriod_,
        address[] calldata delegatees,
        uint256[] calldata amounts
    ) external onlyGovernance returns (FranchiserPool pool) {
        if (delegatees.length != amounts.length)
            revert ArrayLengthMismatch();
        if (delegatees.length > maxDelegatees_)
            revert MaxDelegateesExceeded(delegatees.length, maxDelegatees_);

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < delegatees.length; i++) {
            if (amounts[i] == 0) revert ZeroAmount();
            totalAmount += amounts[i];
        }

        pool = _createPool(coordinator_, guardian_, maxDelegatees_, freezePeriod_);

        if (totalAmount > 0) {
            IERC20(address(votingToken)).safeTransferFrom(
                msg.sender,
                address(pool),
                totalAmount
            );

            emit PoolFunded(address(pool), totalAmount);

            for (uint256 i = 0; i < delegatees.length; i++) {
                FranchiserPool(address(pool)).delegate(delegatees[i], amounts[i]);
            }
        }
    }

    /// @inheritdoc IFranchiserPoolFactory
    function getAllPools() external view returns (address[] memory) {
        return _pools;
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
