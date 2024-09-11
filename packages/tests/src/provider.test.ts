import { Address, bn, Provider, Wallet } from 'fuels';

import { accounts, assets, networks } from './mocks';
import {
  BakoProvider,
  Vault,
  bakoCoder,
  SignatureType,
} from '../../sdk/src/modules/';
import { sendCoins, signin } from './utils';
import mockAuthService from './mocks/api/auth';
import {
  ICreateTransactionPayload,
  IPredicatePayload,
  ISignTransactionRequest,
  TypeUser,
} from 'bakosafe';

jest.mock('../../sdk/src/modules/service', () => {
  // Carrega o valor real de TypeUser
  const actualService = jest.requireActual('../../sdk/src/modules/service');

  let predicates = {};
  let transactions = {};

  // Mock da classe Service
  const mockService = jest.fn().mockImplementation(() => ({
    // Métodos de instância mockados
    getWorkspaces: jest
      .fn()
      .mockResolvedValue([
        { workspace: 'mocked_workspace_1' },
        { workspace: 'mocked_workspace_2' },
      ]),

    getToken: jest.fn().mockResolvedValue([
      [assets['ETH'], bn(1)],
      [assets['DAI'], bn(1)],
    ]),

    createPredicate: jest
      .fn()
      .mockImplementation((params: IPredicatePayload) => {
        const { predicateAddress, configurable } = params;
        predicates[predicateAddress] = configurable;
        return {
          predicateAddress,
          configurable,
        };
      }),

    findByAddress: jest.fn().mockImplementation((predicateAddress: string) => {
      return {
        predicateAddress,
        configurable: JSON.parse(predicates[predicateAddress]),
      };
    }),

    authInfo: jest.fn().mockResolvedValue({
      id: '123456',
      type: TypeUser.FUEL, // ou qualquer tipo que corresponda ao enum TypeUser
      avatar: 'https://example.com/avatar.png',
      address: accounts['USER_1'].account,
      onSingleWorkspace: true,
      workspace: {
        id: 'workspace123',
        name: 'Workspace Name',
        avatar: 'https://example.com/workspace-avatar.png',
        permission: {
          read: 'granted',
          write: 'denied',
        },
      },
    }),

    createTransaction: jest
      .fn()
      .mockImplementation((params: ICreateTransactionPayload) => {
        const { hash, txData, predicateAddress } = params;
        transactions[hash] = {
          ...txData,
          witnesses: [],
          predicateAddress,
        };

        return {
          transactionId: hash,
        };
      }),

    findTransactionByHash: jest.fn().mockImplementation((hash: string) => {
      return {
        txData: transactions[hash],
      };
    }),

    signTransaction: jest
      .fn()
      .mockImplementation(async (params: ISignTransactionRequest) => {
        const { signature, hash } = params;

        let tx = transactions[hash.slice(2)];

        tx = {
          ...tx,
          witnesses: [...tx.witnesses, signature],
        };

        const predicate = predicates[tx.predicateAddress];
        const predicateConfig = JSON.parse(predicate);

        if (tx.witnesses.length >= predicateConfig.SIGNATURES_COUNT) {
          const vault = new Vault(
            await Provider.create(networks['LOCAL']),
            predicateConfig,
          );
          await vault.send(tx);
        }
        return true;
      }),

    // verifique os requisitos
    // envie a transação
    sendTransaction: jest.fn().mockImplementation(async (hash: string) => {
      let tx = transactions[hash.slice(2)];

      let predicate = predicates[tx.predicateAddress];

      if (tx.witnesses.length >= predicate.SIGNATURES_COUNT) {
        const vault = new Vault(
          await Provider.create(networks['LOCAL']),
          JSON.parse(predicate.configurable),
        );
        await vault.send(tx.txData);
      }
      return true;
    }),
  }));

  // Métodos estáticos da classe Service
  mockService.create = jest
    .fn()
    .mockResolvedValue({ code: 'mocked_challenge' });

  // set signature
  // verify signature requirements
  // send transaction
  mockService.sign = jest
    .fn()
    .mockImplementation(async (params: ISignTransactionRequest) => {
      return;
    });

  return {
    // Retorna o mock da classe com métodos estáticos e de instância
    Service: mockService,
    // Mantém TypeUser real
    TypeUser: actualService.TypeUser,
    TransactionStatus: actualService.TransactionStatus,
  };
});

