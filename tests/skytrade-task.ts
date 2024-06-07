import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { SkytradeTask } from '../target/types/skytrade_task';

describe('skytrade-task', () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.SkytradeTask as Program<SkytradeTask>;
  // create collection
  before(async function () {
    //Upload Picture to metapels
  });
  // Create tree
  it('Is initialized!', async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log('Your transaction signature', tx);
  });
});
