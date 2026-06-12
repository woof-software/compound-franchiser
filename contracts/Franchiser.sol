// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.30;

import { IFranchiser } from "./interfaces/Franchiser/IFranchiser.sol";
import { FranchiserImmutableState } from "./base/FranchiserImmutableState.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IVotingToken } from "./interfaces/IVotingToken.sol";

contract Franchiser is IFranchiser, FranchiserImmutableState, Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using Clones for address;
    using SafeERC20 for IERC20;

    /// @inheritdoc IFranchiser
    uint96 public constant DECAY_FACTOR = 2;

    /// @inheritdoc IFranchiser
    Franchiser public immutable franchiserImplementation;

    address private _delegator;
    /// @inheritdoc IFranchiser
    address public delegatee;
    /// @inheritdoc IFranchiser
    uint96 public maximumSubDelegatees;

    EnumerableSet.AddressSet private _subDelegatees;

    /// @inheritdoc IFranchiser
    function delegator() public view returns (address) {
        // if a delegator has explicitly been set, return it
        if (_delegator != address(0)) return _delegator;
        // otherwise, look it up from the owner
        else if (owner() != address(0)) return Franchiser(owner()).delegatee();
        // return 0 in the implementation contract
        return address(0);
    }

    /// @inheritdoc IFranchiser
    function subDelegatees() external view returns (address[] memory) {
        return _subDelegatees.values();
    }

    /// @dev Reverts if called by any account other than the `delegatee`.
    modifier onlyDelegatee() {
        if (msg.sender != delegatee) revert NotDelegatee(msg.sender, delegatee);
        _;
    }

    constructor(IVotingToken votingToken_)
        FranchiserImmutableState(votingToken_)
        Ownable(msg.sender)
    {
        franchiserImplementation = Franchiser(address(this));
        // this borks the implementation contract as desired,
        // new instances should be cloned.
        delegatee = address(1);
    }

    /// @inheritdoc IFranchiser
    function initialize(
        address delegator_,
        address delegatee_,
        uint96 maximumSubDelegatees_
    ) public {
        // the following two conditions, along with the fact
        // that delegatee is only set below (outside of the constructor),
        // ensures that initialize can only be called once in clones
        if (delegatee_ == address(0)) revert NoDelegatee();
        if (delegatee != address(0)) revert AlreadyInitialized();

        _transferOwnership(msg.sender);
        // only store the delegator if necessary
        if (delegator_ != address(0)) _delegator = delegator_;
        delegatee = delegatee_;
        maximumSubDelegatees = maximumSubDelegatees_;
        votingToken.delegate(delegatee_);
        emit Initialized(
            msg.sender,
            // ensure that we return the delegator consistently
            delegator(),
            delegatee_,
            maximumSubDelegatees_
        );
    }

    /// @inheritdoc IFranchiser
    function initialize(address delegatee_, uint96 maximumSubDelegatees_)
        external
    {
        initialize(address(0), delegatee_, maximumSubDelegatees_);
    }

    function getSalt(address subDelegatee) private pure returns (bytes32) {
        return bytes20(subDelegatee);
    }

    /// @inheritdoc IFranchiser
    function getFranchiser(address subDelegatee)
        public
        view
        returns (Franchiser)
    {
        return
            Franchiser(
                address(franchiserImplementation).predictDeterministicAddress(
                    getSalt(subDelegatee),
                    address(this)
                )
            );
    }

    /// @inheritdoc IFranchiser
    function subDelegate(address subDelegatee, uint256 amount)
        public
        onlyDelegatee
        returns (Franchiser franchiser)
    {
        franchiser = getFranchiser(subDelegatee);
        if (!_subDelegatees.contains(subDelegatee)) {
            if (_subDelegatees.length() == maximumSubDelegatees)
                revert CannotExceedMaximumSubDelegatees(maximumSubDelegatees);
            assert(_subDelegatees.add(subDelegatee));
            if (address(franchiser).code.length == 0) {
                // deploy a new contract if necessary
                address(franchiserImplementation).cloneDeterministic(
                    getSalt(subDelegatee)
                );
                franchiser.initialize(
                    subDelegatee,
                    maximumSubDelegatees / DECAY_FACTOR
                );
            }
            emit SubDelegateeActivated(subDelegatee);
        }
        IERC20(address(votingToken)).safeTransfer(address(franchiser), amount);
    }

    /// @inheritdoc IFranchiser
    function subDelegateMany(
        address[] calldata subDelegatees_,
        uint256[] calldata amounts
    ) external returns (Franchiser[] memory franchisers) {
        if (subDelegatees_.length != amounts.length)
            revert ArrayLengthMismatch(subDelegatees_.length, amounts.length);

        franchisers = new Franchiser[](subDelegatees_.length);
        unchecked {
            for (uint256 i = 0; i < subDelegatees_.length; i++)
                franchisers[i] = subDelegate(subDelegatees_[i], amounts[i]);
        }
    }

    /// @inheritdoc IFranchiser
    function unSubDelegate(address subDelegatee) external onlyDelegatee {
        _unSubDelegate(subDelegatee, false);
    }

    /// @dev Must only set assumeExistence to true when the subDelegatee exists
    ///      and is already a subDelegatee. This saves gas in recall.
    function _unSubDelegate(address subDelegatee, bool assumeExistence)
        private
    {
        Franchiser franchiser = getFranchiser(subDelegatee);
        if (assumeExistence || _subDelegatees.contains(subDelegatee)) {
            assert(_subDelegatees.remove(subDelegatee));
            franchiser.recall(address(this));
            emit SubDelegateeDeactivated(subDelegatee);
        }
        // this condition can only be reached if unSubDelegate is called with a subDelegatee
        // that has a franchiser contract but isn't currently active - when this is the case,
        // calling recall is a no-op if the franchiser doesn't have tokens, so it's fine,
        // but in the very odd case that the franchiser has received voting tokens out of
        // band, this will retrieve them silently, which is also fine
        else if (address(franchiser).code.length > 0)
            franchiser.recall(address(this));
    }

    /// @inheritdoc IFranchiser
    function unSubDelegateMany(address[] calldata subDelegatees_)
        external
        onlyDelegatee
    {
        unchecked {
            for (uint256 i = 0; i < subDelegatees_.length; i++)
                _unSubDelegate(subDelegatees_[i], false);
        }
    }

    /// @inheritdoc IFranchiser
    function recall(address to) external onlyOwner {
        uint256 numberOfSubDelegatees = _subDelegatees.length();
        while (numberOfSubDelegatees != 0) {
            unchecked {
                _unSubDelegate(
                    // ordering isn't consistent across removals, but this works
                    _subDelegatees.at(--numberOfSubDelegatees),
                    true
                );
            }
        }
        IERC20(address(votingToken)).safeTransfer(
            to,
            votingToken.balanceOf(address(this))
        );
    }
}
