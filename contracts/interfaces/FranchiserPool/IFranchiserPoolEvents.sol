// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.35;

/// @title Events emitted by the FranchiserPool contract.
interface IFranchiserPoolEvents {
    /// @notice Emitted when the coordinator address is changed.
    event CoordinatorSet(address indexed oldCoordinator, address indexed newCoordinator);

    /// @notice Emitted when the guardian address is changed.
    event GuardianSet(address indexed oldGuardian, address indexed newGuardian);

    /// @notice Emitted when the maximum number of delegatees is changed.
    event MaxDelegateesSet(uint256 oldMax, uint256 newMax);

    /// @notice Emitted when the freeze period is changed.
    event FreezePeriodSet(uint256 oldPeriod, uint256 newPeriod);

    /// @notice Emitted when a new top-level delegatee is added to the active set.
    event DelegateeActivated(address indexed delegatee);

    /// @notice Emitted when a top-level delegatee is removed from the active set.
    event DelegateeDeactivated(address indexed delegatee);

    /// @notice Emitted when COMP is delegated to a franchiser.
    event Delegated(address indexed delegatee, uint256 amount);

    /// @notice Emitted when the pool is emergency-frozen by the guardian.
    /// @param frozenUntil The timestamp until which the pool is frozen.
    event EmergencyFreeze(uint256 frozenUntil);

    /// @notice Emitted when the pool freeze is lifted (by governance or auto-expiry passage).
    event PoolUnfrozen();

    /// @notice Emitted when the pool is halted and all COMP is sent to a recipient.
    event Halted(address indexed recipient);
}
