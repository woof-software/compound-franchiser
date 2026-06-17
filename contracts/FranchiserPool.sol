// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.35;

import { IFranchiserPoolErrors } from "./interfaces/FranchiserPool/IFranchiserPoolErrors.sol";
import { IFranchiserPoolEvents } from "./interfaces/FranchiserPool/IFranchiserPoolEvents.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Franchiser } from "./Franchiser.sol";

/**
 * @title FranchiserPool contract for managing a pool of idle COMP and distributing it to top-level delegatees.
 * @author Woof
 * @custom:security-contact dmitriy@woof.software
 * @notice Manages a pool of idle COMP and distributes it to top-level delegatees via
 *         Franchiser instances. Deployed and controlled by FranchiserPoolFactory on
 *         behalf of Governance. The Coordinator manages delegations; the Guardian
 *         provides emergency recall and freeze capabilities.
 */
contract FranchiserPool is IFranchiserPoolErrors, IFranchiserPoolEvents {
    using Clones for address;
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;

    /// @notice The maximum number of sub-delegatees a pool-owned Franchiser can have.
    uint96 public constant INITIAL_MAXIMUM_SUBDELEGATEES = 1;

    /// @notice Hard upper limit on `maxDelegatees` to ensure _recallAll always fits in one block.
    /// @dev Benchmarked worst-case (100 delegatees each with 1 active sub-delegatee): 11.15 M gas,
    ///      which is 66% of the 16.7 M block gas cap observed on mainnet. The break-even is ~150.
    uint256 public constant DELEGATEES_LIMIT = 100;

    /// @notice The minimum duration for an emergency freeze.
    uint256 public constant MINIMUM_FREEZE_PERIOD = 10 days;

    /// @notice The maximum duration for an emergency freeze.
    uint256 public constant MAXIMUM_FREEZE_PERIOD = 30 days;

    /// @notice The Franchiser implementation used to clone top-level Franchiser contracts.
    Franchiser public immutable franchiserImplementation;

    /// @notice The `votingToken` of the contract.
    /// @dev Should be the COMP token. Used for delegation and transfer of voting power.
    /// @return The `votingToken`.
    IERC20 public immutable votingToken;

    /// @notice The FranchiserPoolFactory that deployed and controls this pool.
    address public immutable factory;

    /// @notice The coordinator address authorized to delegate, recall, and reassign.
    address public coordinator;

    /// @notice The guardian address authorized to emergency-recall and freeze.
    address public guardian;

    /// @notice The maximum number of simultaneous top-level delegatees.
    uint256 public maxDelegatees;

    /// @notice The duration applied to future emergency freezes.
    uint256 public freezePeriod;

    /// @notice The timestamp until which coordinator actions are blocked.
    uint256 public frozenUntil;

    /// @dev The set of currently active top-level delegatees (i.e., those with a Franchiser that has a non-zero COMP balance).
    EnumerableSet.AddressSet private _activeDelegatees;

    /// @notice Checks that the caller is the factory that deployed this pool.
    /// @dev Reverts with NotFactory if the caller is not the factory.
    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory(msg.sender, factory);
        _;
    }

    /// @notice Checks that the caller is the coordinator.
    /// @dev Reverts with NotCoordinator if the caller is not the coordinator.
    modifier onlyCoordinator() {
        if (msg.sender != coordinator) revert NotCoordinator(msg.sender, coordinator);
        _;
    }

    /// @notice Checks that the caller is the guardian.
    /// @dev Reverts with NotGuardian if the caller is not the guardian.
    modifier onlyGuardian() {
        if (msg.sender != guardian) revert NotGuardian(msg.sender, guardian);
        _;
    }

    /// @notice Checks that the pool is not currently frozen.
    /// @dev Reverts with PoolFrozen if the current timestamp is less than `frozenUntil`.
    modifier whenNotFrozen() {
        if (block.timestamp < frozenUntil) revert PoolFrozen(frozenUntil);
        _;
    }

    /// @notice The constructor sets the `votingToken`, `coordinator`, `guardian`, `maxDelegatees`, and `freezePeriod`.
    /// @param votingToken_ The `votingToken` of the contract.
    /// @param coordinator_ The initial coordinator address.
    /// @param guardian_ The initial guardian address.
    /// @param maxDelegatees_ The maximum number of simultaneous top-level delegatees.
    /// @param freezePeriod_ The initial emergency freeze duration (>= MINIMUM_FREEZE_PERIOD).
    constructor(
        IERC20 votingToken_,
        address coordinator_,
        address guardian_,
        uint256 maxDelegatees_,
        uint256 freezePeriod_,
        address franchiserImplementation_
    ) {
        if (coordinator_ == address(0)) revert ZeroAddress();
        if (guardian_ == address(0)) revert ZeroAddress();
        if (coordinator_ == guardian_) revert CoordinatorGuardianCollision(coordinator_);

        if (maxDelegatees_ == 0) revert ZeroAmount();
        if (maxDelegatees_ > DELEGATEES_LIMIT)
            revert MaxDelegateesExceedsLimit(maxDelegatees_, DELEGATEES_LIMIT);

        if (freezePeriod_ < MINIMUM_FREEZE_PERIOD)
            revert FreezePeriodTooShort(freezePeriod_, MINIMUM_FREEZE_PERIOD);
        if (freezePeriod_ > MAXIMUM_FREEZE_PERIOD)
            revert FreezePeriodTooLong(freezePeriod_, MAXIMUM_FREEZE_PERIOD);

        factory = msg.sender;
        franchiserImplementation = Franchiser(franchiserImplementation_);
        votingToken = votingToken_;
        coordinator = coordinator_;
        guardian = guardian_;
        maxDelegatees = maxDelegatees_;
        freezePeriod = freezePeriod_;

        emit CoordinatorSet(address(0), coordinator_);
        emit GuardianSet(address(0), guardian_);
        emit MaxDelegateesSet(0, maxDelegatees_);
        emit FreezePeriodSet(0, freezePeriod_);
    }

    /// @notice Returns the current set of active top-level delegatee addresses.
    function activeDelegatees() external view returns (address[] memory) {
        return _activeDelegatees.values();
    }

    // -------------------------------------------------------------------------
    // Coordinator functions
    // -------------------------------------------------------------------------

    /// @notice Delegates `amount` of COMP from the pool to `delegatee`.
    /// @dev Clones and initializes a Franchiser on first use. Reverts if the
    ///      delegatee cap is reached when adding a new delegatee.
    function delegate(address delegatee, uint256 amount)
        external
        whenNotFrozen
    {
        if (msg.sender != coordinator && msg.sender != factory)
            revert NotCoordinatorOrFactory(msg.sender, coordinator, factory);

        if (delegatee == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        _delegate(delegatee, amount);
    }

    /// @notice Fully recalls one delegatee's COMP (including sub-delegatee subtree) back to the pool.
    function recall(address delegatee) external onlyCoordinator whenNotFrozen {
        _recallDelegate(delegatee);
    }

    /// @notice Recalls all COMP from `from` and delegates `amount` to `to` atomically.
    function reassign(address from, address to, uint256 amount)
        external
        onlyCoordinator
        whenNotFrozen
    {
        if (from == to) revert AddressCollision(from);
        if (from == address(0) || to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        _recallDelegate(from);
        _delegate(to, amount);
    }

    // -------------------------------------------------------------------------
    // Guardian functions
    // -------------------------------------------------------------------------

    /// @notice Recalls COMP from the specified delegatees back to the pool.
    function emergencyRecallDelegates(address[] calldata delegatees)
        external
        onlyGuardian
    {
        if (delegatees.length == 0) revert ZeroAmount();
        if (delegatees.length >= maxDelegatees)
            revert MaxDelegateesExceeded(delegatees.length, maxDelegatees);

        unchecked {
            for (uint256 i; i < delegatees.length; ++i) {
                _recallDelegate(delegatees[i]);
            }
        }
    }

    /// @notice Recalls all delegatees and freezes coordinator actions for `freezePeriod` seconds.
    function emergencyFreezeAndRecallPool() external onlyGuardian {
        _recallAll();
        _freeze();
    }

    /// @notice Freezes coordinator actions for `freezePeriod` seconds without recalling delegatees.
    function emergencyFreezePool() external onlyGuardian {
        _freeze();
    }

    // -------------------------------------------------------------------------
    // Factory-only functions
    // -------------------------------------------------------------------------

    /// @notice Recalls all delegatees and transfers the entire COMP balance to `recipient`.
    function halt(address recipient) external onlyFactory {
        if (recipient == address(0)) revert ZeroAddress();
        _recallAll();

        uint256 balance = votingToken.balanceOf(address(this));
        if (balance > 0) {
            votingToken.safeTransfer(recipient, balance);
        }

        emit Halted(recipient);
    }

    /// @notice Replaces the coordinator address immediately.
    function setCoordinator(address coordinator_) external onlyFactory {
        if (coordinator_ == address(0)) revert ZeroAddress();
        if (coordinator_ == guardian) revert CoordinatorGuardianCollision(coordinator_);
        if (coordinator_ == coordinator) revert AddressCollision(coordinator_);

        emit CoordinatorSet(coordinator, coordinator_);

        coordinator = coordinator_;
    }

    /// @notice Replaces the guardian address immediately.
    function setGuardian(address guardian_) external onlyFactory {
        if (guardian_ == address(0)) revert ZeroAddress();
        if (guardian_ == coordinator) revert CoordinatorGuardianCollision(guardian_);
        if (guardian_ == guardian) revert AddressCollision(guardian_);

        emit GuardianSet(guardian, guardian_);

        guardian = guardian_;
    }

    /// @notice Updates the maximum delegatee cap. Lowering does not recall anyone.
    function setMaxDelegatees(uint256 maxDelegatees_) external onlyFactory {
        if (maxDelegatees_ == 0) revert ZeroAmount();
        if (maxDelegatees_ > DELEGATEES_LIMIT)
            revert MaxDelegateesExceedsLimit(maxDelegatees_, DELEGATEES_LIMIT);

        if (maxDelegatees_ == maxDelegatees) revert SameValue(maxDelegatees_);

        emit MaxDelegateesSet(maxDelegatees, maxDelegatees_);

        maxDelegatees = maxDelegatees_;
    }

    /// @notice Updates the freeze period applied to future emergency freezes.
    /// @dev Reverts if `freezePeriod_` is below `MINIMUM_FREEZE_PERIOD` or above `MAXIMUM_FREEZE_PERIOD`.
    function setFreezePeriod(uint256 freezePeriod_) external onlyFactory {
        if (freezePeriod_ < MINIMUM_FREEZE_PERIOD)
            revert FreezePeriodTooShort(freezePeriod_, MINIMUM_FREEZE_PERIOD);

        if (freezePeriod_ > MAXIMUM_FREEZE_PERIOD)
            revert FreezePeriodTooLong(freezePeriod_, MAXIMUM_FREEZE_PERIOD);

        if (freezePeriod_ == freezePeriod) revert SameValue(freezePeriod_);

        emit FreezePeriodSet(freezePeriod, freezePeriod_);
        freezePeriod = freezePeriod_;
    }

    /// @notice Lifts an active freeze early, re-enabling coordinator actions.
    function unfreeze() external onlyFactory {
        if (block.timestamp >= frozenUntil) revert PoolNotFrozen();
        frozenUntil = 0;
        emit PoolUnfrozen();
    }

    /// @notice Returns the deterministic Franchiser address for a given delegatee.
    /// @dev The contract may or may not be deployed yet.
    function getFranchiser(address delegatee) public view returns (Franchiser) {
        return Franchiser(
            address(franchiserImplementation).predictDeterministicAddress(
                bytes20(delegatee),
                address(this)
            )
        );
    }

    /// @notice Internal function to delegate `amount` of COMP to `delegatee`, adding them as an active delegatee if needed.
    /// @param delegatee The address to delegate to.
    /// @param amount The amount of COMP to delegate.
    function _delegate(address delegatee, uint256 amount) internal {
        Franchiser franchiser = getFranchiser(delegatee);

        if (!_activeDelegatees.contains(delegatee)) {
            if (_activeDelegatees.length() >= maxDelegatees)
                revert MaxDelegateesExceeded(_activeDelegatees.length(), maxDelegatees);

            if (address(franchiser).code.length == 0) {
                address(franchiserImplementation).cloneDeterministic(bytes20(delegatee));
                franchiser.initialize(address(this), delegatee, INITIAL_MAXIMUM_SUBDELEGATEES);
            }

            _activeDelegatees.add(delegatee);
            emit DelegateeActivated(delegatee);
        }

        votingToken.safeTransfer(address(franchiser), amount);

        emit Delegated(delegatee, amount);
    }

    /// @notice Internal function to recall all COMP from `delegatee` and their sub-delegatees, removing them as an active delegatee if they had any COMP to recall.
    /// @param delegatee The address to recall from.
    function _recallDelegate(address delegatee) internal {
        bool wasActive = _activeDelegatees.remove(delegatee);

        Franchiser franchiser = getFranchiser(delegatee);

        if (address(franchiser).code.length > 0) {
            franchiser.recall(address(this));
        }

        if (wasActive) emit DelegateeDeactivated(delegatee);
    }

    /// @notice Internal function to recall all COMP from all active delegatees and their sub-delegatees.
    function _recallAll() internal {
        uint256 n = _activeDelegatees.length();
        while (n != 0) {
            unchecked {
                _recallDelegate(_activeDelegatees.at(--n));
            }
        }
    }

    function _freeze() internal {
        uint256 until = block.timestamp + freezePeriod;
        frozenUntil = until;

        emit EmergencyFreeze(until);
    }
}
