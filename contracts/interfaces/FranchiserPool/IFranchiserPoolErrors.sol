// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8;

/// @title Errors thrown by the FranchiserPool contract.
interface IFranchiserPoolErrors {
    /// @notice Thrown when an address other than the factory attempts to call a factory-restricted function.
    /// @param caller The address that attempted the call.
    /// @param factory The factory address.
    error NotFactory(address caller, address factory);

    /// @notice Thrown when an address other than the coordinator attempts to call a coordinator-restricted function.
    /// @param caller The address that attempted the call.
    /// @param coordinator The coordinator address.
    error NotCoordinator(address caller, address coordinator);

    /// @notice Thrown when an address other than the guardian attempts to call a guardian-restricted function.
    /// @param caller The address that attempted the call.
    /// @param guardian The guardian address.
    error NotGuardian(address caller, address guardian);

    /// @notice Thrown when a coordinator action is attempted while the pool is frozen.
    /// @param frozenUntil The timestamp until which the pool remains frozen.
    error PoolFrozen(uint256 frozenUntil);

    /// @notice Thrown when attempting to add a new delegatee beyond the maximum cap.
    /// @param maxDelegatees The current maximum number of delegatees.
    error MaxDelegateesReached(uint256 maxDelegatees);

    /// @notice Thrown when a freeze period shorter than the enforced minimum is provided.
    /// @param provided The provided freeze period.
    /// @param minimum The minimum allowed freeze period.
    error FreezePeriodTooShort(uint256 provided, uint256 minimum);

    /// @notice Thrown when a freeze period longer than the enforced maximum is provided.
    /// @param provided The provided freeze period.
    /// @param maximum The maximum allowed freeze period.
    error FreezePeriodTooLong(uint256 provided, uint256 maximum);

    /// @notice Thrown when a required address argument is the zero address.
    error ZeroAddress();

    /// @notice Thrown when a required amount argument is zero.
    error ZeroAmount();
}
