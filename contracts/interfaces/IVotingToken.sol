// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import { IVotes } from "@openzeppelin/contracts/governance/utils/IVotes.sol";

/// @title Interface for voting tokens (see https://docs.openzeppelin.com/contracts/4.x/api/token/erc20#ERC20Votes).
interface IVotingToken is IERC20, IERC20Permit, IVotes {

}
