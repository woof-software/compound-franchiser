// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.35;

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
    /// @param provided The number of delegatees being added.
    /// @param maxDelegatees The current maximum number of delegatees.
    error MaxDelegateesExceeded(uint256 provided, uint256 maxDelegatees);

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

    /// @notice Thrown when `maxDelegatees_` exceeds the hard upper limit `MAX_DELEGATEES`.
    /// @param provided The provided maximum number of delegatees.
    /// @param limit The hard upper limit.
    error MaxDelegateesExceedsLimit(uint256 provided, uint256 limit);

    /// @notice Thrown when the coordinator and guardian addresses are the same.
    /// @param address_ The conflicting address.
    error CoordinatorGuardianCollision(address address_);

    /// @notice Thrown when an address other than the coordinator or factory attempts to call a restricted function.
    /// @param caller The address that attempted the call.
    /// @param coordinator The coordinator address.
    /// @param factory The factory address.
    error NotCoordinatorOrFactory(address caller, address coordinator, address factory);

    /// @notice Thrown when attempting to transfer delegation to the same address.
    /// @param addr The address that is both the source and destination of the delegation transfer.
    error AddressCollision(address addr);

    /// @notice Thrown when attempting to unfreeze a pool that is not currently frozen.
     error PoolNotFrozen();

    /// @notice Thrown when attempting to set a value to the same value it currently holds.
    /// @param value The value that is the same as the current value.
    error SameValue(uint256 value);
}