describe('[AUTH]', () => {
  it('Should authenticate successfully with a valid token', async () => {
    const address = accounts['USER_1'].account;

    const challenge = await BakoProvider.setup({
      address,
    });

    const token = await Wallet.fromPrivateKey(
      accounts['USER_1'].privateKey,
    ).signMessage(challenge);

    const vaultProvider = await BakoProvider.create(networks['LOCAL'], {
      address,
      challenge,
      token,
    });

    // try an authenticated request
    const tokens = await vaultProvider.service.getToken();

    expect(vaultProvider).toBeDefined();
    expect(vaultProvider.options.address).toBe(address);
    expect(vaultProvider.options.token).toBe(token);
    expect(vaultProvider.options.challenge).toBe(challenge);
    expect(tokens).toBeDefined();
    expect(tokens.length).toBeGreaterThan(0);
  });

  it('Should retrieve all user workspaces successfully', async () => {
    const address = accounts['USER_1'].account;

    const challenge = await BakoProvider.setup({
      address,
    });

    const token = await Wallet.fromPrivateKey(
      accounts['USER_1'].privateKey,
    ).signMessage(challenge);

    const vaultProvider = await BakoProvider.create(networks['LOCAL'], {
      address,
      challenge,
      token,
    });

    const workspaces = await vaultProvider.service.getWorkspaces();
    expect(workspaces).toBeDefined();
    expect(workspaces.length).toBeGreaterThanOrEqual(0);
  });

  it('Should retrieve current authentication information', async () => {
    const address = accounts['USER_1'].account;

    const challenge = await BakoProvider.setup({
      address,
    });

    const token = await Wallet.fromPrivateKey(
      accounts['USER_1'].privateKey,
    ).signMessage(challenge);

    const vaultProvider = await BakoProvider.create(networks['LOCAL'], {
      address,
      challenge,
      token,
    });

    const authInfo = await vaultProvider.service.authInfo();

    expect(authInfo).toBeDefined();
    expect(authInfo.address).toBe(address);
    expect(authInfo.workspace).toBeDefined();
    expect(authInfo.onSingleWorkspace).toBe(true);
  });

  it('Should store a vault successfully', async () => {
    const address = accounts['USER_1'].account;

    const challenge = await BakoProvider.setup({
      address,
    });

    const token = await Wallet.fromPrivateKey(
      accounts['USER_1'].privateKey,
    ).signMessage(challenge);

    const vaultProvider = await BakoProvider.create(networks['LOCAL'], {
      address,
      challenge,
      token,
    });

    const predicate = new Vault(vaultProvider, {
      SIGNATURES_COUNT: 1,
      SIGNERS: [address],
      HASH_PREDICATE: Address.fromRandom().toB256(),
    });

    const saved = await predicate.save();

    expect(saved).toBeDefined();
    expect(saved.predicateAddress).toBeDefined();
    expect(saved.predicateAddress.length).toBeGreaterThan(0);
    expect(saved.predicateAddress).toBe(predicate.address.toB256());
  });

  it('Should recover a vault successfully', async () => {
    const address = accounts['USER_1'].account;

    const challenge = await BakoProvider.setup({
      address,
    });

    const token = await Wallet.fromPrivateKey(
      accounts['USER_1'].privateKey,
    ).signMessage(challenge);

    const vaultProvider = await BakoProvider.create(networks['LOCAL'], {
      address,
      challenge,
      token,
    });

    const predicate = new Vault(vaultProvider, {
      SIGNATURES_COUNT: 1,
      SIGNERS: [address],
      HASH_PREDICATE: Address.fromRandom().toB256(),
    });

    const saved = await predicate.save();

    const balanceValue = '0.1';
    await sendCoins(predicate.address.toB256(), balanceValue, assets['ETH']);

    const recover = await Vault.fromAddress(
      saved.predicateAddress,
      vaultProvider,
    );

    const predicateBalance = await predicate.getBalance(assets['ETH']);
    const recoverBalance = await recover.getBalance(assets['ETH']);

    // 18 is max of decimals to represent value
    expect(predicate.address.toB256()).toBe(recover.address.toB256());
    expect(predicateBalance.formatUnits(18)).toBe(
      recoverBalance.formatUnits(18),
    );
  });

  it('Should save a transaction to the service', async () => {
    const address = accounts['USER_1'].account;

    const challenge = await BakoProvider.setup({
      address,
    });

    const token = await Wallet.fromPrivateKey(
      accounts['USER_1'].privateKey,
    ).signMessage(challenge);

    const vaultProvider = await BakoProvider.create(networks['LOCAL'], {
      address,
      challenge,
      token,
    });

    const predicate = new Vault(vaultProvider, {
      SIGNATURES_COUNT: 1,
      SIGNERS: [address],
      HASH_PREDICATE: Address.fromRandom().toB256(),
    });

    // how to create a predicate on database on the instance time
    const saved = await predicate.save();

    const balanceValue = '0.3';
    await sendCoins(predicate.address.toB256(), balanceValue, assets['ETH']);

    const recover = await Vault.fromAddress(
      saved.predicateAddress,
      vaultProvider,
    );

    const { hashTxId } = await recover.transaction([
      {
        to: Address.fromRandom().toB256(),
        amount: '0.1',
        assetId: assets['ETH'],
      },
    ]);

    const recoveredTx = await predicate.transactionFromHash(hashTxId);

    expect(recoveredTx).toBeDefined();
    expect(recoveredTx.hashTxId).toBe(hashTxId);
  });

  it('Should sign vault with the provider (1:1 signature)', async () => {
    const address = accounts['USER_1'].account;

    const challenge = await BakoProvider.setup({
      address,
    });

    const token = await Wallet.fromPrivateKey(
      accounts['USER_1'].privateKey,
    ).signMessage(challenge);

    const vaultProvider = await BakoProvider.create(networks['LOCAL'], {
      address,
      challenge,
      token,
    });

    const predicate = new Vault(vaultProvider, {
      SIGNATURES_COUNT: 1,
      SIGNERS: [address],
      HASH_PREDICATE: Address.fromRandom().toB256(),
    });

    // how to create a predicate on database on the instance time
    const saved = await predicate.save();

    const balanceValue = '0.3';
    await sendCoins(predicate.address.toB256(), balanceValue, assets['ETH']);

    const vaultRecover = await Vault.fromAddress(
      saved.predicateAddress,
      vaultProvider,
    );

    const { hashTxId, tx } = await vaultRecover.transaction([
      {
        to: Address.fromRandom().toB256(),
        amount: '0.1',
        assetId: assets['ETH'],
      },
    ]);

    await vaultProvider.signTransaction({
      hash: `0x${hashTxId}`,
      signature: bakoCoder.encode({
        type: SignatureType.Fuel,
        signature: await signin(hashTxId, 'USER_1'),
      }),
    });

    const response = await predicate.send(tx);
    const res = await response.wait();

    expect(res).toBeDefined();
  }, 10000);

  it('Should fail to send transaction before signing', async () => {
    const address = accounts['USER_1'].account;

    const challenge = await BakoProvider.setup({
      address,
    });

    const token = await Wallet.fromPrivateKey(
      accounts['USER_1'].privateKey,
    ).signMessage(challenge);

    const vaultProviderClient1 = await BakoProvider.create(networks['LOCAL'], {
      address,
      challenge,
      token,
    });

    const predicate = new Vault(vaultProviderClient1, {
      SIGNATURES_COUNT: 1,
      SIGNERS: [address],
      HASH_PREDICATE: Address.fromRandom().toB256(),
    });

    // how to create a predicate on database on the instance time
    const saved = await predicate.save();
    const balanceValue = '0.3';
    await sendCoins(predicate.address.toB256(), balanceValue, assets['ETH']);

    const vaultRecover = await Vault.fromAddress(
      saved.predicateAddress,
      vaultProviderClient1,
    );

    const { hashTxId, tx } = await vaultRecover.transaction([
      {
        to: Address.fromRandom().toB256(),
        amount: '0.1',
        assetId: assets['ETH'],
      },
    ]);

    const response = await predicate.send(tx);

    await vaultProviderClient1.signTransaction({
      hash: `0x${hashTxId}`,
      signature: bakoCoder.encode({
        type: SignatureType.Fuel,
        signature: await signin(hashTxId, 'USER_1'),
      }),
    });

    const res = await response.wait();

    expect(res).toBeDefined();
  });
});
