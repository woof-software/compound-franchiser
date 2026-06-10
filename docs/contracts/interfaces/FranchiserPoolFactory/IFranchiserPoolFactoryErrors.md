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
