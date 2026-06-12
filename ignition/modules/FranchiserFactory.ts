import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deploys the FranchiserFactory for the permissionless direct-delegation flow.
 *
 * Required parameters (pass via --parameters or a parameters JSON file):
 *   votingToken  — address of the IVotingToken (checkpoint ERC-20) to delegate
 *
 * Example:
 *  For a Compound deployment
 *   pnpm hardhat ignition deploy ignition/modules/FranchiserFactory.ts \
      --network mainnet \
      --deployment-id franchiser-factory \
      --parameters '{"FranchiserFactory":{"votingToken":"0xc00e94Cb662C3520282E6f5717214004A7f26888"}}'
 */
export default buildModule("FranchiserFactory", (m) => {
    const votingToken = m.getParameter<string>("votingToken");

    const factory = m.contract("FranchiserFactory", [votingToken]);

    return { factory };
});
