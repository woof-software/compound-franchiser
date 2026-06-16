# Franchiser

## Overview

#### License: GPL-3.0-or-later

```solidity
contract Franchiser is IFranchiserErrors, IFranchiserEvents, Ownable
```

Author: WOOF! Software

This contract allows for the delegation of voting tokens in a recursive manner,
enabling complex delegation hierarchies.
security-contact: dmitriy@woof.software

## Constants info

### DECAY_FACTOR (0xe08eae5f)

```solidity
uint96 constant DECAY_FACTOR = 2
```

The value responsible for decaying `maximumSubDelegatees`.

At each nesting level, `maximumSubDelegatees` is divided by this factor.


Return values:

| Name | Type | Description |
| :--- | :--- | :---------- |


## State variables info

### franchiserImplementation (0xc61bdcd2)

```solidity
contract Franchiser immutable franchiserImplementation
```

The implementation contract used to clone Franchiser contracts.

Used as part of an EIP-1167 proxy minimal proxy setup.


Return values:

| Name | Type | Description |
| :--- | :--- | :---------- |


### votingToken (0xb0340123)

```solidity
contract IVotingToken immutable votingToken
```

The `votingToken` of the contract.


Return values:

| Name | Type | Description |
| :--- | :--- | :---------- |


### delegatee (0x1e31d053)

```solidity
address delegatee
```

The `delegatee` of the contract.

Never changes after being set via initialize.
Packed with `maximumSubDelegatees`.


Return values:

| Name | Type | Description |
| :--- | :--- | :---------- |


### maximumSubDelegatees (0x1ba8d97c)

```solidity
uint96 maximumSubDelegatees
```

The maximum number of `subDelegatee` addresses that the contract
can have at any one time.

Never changes after being set via initialize.
Packed with `delegatee`.


Return values:

| Name | Type | Description |
| :--- | :--- | :---------- |


## Modifiers info

### onlyDelegatee

```solidity
modifier onlyDelegatee()
```

Reverts if called by any account other than the `delegatee`.
## Functions info

### constructor

```solidity
constructor(IVotingToken votingToken_) Ownable(msg.sender)
```

The constructor sets the `votingToken` and the `franchiserImplementation`.


Parameters:

| Name         | Type                  | Description                        |
| :----------- | :-------------------- | :--------------------------------- |
| votingToken_ | contract IVotingToken | The `votingToken` of the contract. |

### initialize (0xc861c250)

```solidity
function initialize(
    address delegator_,
    address delegatee_,
    uint96 maximumSubDelegatees_
) public
```

Can be called once to set the contract's `delegator`, `owner`,
`delegatee`, and `maximumSubDelegatees`.

The `owner` is always the sender of the call.


Parameters:

| Name                  | Type    | Description                                     |
| :-------------------- | :------ | :---------------------------------------------- |
| delegator_            | address | The `delegator`.                                |
| delegatee_            | address | The `delegatee`.                                |
| maximumSubDelegatees_ | uint96  | The maximum number of `subDelegatee` addresses. |

### initialize (0xf2a41374)

```solidity
function initialize(address delegatee_, uint96 maximumSubDelegatees_) external
```

Calls initialize with `delegator` set to address(0).

Used for all Franchiser initialization beyond the first level of nesting.


Parameters:

| Name                  | Type    | Description                                     |
| :-------------------- | :------ | :---------------------------------------------- |
| delegatee_            | address | The `delegatee`.                                |
| maximumSubDelegatees_ | uint96  | The maximum number of `subDelegatee` addresses. |

### delegator (0xce9b7930)

```solidity
function delegator() public view returns (address)
```

The address that delegated tokens to this address.

Is derived from the `delegatee` of the `owner`, except for
direct descendants of the FranchiserFactory.
Never changes after being set via initialize.


Return values:

| Name | Type    | Description     |
| :--- | :------ | :-------------- |
| [0]  | address | The `delegator` |

### subDelegatees (0xd1ddf4ef)

```solidity
function subDelegatees() external view returns (address[] memory)
```

The list of current `subDelegatee` addresses.


Return values:

| Name | Type      | Description                           |
| :--- | :-------- | :------------------------------------ |
| [0]  | address[] | The current `subDelegatee` addresses. |

### getFranchiser (0x78b440ac)

```solidity
function getFranchiser(address subDelegatee) public view returns (Franchiser)
```

Looks up the Franchiser associated with the `subDelegatee`.

Returns the address of the Franchiser even it it does not yet exist,
thanks to CREATE2.


Parameters:

| Name         | Type    | Description                 |
| :----------- | :------ | :-------------------------- |
| subDelegatee | address | The target `subDelegatee`.  |


Return values:

| Name | Type                | Description                                                       |
| :--- | :------------------ | :---------------------------------------------------------------- |
| [0]  | contract Franchiser | franchiser The Franchiser contract, whether or not it exists yet. |

### subDelegate (0x5c292778)

```solidity
function subDelegate(
    address subDelegatee,
    uint256 amount
) public onlyDelegatee returns (Franchiser franchiser)
```

Delegates `amount` of `votingToken` to `subDelegatee`.

Can only be called by the `delegatee`. The Franchiser associated
with the `subDelegatee` must not already be active.


Parameters:

| Name         | Type    | Description                                  |
| :----------- | :------ | :------------------------------------------- |
| subDelegatee | address | The address that will receive voting power.  |
| amount       | uint256 | The amount of voting power.                  |


Return values:

| Name       | Type                | Description              |
| :--------- | :------------------ | :----------------------- |
| franchiser | contract Franchiser | The Franchiser contract. |

### subDelegateMany (0x68afe2b7)

```solidity
function subDelegateMany(
    address[] calldata subDelegatees_,
    uint256[] calldata amounts
) external returns (Franchiser[] memory franchisers)
```

Calls subDelegate many times.


Parameters:

| Name           | Type      | Description                                    |
| :------------- | :-------- | :--------------------------------------------- |
| subDelegatees_ | address[] | The addresses that will receive voting power.  |
| amounts        | uint256[] | The amounts of voting power.                   |


Return values:

| Name        | Type                  | Description               |
| :---------- | :-------------------- | :------------------------ |
| franchisers | contract Franchiser[] | The Franchiser contracts. |

### unSubDelegate (0x01ce3e9d)

```solidity
function unSubDelegate(address subDelegatee) external onlyDelegatee
```

Un-delegates to `subDelegatee`.

Can only be called by the `delegatee`. No-op if the Franchiser associated
with the `subDelegatee` does not exist, or the address is not a `subDelegatee`.


Parameters:

| Name         | Type    | Description                                         |
| :----------- | :------ | :-------------------------------------------------- |
| subDelegatee | address | The address that voting power will be removed from. |

### unSubDelegateMany (0xc5546c3f)

```solidity
function unSubDelegateMany(
    address[] calldata subDelegatees_
) external onlyDelegatee
```

Calls unSubDelegate many times.


Parameters:

| Name           | Type      | Description                                           |
| :------------- | :-------- | :---------------------------------------------------- |
| subDelegatees_ | address[] | The addresses that voting power will be removed from. |

### recall (0xca430519)

```solidity
function recall(address to) external onlyOwner
```

Transfers the contract's balance of `votingToken`, as well as the balance
of all nested Franchiser contracts associated with each `subDelegatee`, to `to`.

Can only be called by the `owner`.


Parameters:

| Name | Type    | Description                           |
| :--- | :------ | :------------------------------------ |
| to   | address | The address that will receive tokens. |
