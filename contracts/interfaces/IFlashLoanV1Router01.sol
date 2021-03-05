pragma solidity >=0.6.2;

import './IFlashLoanV1Router.sol';

interface IFlashLoanV1Router01 is IFlashLoanV1Router {
    function flashLoan(
        address token,
        address target,
        uint amount,
        uint deadline,
        bytes calldata data
    ) external;
}
