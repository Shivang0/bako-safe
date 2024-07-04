import { BaseTransfer, BaseTransferLike } from './BaseTransfer';
import {
  bn,
  Wallet,
  hexlify,
  Provider,
  ZeroBytes32,
  ContractUtils,
  TransactionCreate,
  transactionRequestify,
  CreateTransactionRequest,
  ScriptTransactionRequest,
} from 'fuels';
import { IBakoSafeAuth, ITransaction, TransactionService, TransactionStatus } from '../../api';

import { Vault } from '../vault';

/* Types */
type BaseDeployTransfer = BaseTransferLike<CreateTransactionRequest>;
type DeployTransferFromTransaction =
  TransactionCreate
  &
  Omit<BaseDeployTransfer, 'transactionRequest' | 'witnesses' | 'service' | 'BakoSafeTransaction' | 'BakoSafeTransactionId'>
  &
  { auth?: IBakoSafeAuth };
type DeployTransferTransactionRequest = TransactionCreate & Pick<BaseDeployTransfer, 'vault'>;
type DeployBakoTransaction = {
  auth: IBakoSafeAuth;
  vault: DeployTransferFromTransaction['vault'];
} & ITransaction;

const { getContractId, getContractStorageRoot } = ContractUtils;

/* TODO: Move this method to vault */
const getMaxPredicateGasUsed = async (provider: Provider, signers: number) => {
  const wallets = Array.from({ length: signers }, () => Wallet.generate({ provider }));
  const vault = await Vault.create({
    configurable: {
      SIGNATURES_COUNT: signers,
      SIGNERS: wallets.map(wallet => wallet.address.toB256()),
      network: provider.url,
    }
  });
  const request = new ScriptTransactionRequest();
  request.addCoinInput({
    id: ZeroBytes32,
    assetId: ZeroBytes32,
    amount: bn(),
    owner: vault.address,
    blockCreated: bn(),
    txCreatedIdx: bn(),
  });
  vault.populateTransactionPredicateData(request);

  const txId = request.getTransactionId(provider.getChainId());
  const signatures = await Promise.all(wallets.map(wallet => wallet.signMessage(txId.slice(2))));
  signatures.forEach(signature => request.addWitness(signature));
  await vault.provider.estimatePredicates(request);
  const predicateInput = request.inputs[0];
  if (predicateInput && 'predicate' in predicateInput) {
    return bn(predicateInput.predicateGasUsed);
  }
  return bn();
};

/**
 * `DeployTransfer` are extension of CreateTransactionRequest, to create and deploy contracts
 */
export class DeployTransfer extends BaseTransfer<CreateTransactionRequest> {
  /**
   * Static method to create a new instance of DeployTransfer from a BakoTransaction.
   *
   * @param {DeployBakoTransaction} options - The parameters for creating a DeployTransfer.
   * @returns {DeployTransfer} A new instance of DeployTransfer.
   */
  static async fromBakoTransaction(options: DeployBakoTransaction) {
    const { auth, vault, ...bakoTransaction } = options;
    const createTransactionRequest = CreateTransactionRequest.from(bakoTransaction.txData);
    const witnesses = bakoTransaction.witnesses.map((witness) => witness.signature);

    return new DeployTransfer({
      vault,
      name: bakoTransaction.name,
      witnesses: [...witnesses, ...(bakoTransaction.resume?.witnesses ?? [])],
      service: new TransactionService(auth),
      transactionRequest: createTransactionRequest,
      BakoSafeTransaction: bakoTransaction,
      BakoSafeTransactionId: bakoTransaction.id
    });
  }

  /**
   * Static method to create a new instance of DeployTransfer from a TransactionCreate.
   *
   * @param {DeployTransferFromTransaction} options - The parameters for creating a DeployTransfer.
   * @returns {Promise<DeployTransfer>} A new instance of DeployTransfer.
   */
  static async fromTransactionCreate(options: DeployTransferFromTransaction): Promise<DeployTransfer> {
    const {
      name,
      vault,
      witnesses,
      auth,
      ...transaction
    } = options;
    const transactionRequest = await this.createTransactionRequest({ witnesses, vault, ...transaction });
    const deployTransfer = new DeployTransfer({
      name,
      vault,
      transactionRequest,
      witnesses: witnesses.map(witness => witness.data)
    });

    if (auth) {
      deployTransfer.service = new TransactionService(auth);
    }

    return deployTransfer;
  }

  /**
   * Static method to create a TransactionRequest for a DeployTransfer.
   * @param {DeployTransferTransactionRequest} options - The parameters for creating a TransactionRequest.
   * @param {Vault} options.vault - The vault associated with the transfer.
   * @param {Input[]} options.inputs - The inputs for the transfer.
   * @param {Witness[]} options.witnesses - The witnesses for the transfer.
   * @param {TransactionCreate} options.transaction - The transaction to be used for the transfer.
   * @returns {Promise<CreateTransactionRequest>} A new instance of CreateTransactionRequest.
   */
  static async createTransactionRequest(options: DeployTransferTransactionRequest): Promise<CreateTransactionRequest> {
    const { vault: account, inputs, witnesses, ...transaction } = options;

    const bytecode = witnesses[transaction.bytecodeWitnessIndex];
    let transactionRequest = CreateTransactionRequest.from({
      witnesses: [bytecode.data],
      bytecodeWitnessIndex: transaction.bytecodeWitnessIndex,
      salt: transaction.salt,
      storageSlots: transaction.storageSlots,
      outputs: transaction.outputs,
      inputs: []
    });

    const fee = await getMaxPredicateGasUsed(account.provider, account.BakoSafeVault.minSigners);
    transactionRequest.maxFee = fee.add(10);

    const transactionCost = await account.provider.getTransactionCost(transactionRequest);
    transactionRequest = await account.fund(transactionRequest, transactionCost);

    return transactionRequest;
  }

  /**
   * Store the current transaction in server.
   *
   * @throws {Error} If the transaction has already been saved or if the service is not available.
   * @returns {Promise<DeployTransfer>} The current instance of DeployTransfer.
   */
  async save() {
    if (this.BakoSafeTransactionId || this.BakoSafeTransaction) {
      throw new Error('Transaction already saved.');
    }

    if (!this.service) {
      throw new Error('Auth is required to save the transaction.');
    }

    const coinInputs = this.transactionRequest.getCoinInputs();
    const transactionData = await this.service.create({
      assets: coinInputs.map(input => ({
        to: hexlify(input.owner),
        assetId: hexlify(input.assetId),
        amount: bn(input.amount).format(),
      })),
      hash: this.getHashTxId(),
      txData: transactionRequestify(this.transactionRequest),
      status: TransactionStatus.AWAIT_REQUIREMENTS,
      predicateAddress: this.vault.address.toString(),
      name: this.name
    });

    this.BakoSafeTransaction = transactionData;
    this.BakoSafeTransactionId = transactionData.id;

    return this;
  }

  /**
   * Gets the contract ID for the current transaction request.
   * This method first converts the transaction request to a transaction.
   * It then retrieves the bytecode from the transaction's witnesses.
   * Finally, it calls the getContractId function with the bytecode, the transaction's salt, and the storage root of the transaction's storage slots.
   * @returns {string} The contract ID.
   */
  getContractId(): string {
    const transaction = this.transactionRequest.toTransaction();
    const bytecode = transaction.witnesses[transaction.bytecodeWitnessIndex].data;

    return getContractId(
      bytecode,
      transaction.salt,
      getContractStorageRoot(transaction.storageSlots)
    );
  }
}