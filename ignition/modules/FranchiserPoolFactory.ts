import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deploys the FranchiserPoolFactory for the governance-controlled pool-delegation flow.
 *
 * Required parameters (pass via --parameters or a parameters JSON file):
 *   votingToken  — address of the IVotingToken (checkpoint ERC-20) to delegate
 *   governance   — address that will own the factory and control all pool operations
 *
 * Pools are created after deployment via governance proposals that call createPool()
 * on the factory. The factory's createPool() is restricted to the governance address,
 * so it cannot be called from this deployment script.
 *
 * Example:
 *  For a Compound deployment
 *   pnpm hardhat ignition deploy ignition/modules/FranchiserPoolFactory.ts \
      --network mainnet \
      --deployment-id franchiser-pool-factory \
      --parameters '{"FranchiserPoolFactory":{"votingToken":"0xc00e94Cb662C3520282E6f5717214004A7f26888","governance":"0x309a862bbC1A00e45506cB8A802D1ff10004c8C0"}}'
 */
export default buildModule("FranchiserPoolFactory", (m) => {
    const votingToken = m.getParameter<string>("votingToken");
    const governance = m.getParameter<string>("governance");

    const factory = m.contract("FranchiserPoolFactory", [votingToken, governance]);

    return { factory };
});
 