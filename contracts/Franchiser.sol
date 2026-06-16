// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.35;

import { IFranchiserErrors } from "./interfaces/Franchiser/IFranchiserErrors.sol";
import { IFranchiserEvents } from "./interfaces/Franchiser/IFranchiserEvents.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IVotingToken } from "./interfaces/IVotingToken.sol";

/**
 * @title Franchiser contract for recursive delegation of voting tokens.
 * @author Woof
 * @custom:security-contact dmitriy@woof.software
 * @notice This contract allows for the delegation of voting tokens in a recursive manner,
 *         enabling complex delegation hierarchies.
 */
contract Franchiser is IFranchiserErrors, IFranchiserEvents, Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using Clones for address;
    using SafeERC20 for IERC20;

    /// @notice The value responsible for decaying `maximumSubDelegatees`.
    /// @dev At each nesting level, `maximumSubDelegatees` is divided by this factor.
    /// @return The `DECAY_FACTOR`.
    uint96 public constant DECAY_FACTOR = 2;

    /// @notice The implementation contract used to clone Franchiser contracts.
    /// @dev Used as part of an EIP-1167 proxy minimal proxy setup.
    /// @return The Franchiser implementation contract.
    Franchiser public immutable franchiserImplementation;

    /// @notice The `votingToken` of the contract.
    /// @dev Should be the COMP token. Used for delegation and transfer of voting power.
    /// @return The `votingToken`.
    IVotingToken public immutable votingToken;

    address private _delegator;

    /// @notice The `delegatee` of the contract.
    /// @dev Never changes after being set via initialize.
    ///      Packed with `maximumSubDelegatees`.
    /// @return The `delegatee`.
    address public delegatee;

    /// @notice The maximum number of `subDelegatee` addresses that the contract
    ///         can have at any one time.
    /// @dev Never changes after being set via initialize.
    ///      Packed with `delegatee`.
    /// @return The maximum number of `subDelegatee` addresses.
    uint96 public maximumSubDelegatees;

    EnumerableSet.AddressSet private _subDelegatees;

    /// @dev Reverts if called by any account other than the `delegatee`.
    modifier onlyDelegatee() {
        if (msg.sender != delegatee) revert NotDelegatee(msg.sender, delegatee);
        _;
    }

    /// @notice The constructor sets the `votingToken` and the `franchiserImplementation`.
    /// @param votingToken_ The `votingToken` of the contract.
    constructor(IVotingToken votingToken_)
        Ownable(msg.sender)
    {
        votingToken = votingToken_;
        franchiserImplementation = Franchiser(address(this));
        // this sets the implementation contract as desired,
        // new instances should be cloned.
        delegatee = address(1);
    }

    /// @notice Can be called once to set the contract's `delegator`, `owner`,
    ///         `delegatee`, and `maximumSubDelegatees`.
    /// @dev The `owner` is always the sender of the call.
    /// @param delegator_ The `delegator`.
    /// @param delegatee_ The `delegatee`.
    /// @param maximumSubDelegatees_ The maximum number of `subDelegatee` addresses.
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

    /// @notice Calls initialize with `delegator` set to address(0).
    /// @dev Used for all Franchiser initialization beyond the first level of nesting.
    /// @param delegatee_ The `delegatee`.
    /// @param maximumSubDelegatees_ The maximum number of `subDelegatee` addresses.
    function initialize(address delegatee_, uint96 maximumSubDelegatees_)
        external
    {
        initialize(address(0), delegatee_, maximumSubDelegatees_);
    }

    /// @notice The address that delegated tokens to this address.
    /// @dev Is derived from the `delegatee` of the `owner`, except for
    ///      direct descendants of the FranchiserFactory.
    ///      Never changes after being set via initialize.
    /// @return The `delegator`
    function delegator() public view returns (address) {
        // if a delegator has explicitly been set, return it
        if (_delegator != address(0)) return _delegator;
        // otherwise, look it up from the owner
        else if (owner() != address(0)) return Franchiser(owner()).delegatee();
        // return 0 in the implementation contract
        return address(0);
    }

    /// @notice The list of current `subDelegatee` addresses.
    /// @return The current `subDelegatee` addresses.
    function subDelegatees() external view returns (address[] memory) {
        return _subDelegatees.values();
    }

    function getSalt(address subDelegatee) private pure returns (bytes32) {
        return bytes20(subDelegatee);
    }

    /// @notice Looks up the Franchiser associated with the `subDelegatee`.
    /// @dev Returns the address of the Franchiser even it it does not yet exist,
    ///      thanks to CREATE2.
    /// @param subDelegatee The target `subDelegatee`.
    /// @return franchiser The Franchiser contract, whether or not it exists yet.
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

    /// @notice Delegates `amount` of `votingToken` to `subDelegatee`.
    /// @dev Can only be called by the `delegatee`. The Franchiser associated
    ///      with the `subDelegatee` must not already be active.
    /// @param subDelegatee The address that will receive voting power.
    /// @param amount The amount of voting power.
    /// @return franchiser The Franchiser contract.
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

    /// @notice Calls subDelegate many times.
    /// @param subDelegatees_ The addresses that will receive voting power.
    /// @param amounts The amounts of voting power.
    /// @return franchisers The Franchiser contracts.
    function subDelegateMany(
        address[] calldata subDelegatees_,
        uint256[] calldata amounts
    ) external returns (Franchiser[] memory franchisers) {
        if (subDelegatees_.length != amounts.length)
            revert ArrayLengthMismatch(subDelegatees_.length, amounts.length);

        franchisers = new Franchiser[](subDelegatees_.length);
        unchecked {
            for (uint256 i; i < subDelegatees_.length; ++i)
                franchisers[i] = subDelegate(subDelegatees_[i], amounts[i]);
        }
    }

    /// @notice Un-delegates to `subDelegatee`.
    /// @dev Can only be called by the `delegatee`. No-op if the Franchiser associated
    ///      with the `subDelegatee` does not exist, or the address is not a `subDelegatee`.
    /// @param subDelegatee The address that voting power will be removed from.
    function unSubDelegate(address subDelegatee) external onlyDelegatee {
        _unSubDelegate(subDelegatee, false);
    }

    /// @notice Calls unSubDelegate many times.
    /// @param subDelegatees_ The addresses that voting power will be removed from.
    function unSubDelegateMany(address[] calldata subDelegatees_)
        external
        onlyDelegatee
    {
        unchecked {
            for (uint256 i; i < subDelegatees_.length; ++i)
                _unSubDelegate(subDelegatees_[i], false);
        }
    }

    /// @notice Transfers the contract's balance of `votingToken`, as well as the balance
    ///         of all nested Franchiser contracts associated with each `subDelegatee`, to `to`.
    /// @dev Can only be called by the `owner`.
    /// @param to The address that will receive tokens.
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

    /// @dev Must only set assumeExistence to true when the subDelegatee exists
    ///      and is already a subDelegatee. This saves gas in recall.
    function _unSubDelegate(address subDelegatee, bool assumeExistence)
        internal
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
}
