// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.20;

import { IFranchiserPool } from "./interfaces/FranchiserPool/IFranchiserPool.sol";
import { FranchiserImmutableState } from "./base/FranchiserImmutableState.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IVotingToken } from "./interfaces/IVotingToken.sol";
import { Franchiser } from "./Franchiser.sol";

/// @notice Manages a pool of idle COMP and distributes it to top-level delegatees via
///         Franchiser instances. Deployed and controlled by FranchiserPoolFactory on
///         behalf of Governance. The Coordinator manages delegations; the Guardian
///         provides emergency recall and freeze capabilities.
contract FranchiserPool is IFranchiserPool, FranchiserImmutableState {
    using Clones for address;
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;

    /// @inheritdoc IFranchiserPool
    uint96 public constant INITIAL_MAXIMUM_SUBDELEGATEES = 1;

    /// @inheritdoc IFranchiserPool
    uint256 public constant MINIMUM_FREEZE_PERIOD = 10 days;

    /// @inheritdoc IFranchiserPool
    Franchiser public immutable franchiserImplementation;

    /// @inheritdoc IFranchiserPool
    address public immutable factory;

    /// @inheritdoc IFranchiserPool
    address public coordinator;

    /// @inheritdoc IFranchiserPool
    address public guardian;

    /// @inheritdoc IFranchiserPool
    uint256 public maxDelegatees;

    /// @inheritdoc IFranchiserPool
    uint256 public freezePeriod;

    /// @inheritdoc IFranchiserPool
    uint256 public frozenUntil;

    EnumerableSet.AddressSet private _activeDelegatees;

    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory(msg.sender, factory);
        _;
    }

    modifier onlyCoordinator() {
        if (msg.sender != coordinator) revert NotCoordinator(msg.sender, coordinator);
        _;
    }

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert NotGuardian(msg.sender, guardian);
        _;
    }

    modifier whenNotFrozen() {
        if (block.timestamp < frozenUntil) revert PoolFrozen(frozenUntil);
        _;
    }

    constructor(
        IVotingToken votingToken_,
        address coordinator_,
        address guardian_,
        uint256 maxDelegatees_,
        uint256 freezePeriod_
    ) FranchiserImmutableState(votingToken_) {
        if (freezePeriod_ < MINIMUM_FREEZE_PERIOD)
            revert FreezePeriodTooShort(freezePeriod_, MINIMUM_FREEZE_PERIOD);
        factory = msg.sender;
        franchiserImplementation = new Franchiser(votingToken_);
        coordinator = coordinator_;
        guardian = guardian_;
        maxDelegatees = maxDelegatees_;
        freezePeriod = freezePeriod_;
        emit CoordinatorSet(address(0), coordinator_);
        emit GuardianSet(address(0), guardian_);
        emit MaxDelegateesSet(0, maxDelegatees_);
        emit FreezePeriodSet(0, freezePeriod_);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @inheritdoc IFranchiserPool
    function activeDelegatees() external view returns (address[] memory) {
        return _activeDelegatees.values();
    }

    /// @inheritdoc IFranchiserPool
    function getFranchiser(address delegatee) public view returns (Franchiser) {
        return Franchiser(
            address(franchiserImplementation).predictDeterministicAddress(
                bytes20(delegatee),
                address(this)
            )
        );
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    function _delegate(address delegatee, uint256 amount) private {
        Franchiser franchiser = getFranchiser(delegatee);

        if (!_activeDelegatees.contains(delegatee)) {
            if (_activeDelegatees.length() >= maxDelegatees)
                revert MaxDelegateesReached(maxDelegatees);

            assert(_activeDelegatees.add(delegatee));

            if (address(franchiser).code.length == 0) {
                address(franchiserImplementation).cloneDeterministic(bytes20(delegatee));
                franchiser.initialize(address(this), delegatee, INITIAL_MAXIMUM_SUBDELEGATEES);
            }

            emit DelegateeActivated(delegatee);
        }

        IERC20(address(votingToken)).safeTransfer(address(franchiser), amount);

        emit Delegated(delegatee, amount);
    }

    function _recallDelegatee(address delegatee) private {
        bool wasActive = _activeDelegatees.remove(delegatee);

        Franchiser franchiser = getFranchiser(delegatee);

        if (address(franchiser).code.length > 0) {
            franchiser.recall(address(this));
        }

        if (wasActive) emit DelegateeDeactivated(delegatee);
    }

    function _recallAll() private {
        uint256 n = _activeDelegatees.length();
        while (n != 0) {
            unchecked {
                _recallDelegatee(_activeDelegatees.at(--n));
            }
        }
    }

    // -------------------------------------------------------------------------
    // Coordinator functions
    // -------------------------------------------------------------------------

    /// @inheritdoc IFranchiserPool
    function delegate(address delegatee, uint256 amount)
        external
        onlyCoordinator
        whenNotFrozen
    {
        _delegate(delegatee, amount);
    }

    /// @inheritdoc IFranchiserPool
    function recall(address delegatee) external onlyCoordinator whenNotFrozen {
        _recallDelegatee(delegatee);
    }

    /// @inheritdoc IFranchiserPool
    function reassign(address from, address to, uint256 amount)
        external
        onlyCoordinator
        whenNotFrozen
    {
        _recallDelegatee(from);
        _delegate(to, amount);
    }

    // -------------------------------------------------------------------------
    // Guardian functions
    // -------------------------------------------------------------------------

    /// @inheritdoc IFranchiserPool
    function emergencyRecallDelegatees(address[] calldata delegatees)
        external
        onlyGuardian
    {
        unchecked {
            for (uint256 i = 0; i < delegatees.length; i++) {
                _recallDelegatee(delegatees[i]);
            }
        }
    }

    /// @inheritdoc IFranchiserPool
    function emergencyFreezeAndRecallPool() external onlyGuardian {
        _recallAll();
        uint256 until = block.timestamp + freezePeriod;
        frozenUntil = until;

        emit EmergencyFreeze(until);
    }

    /// @inheritdoc IFranchiserPool
    function emergencyFreezePool() external onlyGuardian {
        uint256 until = block.timestamp + freezePeriod;
        frozenUntil = until;

        emit EmergencyFreeze(until);
    }

    // -------------------------------------------------------------------------
    // Factory-only functions
    // -------------------------------------------------------------------------

    /// @inheritdoc IFranchiserPool
    function halt(address recipient) external onlyFactory {
        _recallAll();
        uint256 balance = votingToken.balanceOf(address(this));
        if (balance > 0) {
            IERC20(address(votingToken)).safeTransfer(recipient, balance);
        }

        emit Halted(recipient);
    }

    /// @inheritdoc IFranchiserPool
    function setCoordinator(address coordinator_) external onlyFactory {
        emit CoordinatorSet(coordinator, coordinator_);

        coordinator = coordinator_;
    }

    /// @inheritdoc IFranchiserPool
    function setGuardian(address guardian_) external onlyFactory {
        emit GuardianSet(guardian, guardian_);

        guardian = guardian_;
    }

    /// @inheritdoc IFranchiserPool
    function setMaxDelegatees(uint256 maxDelegatees_) external onlyFactory {
        emit MaxDelegateesSet(maxDelegatees, maxDelegatees_);

        maxDelegatees = maxDelegatees_;
    }

    /// @inheritdoc IFranchiserPool
    function setFreezePeriod(uint256 freezePeriod_) external onlyFactory {
        if (freezePeriod_ < MINIMUM_FREEZE_PERIOD)
            revert FreezePeriodTooShort(freezePeriod_, MINIMUM_FREEZE_PERIOD);

        emit FreezePeriodSet(freezePeriod, freezePeriod_);
        freezePeriod = freezePeriod_;
    }

    /// @inheritdoc IFranchiserPool
    function unfreeze() external onlyFactory {
        frozenUntil = 0;
        emit PoolUnfrozen();
    }
}
