// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.6.6;

interface IFlashBorrowerLike {
  function deerfiV1Call(address _sender, uint _amount, bytes calldata _data) external;
}
