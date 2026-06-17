// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.35;

/// @title Events emitted by the FranchiserPoolFactory contract.
interface IFranchiserPoolFactoryEvents {
    /// @notice Emitted when a new FranchiserPool is created.
    event PoolCreated(
        address indexed pool,
        address indexed coordinator,
        address indexed guardian,
        uint256 maxDelegatees,
        uint256 freezePeriod
    );

    /// @notice Emitted when additional COMP is transferred to a pool.
    event PoolFunded(address indexed pool, uint256 amount);

    /// @notice Emitted when a pool is halted and COMP is sent to a recipient.
    event PoolHalted(address indexed pool, address indexed recipient);

    /// @notice Emitted when the coordinator of a pool is replaced.
    event CoordinatorUpdated(address indexed pool, address indexed newCoordinator);

    /// @notice Emitted when the guardian of a pool is replaced.
    event GuardianUpdated(address indexed pool, address indexed newGuardian);

    /// @notice Emitted when the maximum number of delegatees for a pool is updated.
    event MaxDelegateesUpdated(address indexed pool, uint256 newMaxDelegatees);

    /// @notice Emitted when the freeze period for a pool is updated.
    event FreezePeriodUpdated(address indexed pool, uint256 newFreezePeriod);

    /// @notice Emitted when a pool is unfrozen.
    event PoolUnfrozen(address indexed pool);
}
