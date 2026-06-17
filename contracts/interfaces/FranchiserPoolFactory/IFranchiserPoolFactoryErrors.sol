// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.35;

/// @title Errors thrown by the FranchiserPoolFactory contract.
interface IFranchiserPoolFactoryErrors {
    /// @notice Thrown when an address other than governance attempts to call a governance-restricted function.
    /// @param caller The address that attempted the call.
    /// @param governance The governance address.
    error NotGovernance(address caller, address governance);

    /// @notice Thrown when an address is not a pool created by this factory.
    /// @param pool The unrecognized pool address.
    error UnknownPool(address pool);

    /// @notice Thrown when a required address argument is the zero address.
    error ZeroAddress();

    /// @notice Thrown when an array argument is empty.
    error EmptyArray();

    /// @notice Thrown when array arguments have mismatched lengths.
    error ArrayLengthMismatch();

    /// @notice Thrown when a required amount argument is zero.
    error ZeroAmount();

    /// @notice Thrown when the delegatees array exceeds the pool's maximum delegatee cap.
    /// @param count The number of delegatees provided.
    /// @param maximum The maximum number of delegatees allowed.
    error MaxDelegateesExceeded(uint256 count, uint256 maximum);

    /// @notice Thrown when creating a pool with a coordinator or guardian address equal to the factory address.
    /// @param coordinator The provided coordinator address.
    /// @param guardian The provided guardian address.
    error FactoryAsActor(address coordinator, address guardian);
}
