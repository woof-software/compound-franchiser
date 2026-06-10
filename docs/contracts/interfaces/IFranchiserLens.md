# IFranchiserLens

## Overview

#### License: GPL-3.0-or-later

```solidity
interface IFranchiserLens is IFranchiserImmutableState
```


## Structs info

### Delegation

```solidity
struct Delegation {
	address delegator;
	address delegatee;
	Franchiser franchiser;
}
```



Parameters:

| Name       | Type                | Description       |
| :--------- | :------------------ | :---------------- |
| delegator  | address             | The `delegator`.  |
| delegatee  | address             | The `delegatee`.  |
| franchiser | contract Franchiser | The `franchiser`. |

### DelegationWithVotes

```solidity
struct DelegationWithVotes {
	address delegator;
	address delegatee;
	Franchiser franchiser;
	uint256 votes;
}
```



Parameters:

| Name       | Type                | Description                                          |
| :--------- | :------------------ | :--------------------------------------------------- |
| delegator  | address             | The `delegator`.                                     |
| delegatee  | address             | The `delegatee`.                                     |
| franchiser | contract Franchiser | The `franchiser`.                                    |
| votes      | uint256             | The voting power currently held in the `franchiser`. |

## Functions info

### franchiserFactory (0xf3dc336b)

```solidity
function franchiserFactory() external returns (FranchiserFactory)
```

The deployed `franchiserFactory`.


Return values:

| Name | Type                       | Description              |
| :--- | :------------------------- | :----------------------- |
| [0]  | contract FranchiserFactory | The `franchiserFactory`. |

### getRootDelegation (0x71456623)

```solidity
function getRootDelegation(
    Franchiser franchiser
) external view returns (IFranchiserLens.Delegation memory delegation)
```

Gets the root delegation for any nested franchiser.


Parameters:

| Name       | Type                | Description        |
| :--------- | :------------------ | :----------------- |
| franchiser | contract Franchiser | The `franchiser`.  |


Return values:

| Name       | Type                              | Description            |
| :--------- | :-------------------------------- | :--------------------- |
| delegation | struct IFranchiserLens.Delegation | The root `delegation`. |

### getVerticalDelegations (0x97f2c53d)

```solidity
function getVerticalDelegations(
    Franchiser franchiser
) external view returns (IFranchiserLens.Delegation[] memory delegations)
```

Gets all vertical delegations starting from `franchiser`.


Parameters:

| Name       | Type                | Description        |
| :--------- | :------------------ | :----------------- |
| franchiser | contract Franchiser | The `franchiser`.  |


Return values:

| Name        | Type                                | Description                                                                   |
| :---------- | :---------------------------------- | :---------------------------------------------------------------------------- |
| delegations | struct IFranchiserLens.Delegation[] | The chained `delegations`, starting from `franchiser` and ending at the root. |

### getHorizontalDelegations (0xdf5fc105)

```solidity
function getHorizontalDelegations(
    Franchiser franchiser
) external view returns (IFranchiserLens.Delegation[] memory delegations)
```

Gets all horizontal delegations of `franchiser`.


Parameters:

| Name       | Type                | Description        |
| :--------- | :------------------ | :----------------- |
| franchiser | contract Franchiser | The `franchiser`.  |


Return values:

| Name        | Type                                | Description                   |
| :---------- | :---------------------------------- | :---------------------------- |
| delegations | struct IFranchiserLens.Delegation[] | The descendant `delegations`. |

### getAllDelegations (0x08ecd5c0)

```solidity
function getAllDelegations(
    Franchiser franchiser
)
    external
    view
    returns (
        IFranchiserLens.DelegationWithVotes[][] memory delegationsWithVotes
    )
```

Gets the entire delegation tree containing the `franchiser`.


Parameters:

| Name       | Type                | Description        |
| :--------- | :------------------ | :----------------- |
| franchiser | contract Franchiser | The `franchiser`.  |


Return values:

| Name                 | Type                                           | Description                 |
| :------------------- | :--------------------------------------------- | :-------------------------- |
| delegationsWithVotes | struct IFranchiserLens.DelegationWithVotes[][] | The `delegationsWithVotes`. |

### getAllDelegations (0x1cad183c)

```solidity
function getAllDelegations(
    address owner,
    address delegatee
)
    external
    view
    returns (
        IFranchiserLens.DelegationWithVotes[][] memory delegationsWithVotes
    )
```

Calls getAllDelegations with the franchiser associated with `owner` and `delegatee`.


Parameters:

| Name      | Type    | Description       |
| :-------- | :------ | :---------------- |
| owner     | address | The `owner`.      |
| delegatee | address | The `delegatee`.  |


Return values:

| Name                 | Type                                           | Description                 |
| :------------------- | :--------------------------------------------- | :-------------------------- |
| delegationsWithVotes | struct IFranchiserLens.DelegationWithVotes[][] | The `delegationsWithVotes`. |
