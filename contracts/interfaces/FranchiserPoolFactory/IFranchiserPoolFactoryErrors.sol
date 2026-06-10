// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8;

/// @title Errors thrown by the FranchiserPoolFactory contract.
interface IFranchiserPoolFactoryErrors {
    /// @notice Thrown when an address other than governance attempts to call a governance-restricted function.
    /// @param caller The address that attempted the call.
    /// @param governance The governance address.
    error NotGovernance(address caller, address governance);

    /// @notice Thrown when an address is not a pool created by this factory.
    /// @param pool The unrecognized pool address.
    error UnknownPool(address pool);
}
