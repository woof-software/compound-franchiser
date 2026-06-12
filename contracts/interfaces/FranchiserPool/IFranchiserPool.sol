// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8;

import { IFranchiserPoolErrors } from "./IFranchiserPoolErrors.sol";
import { IFranchiserPoolEvents } from "./IFranchiserPoolEvents.sol";
import { IFranchiserImmutableState } from "../IFranchiserImmutableState.sol";
import { Franchiser } from "../../Franchiser.sol";

/// @title Interface for the FranchiserPool contract.
interface IFranchiserPool is IFranchiserPoolErrors, IFranchiserPoolEvents, IFranchiserImmutableState {
    /// @notice The maximum number of sub-delegatees a pool-owned Franchiser can have.
    function INITIAL_MAXIMUM_SUBDELEGATEES() external view returns (uint96);

    /// @notice The minimum duration for an emergency freeze.
    function MINIMUM_FREEZE_PERIOD() external view returns (uint256);

    /// @notice The maximum duration for an emergency freeze.
    function MAXIMUM_FREEZE_PERIOD() external view returns (uint256);

    /// @notice The Franchiser implementation used to clone top-level Franchiser contracts.
    function franchiserImplementation() external view returns (Franchiser);

    /// @notice The FranchiserPoolFactory that deployed and controls this pool.
    function factory() external view returns (address);

    /// @notice The coordinator address authorized to delegate, recall, and reassign.
    function coordinator() external view returns (address);

    /// @notice The guardian address authorized to emergency-recall and freeze.
    function guardian() external view returns (address);

    /// @notice The maximum number of simultaneous top-level delegatees.
    function maxDelegatees() external view returns (uint256);

    /// @notice The duration applied to future emergency freezes.
    function freezePeriod() external view returns (uint256);

    /// @notice The timestamp until which coordinator actions are blocked (0 = not frozen).
    function frozenUntil() external view returns (uint256);

    /// @notice Returns the current set of active top-level delegatee addresses.
    function activeDelegatees() external view returns (address[] memory);

    /// @notice Returns the deterministic Franchiser address for a given delegatee.
    /// @dev The contract may or may not be deployed yet.
    function getFranchiser(address delegatee) external view returns (Franchiser);

    // -------------------------------------------------------------------------
    // Coordinator functions (blocked when pool is frozen)
    // -------------------------------------------------------------------------

    /// @notice Delegates `amount` of COMP from the pool to `delegatee`.
    /// @dev Clones and initializes a Franchiser on first use. Reverts if the
    ///      delegatee cap is reached when adding a new delegatee.
    function delegate(address delegatee, uint256 amount) external;

    /// @notice Fully recalls one delegatee's COMP (including sub-delegatee subtree) back to the pool.
    function recall(address delegatee) external;

    /// @notice Recalls all COMP from `from` and delegates `amount` to `to` atomically.
    function reassign(address from, address to, uint256 amount) external;

    // -------------------------------------------------------------------------
    // Guardian functions (never blocked by freeze)
    // -------------------------------------------------------------------------

    /// @notice Recalls all delegatees and freezes coordinator actions for `freezePeriod` seconds.
    function emergencyFreezeAndRecallPool() external;

    /// @notice Recalls COMP from the specified delegatees back to the pool.
    function emergencyRecallDelegatees(address[] calldata delegatees) external;

    /// @notice Freezes coordinator actions for `freezePeriod` seconds without recalling delegatees.
    function emergencyFreezePool() external;

    // -------------------------------------------------------------------------
    // Factory-only functions (called by FranchiserPoolFactory on behalf of Governance)
    // -------------------------------------------------------------------------

    /// @notice Recalls all delegatees and transfers the entire COMP balance to `recipient`.
    function halt(address recipient) external;

    /// @notice Replaces the coordinator address immediately.
    function setCoordinator(address coordinator_) external;

    /// @notice Replaces the guardian address immediately.
    function setGuardian(address guardian_) external;

    /// @notice Updates the maximum delegatee cap. Lowering does not recall anyone.
    function setMaxDelegatees(uint256 maxDelegatees_) external;

    /// @notice Updates the freeze period applied to future emergency freezes.
    /// @dev Reverts if `freezePeriod_` is below `MINIMUM_FREEZE_PERIOD`.
    function setFreezePeriod(uint256 freezePeriod_) external;

    /// @notice Lifts an active freeze early, re-enabling coordinator actions.
    function unfreeze() external;
}
