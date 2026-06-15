# IFranchiserPoolFactoryErrors

## Overview

#### License: GPL-3.0-or-later

```solidity
interface IFranchiserPoolFactoryErrors
```


## Errors info

### NotGovernance

```solidity
error NotGovernance(address caller, address governance)
```

Thrown when an address other than governance attempts to call a governance-restricted function.


Parameters:

| Name       | Type    | Description                           |
| :--------- | :------ | :------------------------------------ |
| caller     | address | The address that attempted the call.  |
| governance | address | The governance address.               |

### UnknownPool

```solidity
error UnknownPool(address pool)
```

Thrown when an address is not a pool created by this factory.


Parameters:

| Name | Type    | Description                    |
| :--- | :------ | :----------------------------- |
| pool | address | The unrecognized pool address. |

### ZeroAddress

```solidity
error ZeroAddress()
```

Thrown when a required address argument is the zero address.
### ArrayLengthMismatch

```solidity
error ArrayLengthMismatch()
```

Thrown when array arguments have mismatched lengths.
### ZeroAmount

```solidity
error ZeroAmount()
```

Thrown when a required amount argument is zero.
### MaxDelegateesExceeded

```solidity
error MaxDelegateesExceeded(uint256 count, uint256 maximum)
```

Thrown when the delegatees array exceeds the pool's maximum delegatee cap.


Parameters:

| Name    | Type    | Description                               |
| :------ | :------ | :---------------------------------------- |
| count   | uint256 | The number of delegatees provided.        |
| maximum | uint256 | The maximum number of delegatees allowed. |
