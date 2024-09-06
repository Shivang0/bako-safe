import axios, { AxiosInstance } from 'axios';

import {
  defaultConfig,
  AuthRequestHeaders,
  IUserCreate,
  ISignTransactionRequest,
  ICreateTransactionPayload,
  IPredicatePayload,
} from './types';

// todo:
//  - rename correctly methods
//  - add type to methods

// keep here to sinc with the other files
export const api = axios.create({
  baseURL: defaultConfig.serverUrl,
});

// - static: non authenticated methods
//     - create: create a user
//     - sign: sign a challenge
// - instance: authenticated methods
export class Service {
  private api: AxiosInstance;
  private address?: string;
  private token?: string;

  constructor({ address, token }: { address?: string; token?: string }) {
    this.api = api;
    this.address = address;
    this.token = token;

    this.api.interceptors.request.use((config) => {
      config.headers[AuthRequestHeaders.SIGNER_ADDRESS] = this.address;
      config.headers[AuthRequestHeaders.AUTHORIZATION] = this.token;

      return config;
    });
  }

  // ------------------------ AUTH METHODS ------------------------
  async getWorkspaces() {
    const { data } = await this.api.get('/workspace/by-user');
    return data;
  }

  async getToken() {
    const { data } = await this.api.get('/user/latest/tokens');

    return data;
  }

  async createPredicate(payload: IPredicatePayload) {
    const { data } = await this.api.post('/predicate', payload);

    return data;
  }

  async findByAddress(predicateAddress: string) {
    const { data } = await this.api.get(
      `/predicate/by-address/${predicateAddress}`,
    );
    return data;
  }

  async findById(predicateId: string) {
    const { data } = await this.api.get(`/predicate/${predicateId}`);

    return data;
  }

  async authInfo() {
    const { data } = await this.api.get('/user/latest/info');
    return data;
  }

  async createTransaction(params: ICreateTransactionPayload) {
    const { data } = await this.api.post('/transaction', params);
    return data;
  }

  async findTransactionByHash(_hash: string) {
    const hash = _hash.startsWith('0x') ? _hash : `0x${_hash}`;
    const { data } = await this.api.get(`/transaction/by-hash/${hash}`);
    return data;
  }

  public async signTransaction(params: ISignTransactionRequest) {
    const { hash, ...rest } = params;
    const { data } = await this.api.put(
      `/transaction/sign/${params.hash}`,
      rest,
    );

    return data;
  }

  public async sendTransaction(hash: string) {
    const { data } = await this.api.post(`/transaction/send/${hash}`);

    return data;
  }

  // ------------------------ STATIC METHODS ------------------------
  static async create(params: IUserCreate) {
    const { data } = await api.post('/user', params);
    return data;
  }

  // remove typeUser:
  //  - se o usuário for to tipo FUEL, só poderá se autenticar como fuel
  // - se o usuário for do tipo WEB_AUTHN, só poderá se autenticar como WEB_AUTHN
  static async sign(params: {
    signature: string;
    encoder: string;
    digest: string;
  }) {
    const { data } = await api.post('/auth/sign-in', params);
    return data;
  }
}
