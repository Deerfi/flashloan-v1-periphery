pragma solidity =0.6.6;

interface IFlashLoanReceiver {
    function executeOperation(
        address asset,
        uint amount,
        uint premium,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}
