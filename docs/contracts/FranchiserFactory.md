# FranchiserFactory

## Overview

#### License: GPL-3.0-or-later

```solidity
contract FranchiserFactory is IFranchiserFactory, FranchiserImmutableState
```


## Constants info

### INITIAL_MAXIMUM_SUBDELEGATEES (0xe95c4d36)

```solidity
uint96 constant INITIAL_MAXIMUM_SUBDELEGATEES = 1
```


## State variables info

### franchiserImplementation (0xc61bdcd2)

```solidity
contract Franchiser immutable franchiserImplementation
```


## Functions info

### constructor

```solidity
constructor(IVotingToken votingToken_) FranchiserImmutableState(votingToken_)
```


### getFranchiser (0xf5f2df86)

```solidity
function getFranchiser(
    address owner,
    address delegatee
) public view returns (Franchiser)
```

Looks up the Franchiser associated with the `owner` and `delegatee`.

Returns the address of the Franchiser even it it does not yet exist,
thanks to CREATE2.


Parameters:

| Name      | Type    | Description              |
| :-------- | :------ | :----------------------- |
| owner     | address | The target `owner`.      |
| delegatee | address | The target `delegatee`.  |


Return values:

| Name       | Type                | Description                                            |
| :--------- | :------------------ | :----------------------------------------------------- |
| franchiser | contract Franchiser | The Franchiser contract, whether or not it exists yet. |

### fund (0x7b1837de)

```solidity
function fund(
    address delegatee,
    uint256 amount
) public returns (Franchiser franchiser)
```

Funds the Franchiser contract associated with the `delegatee`
from the sender of the call.

Requires the sender of the call to have approved this contract for `amount`.
If a Franchiser does not yet exist, one is created.


Parameters:

| Name      | Type    | Description                               |
| :-------- | :------ | :---------------------------------------- |
| delegatee | address | The target `delegatee`.                   |
| amount    | uint256 | The amount of `votingToken` to allocate.  |


Return values:

| Name       | Type                | Description              |
| :--------- | :------------------ | :----------------------- |
| franchiser | contract Franchiser | The Franchiser contract. |

### fundMany (0xb6a24b0e)

```solidity
function fundMany(
    address[] calldata delegatees,
    uint256[] calldata amounts
) external returns (Franchiser[] memory franchisers)
```

Calls fund many times.

Requires the sender of the call to have approved this contract for sum of `amounts`.


Parameters:

| Name       | Type      | Description                                |
| :--------- | :-------- | :----------------------------------------- |
| delegatees | address[] | The target `delegatees`.                   |
| amounts    | uint256[] | The amounts of `votingToken` to allocate.  |


Return values:

| Name        | Type                  | Description               |
| :---------- | :-------------------- | :------------------------ |
| franchisers | contract Franchiser[] | The Franchiser contracts. |

### recall (0x19f86ffd)

```solidity
function recall(address delegatee, address to) public
```

Recalls funds in the Franchiser contract associated with the `delegatee`.

No-op if a Franchiser does not exist.


Parameters:

| Name      | Type    | Description                  |
| :-------- | :------ | :--------------------------- |
| delegatee | address | The target `delegatee`.      |
| to        | address | The `votingToken` recipient. |

### recallMany (0x5b145a75)

```solidity
function recallMany(
    address[] calldata delegatees,
    address[] calldata tos
) external
```

Calls recall many times.


Parameters:

| Name       | Type      | Description                   |
| :--------- | :-------- | :---------------------------- |
| delegatees | address[] | The target `delegatees`.      |
| tos        | address[] | The `votingToken` recipients. |

### permitAndFund (0xa1343f37)

```solidity
function permitAndFund(
    address delegatee,
    uint256 amount,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
) external returns (Franchiser)
```

Funds the Franchiser contract associated with the `delegatee`
using a signature.

The signature must have been produced by the sender of the call.
If a Franchiser does not yet exist, one is created.


Parameters:

| Name      | Type    | Description                                                                     |
| :-------- | :------ | :------------------------------------------------------------------------------ |
| delegatee | address | The target `delegatee`.                                                         |
| amount    | uint256 | The amount of `votingToken` to allocate.                                        |
| deadline  | uint256 | A timestamp which the current timestamp must be less than or equal to.          |
| v         | uint8   | Must produce valid secp256k1 signature from the holder along with `r` and `s`.  |
| r         | bytes32 | Must produce valid secp256k1 signature from the holder along with `v` and `s`.  |
| s         | bytes32 | Must produce valid secp256k1 signature from the holder along with `v` and `r`.  |


Return values:

| Name       | Type                | Description              |
| :--------- | :------------------ | :----------------------- |
| franchiser | contract Franchiser | The Franchiser contract. |

### permitAndFundMany (0x8de804a7)

```solidity
function permitAndFundMany(
    address[] calldata delegatees,
    uint256[] calldata amounts,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
) external returns (Franchiser[] memory franchisers)
```

Calls permitAndFund many times.

The permit must be for the sum of `amounts`.


Parameters:

| Name       | Type      | Description                                                                     |
| :--------- | :-------- | :------------------------------------------------------------------------------ |
| delegatees | address[] | The target `delegatees`.                                                        |
| amounts    | uint256[] | The amounts of `votingToken` to allocate.                                       |
| deadline   | uint256   | A timestamp which the current timestamp must be less than or equal to.          |
| v          | uint8     | Must produce valid secp256k1 signature from the holder along with `r` and `s`.  |
| r          | bytes32   | Must produce valid secp256k1 signature from the holder along with `v` and `s`.  |
| s          | bytes32   | Must produce valid secp256k1 signature from the holder along with `v` and `r`.  |


Return values:

| Name        | Type                  | Description               |
| :---------- | :-------------------- | :------------------------ |
| franchisers | contract Franchiser[] | The Franchiser contracts. |
