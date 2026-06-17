# IFranchiserErrors

## Overview

#### License: GPL-3.0-or-later

```solidity
interface IFranchiserErrors
```


## Errors info

### NotDelegatee

```solidity
error NotDelegatee(address caller, address delegatee)
```

Thrown when an address other than the `delegatee` attempts to call a
function restricted to the `delegatee`.


Parameters:

| Name      | Type    | Description                           |
| :-------- | :------ | :------------------------------------ |
| caller    | address | The address that attempted the call.  |
| delegatee | address | The `delegatee`.                      |

### NoDelegatee

```solidity
error NoDelegatee()
```

Thrown when attempting to initialize an OwnedDelegator contract with
a `delegatee` address of 0.
### AlreadyInitialized

```solidity
error AlreadyInitialized()
```

Thrown when attempting to set the `delegatee` more than once.
### CannotExceedMaximumSubDelegatees

```solidity
error CannotExceedMaximumSubDelegatees(uint256 maximumSubDelegatees)
```

Thrown when attempting to add too many `subDelegatees`.


Parameters:

| Name                 | Type    | Description                                          |
| :------------------- | :------ | :--------------------------------------------------- |
| maximumSubDelegatees | uint256 | The maximum (and current) number of `subDelegatees`. |

### ArrayLengthMismatch

```solidity
error ArrayLengthMismatch(uint256 length0, uint256 length1)
```

Emitted when two array arguments have different cardinalities.


Parameters:

| Name    | Type    | Description                              |
| :------ | :------ | :--------------------------------------- |
| length0 | uint256 | The length of the first array argument.  |
| length1 | uint256 | The length of the second array argument. |
