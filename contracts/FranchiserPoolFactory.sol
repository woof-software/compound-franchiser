// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.35;

import { IFranchiserPoolFactoryErrors } from "./interfaces/FranchiserPoolFactory/IFranchiserPoolFactoryErrors.sol";
import { IFranchiserPoolFactoryEvents } from "./interfaces/FranchiserPoolFactory/IFranchiserPoolFactoryEvents.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IVotingToken } from "./interfaces/IVotingToken.sol";
import { FranchiserPool } from "./FranchiserPool.sol";

/**
 * @title FranchiserPoolFactory contract for managing FranchiserPool programs.
 * @author WOOF! Software
 * @custom:security-contact dmitriy@woof.software
 * @notice Governance's sole entry point for creating, funding, and halting
 *         FranchiserPool programs, and for adjusting their parameters.
 *         All functions are restricted to the immutable governance address.
 */
contract FranchiserPoolFactory is IFranchiserPoolFactoryErrors, IFranchiserPoolFactoryEvents {
    using SafeERC20 for IERC20;

    /// @notice The `votingToken` of the contract.
    /// @return The `votingToken`.
    IERC20 public immutable votingToken;

    /// @notice The governance address (Compound timelock).
    address public constant governance = 0x6d903f6003cca6255D85CcA4D3B5E5146dC33925;

    /// @inheritdoc IFranchiserPoolFactory
    mapping(address => bool) public isKnownPool;

    address[] internal _pools;

    /// @notice Checks that the caller is the governance address.
    /// @dev Reverts with NotGovernance if the caller is not governance.
    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance(msg.sender, governance);
        _;
    }

    /// @notice Checks that `pool` is a known pool deployed by this factory.
    /// @dev Reverts with UnknownPool if `pool` is not in the `_pools` set.
    modifier onlyKnownPool(address pool) {
        if (!isKnownPool[pool]) revert UnknownPool(pool);
        _;
    }

    constructor(IVotingToken votingToken_, address governance_)
    {
        if (governance_ == address(0)) revert ZeroAddress();
        governance = governance_;
    }
    /// @notice The constructor sets the `votingToken`.
    /// @param votingToken_ The `votingToken` of the contract.

        votingToken = votingToken_;
    }

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

    /// @notice Deploys a new FranchiserPool and funds initial delegatees in a single transaction.
    /// @dev Requires governance to have approved this contract for `amount`.
    /// @param coordinator_ The initial coordinator address.
    /// @param guardian_ The initial guardian address.
    /// @param maxDelegatees_ The maximum number of simultaneous top-level delegatees.
    /// @param freezePeriod_ The initial emergency freeze duration.
    /// @param delegatees The initial delegatees to fund.
    /// @param amounts The initial amounts of COMP to transfer from governance to each delegatee.
    /// @return pool The newly deployed FranchiserPool.
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

    /// @notice Transfers additional COMP from governance to an existing pool.
    /// @dev Requires governance to have approved this contract for `amount`.
    function fundPool(address pool, uint256 amount) external onlyGovernance onlyKnownPool(pool) {
        IERC20(address(votingToken)).safeTransferFrom(msg.sender, pool, amount);

        emit PoolFunded(pool, amount);
    }

    /// @notice Transfer `amount` of COMP from factory balance to `pool`.
    /// @dev Should be used if COMP was transferred to the factory outside of `fundPool`
    function transferToPool(address pool, uint256 amount) external onlyGovernance onlyKnownPool(pool) {
        IERC20(address(votingToken)).safeTransfer(pool, amount);

        emit PoolFunded(pool, amount);
    }

    /// @notice Recalls all delegatees of `pool` and transfers all COMP to `recipient`.
    function haltPool(address pool, address recipient) external onlyGovernance onlyKnownPool(pool) {
        FranchiserPool(pool).halt(recipient);

        emit PoolHalted(pool, recipient);
    }

    /// @notice Replaces the coordinator of `pool`.
    function setCoordinator(address pool, address coordinator_) external onlyGovernance onlyKnownPool(pool) {
        FranchiserPool(pool).setCoordinator(coordinator_);

        emit CoordinatorUpdated(pool, coordinator_);
    }

    /// @notice Replaces the guardian of `pool`.
    function setGuardian(address pool, address guardian_) external onlyGovernance onlyKnownPool(pool) {
        FranchiserPool(pool).setGuardian(guardian_);

        emit GuardianUpdated(pool, guardian_);
    }

    /// @notice Updates the maximum delegatee cap of `pool`.
    function setMaxDelegatees(address pool, uint256 maxDelegatees_) external onlyGovernance onlyKnownPool(pool) {
        FranchiserPool(pool).setMaxDelegatees(maxDelegatees_);

        emit MaxDelegateesUpdated(pool, maxDelegatees_);
    }

    /// @notice Updates the freeze period of `pool`.
    function setFreezePeriod(address pool, uint256 freezePeriod_) external onlyGovernance onlyKnownPool(pool) {
        FranchiserPool(pool).setFreezePeriod(freezePeriod_);

        emit FreezePeriodUpdated(pool, freezePeriod_);
    }

    function unfreezePool(address pool) external onlyGovernance onlyKnownPool(pool) {
        FranchiserPool(pool).unfreeze();

        emit PoolUnfrozen(pool);
    }

    /// @notice Returns true if `pool` was deployed by this factory.
    function isKnownPool(address pool) external view returns (bool) {
        return _pools.contains(pool);
    }

    /// @notice Returns the list of all pools deployed by this factory.
    function getAllPools() external view returns (address[] memory) {
        return _pools.values();
    }
}
