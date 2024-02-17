/* Autogenerated file. Do not edit manually. */

/* tslint:disable */
/* eslint-disable */

/*
  Fuels version: 0.73.0
  Forc version: 0.49.2
  Fuel-Core version: 0.22.0
*/

import type {
  BigNumberish,
  BN,
  BytesLike,
  Contract,
  DecodedValue,
  FunctionFragment,
  Interface,
  InvokeFunction,
} from 'fuels';

export type PredicateAbiConfigurables = {
  SIGNERS: [string, string, string, string, string, string, string, string, string, string];
  SIGNATURES_COUNT: BigNumberish;
  HASH_PREDICATE: [BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish];
};

interface PredicateAbiInterface extends Interface {
  functions: {
    main: FunctionFragment;
  };

  encodeFunctionData(functionFragment: 'main', values: []): Uint8Array;

  decodeFunctionData(functionFragment: 'main', data: BytesLike): DecodedValue;
}

export class PredicateAbi extends Contract {
  interface: PredicateAbiInterface;
  functions: {
    main: InvokeFunction<[], boolean>;
  };
}
