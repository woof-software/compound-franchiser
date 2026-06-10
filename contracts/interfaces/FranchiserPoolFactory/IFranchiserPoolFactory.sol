// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8;

import {IFranchiserPoolFactoryErrors} from "./IFranchiserPoolFactoryErrors.sol";
import {IFranchiserPoolFactoryEvents} from "./IFranchiserPoolFactoryEvents.sol";
import {IFranchiserImmutableState} from "../IFranchiserImmutableState.sol";
import {FranchiserPool} from "../../FranchiserPool.sol";

/// @title Interface for the FranchiserPoolFactory contract.
interface IFranchiserPoolFactory is
    IFranchiserPoolFactoryErrors,
    IFranchiserPoolFactoryEvents,
    IFranchiserImmutableState
{
    /// @notice The minimum freeze period enforced when creating pools or updating their freeze period.
    function MINIMUM_FREEZE_PERIOD() external view returns (uint256);

    /// @notice The immutable governance address (Compound timelock).
    function governance() external view returns (address);

    /// @notice Returns true if `pool` was deployed by this factory.
    function isKnownPool(address pool) external view returns (bool);

    /// @notice Deploys a new FranchiserPool and optionally seeds it with COMP.
    /// @dev Requires governance to have approved this contract for `amount`.
    ///      Reverts if `freezePeriod` is below `MINIMUM_FREEZE_PERIOD`.
    /// @param coordinator_ The initial coordinator address.
    /// @param guardian_ The initial guardian address.
    /// @param maxDelegatees_ The maximum number of simultaneous top-level delegatees.
    /// @param amount The initial COMP amount to transfer from governance to the pool.
    /// @param freezePeriod_ The initial emergency freeze duration (>= MINIMUM_FREEZE_PERIOD).
    /// @return pool The newly deployed FranchiserPool.
    function createPool(
        address coordinator_,
        address guardian_,
        uint256 maxDelegatees_,
        uint256 freezePeriod_,
        uint256 amount
    ) external returns (FranchiserPool pool);

    /// @notice Transfers additional COMP from governance to an existing pool.
    /// @dev Requires governance to have approved this contract for `amount`.
    function fundPool(address pool, uint256 amount) external;

    /// @notice Recalls all delegatees of `pool` and transfers all COMP to `recipient`.
    function haltPool(address pool, address recipient) external;

    /// @notice Replaces the coordinator of `pool`.
    function setCoordinator(address pool, address coordinator_) external;

    /// @notice Replaces the guardian of `pool`.
    function setGuardian(address pool, address guardian_) external;

    /// @notice Updates the maximum delegatee cap of `pool`.
    function setMaxDelegatees(address pool, uint256 maxDelegatees_) external;

    /// @notice Updates the freeze period of `pool`. Reverts if below `MINIMUM_FREEZE_PERIOD`.
    function setFreezePeriod(address pool, uint256 freezePeriod_) external;

    /// @notice Lifts an active freeze on `pool` early, before it auto-expires.
    function unfreezePool(address pool) external;
}
