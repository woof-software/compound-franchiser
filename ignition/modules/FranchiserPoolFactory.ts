import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deploys the Franchiser implementation and the FranchiserPoolFactory for the
 * governance-controlled pool-delegation flow.
 *
 * Required parameters (set in ignition/parameters/FranchiserPoolFactory.json):
 *   votingToken  — address of the IVotingToken (checkpoint ERC-20) used by the
 *                  Franchiser implementation. Must match the COMP address
 *                  hardcoded as `votingToken` in FranchiserPoolFactory.sol, since
 *                  every pool's franchisers are clones of this implementation.
 *
 * Governance is hardcoded in the contract as the Compound timelock:
 *   0x6d903f6003cca6255D85CcA4D3B5E5146dC33925
 *
 * Pools are created after deployment via governance proposals that call createPool()
 * on the factory. The factory's createPool() is restricted to the governance address,
 * so it cannot be called from this deployment script.
 */
export default buildModule("FranchiserPoolFactory", (m) => {
    const votingToken = m.getParameter<string>("votingToken");

    const franchiserImplementation = m.contract("Franchiser", [votingToken]);
    const factory = m.contract("FranchiserPoolFactory", [franchiserImplementation]);

    return { franchiserImplementation, factory };
});
