import { Subject } from 'rxjs';
import worldAbi from '../mud/worldAbi.js';
import { writeMudRecord, removeMudRecord } from '../state/ecs-context.js';

let mudDepsPromise = null;

function loadMudDependencies() {
  if (!mudDepsPromise) {
    mudDepsPromise = new Promise((resolve, reject) => {
      const req = typeof require !== 'undefined' ? require : null;
      const context = req && req.s && req.s.contexts ? req.s.contexts._ : null;
      const hasStoreSync = !!(context && context.config && context.config.paths && context.config.paths['@latticexyz/store-sync']);
      if (!hasStoreSync) {
        reject(new Error('[mud-client] Browser bundle for @latticexyz/store-sync/viem is not available yet.'));
        return;
      }
      req(['@latticexyz/store-sync', 'viem'], (storeSync, viem) => {
        if (!storeSync || !viem) {
          reject(new Error('Failed to load mud dependencies'));
          return;
        }
        resolve({
          createStoreSync: storeSync.createStoreSync,
          logToRecord: storeSync.logToRecord,
          logToTable: storeSync.logToTable,
          isTableRegistrationLog: storeSync.isTableRegistrationLog,
          mudTables: storeSync.mudTables,
          createPublicClient: viem.createPublicClient,
          createWalletClient: viem.createWalletClient,
          privateKeyToAccount: viem.privateKeyToAccount,
          custom: viem.custom,
          http: viem.http,
          webSocket: viem.webSocket
        });
      }, reject);
    });
  }
  return mudDepsPromise;
}

export async function createMudClient({ rpcUrl, wsUrl, worldAddress, chainId = 31337, privateKey }) {
  if (!rpcUrl || !wsUrl || !worldAddress) {
    throw new Error('[mud-client] Missing rpcUrl/wsUrl/worldAddress');
  }

  const {
    createStoreSync,
    logToRecord,
    logToTable,
    isTableRegistrationLog,
    mudTables,
    createPublicClient,
    createWalletClient,
    privateKeyToAccount,
    custom,
    http
  } = await loadMudDependencies();

  const wrapInjectedTransport = (provider) => {
    if (!provider) {
      return null;
    }
    if (typeof custom === 'function') {
      return custom(provider);
    }
    return ({ retryDelay = 150, timeout } = {}) => ({
      key: 'injected-provider',
      name: 'Injected Provider',
      type: 'custom',
      retryDelay,
      timeout,
      request: (args) => provider.request(args)
    });
  };

  const chain = {
    id: chainId,
    name: 'mud',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } }
  };

  const transport = http(rpcUrl);

  const publicClient = createPublicClient({
    chain,
    transport
  });

  let walletClient = null;
  let walletAccount = null;

  if (privateKey) {
    walletAccount = privateKeyToAccount(privateKey);
    walletClient = createWalletClient({
      account: walletAccount,
      chain,
      transport
    });
  }

  const tableRegistry = new Map();
  if (mudTables) {
    Object.values(mudTables).forEach((table) => {
      if (table && table.tableId) {
        tableRegistry.set(table.tableId, table);
      }
    });
  }

  const subject = new Subject();
  const storageAdapter = async (block) => {
    const logs = Array.isArray(block?.logs) ? block.logs : [];
    for (const log of logs) {
      if (isTableRegistrationLog && isTableRegistrationLog(log)) {
        const table = logToTable ? logToTable(log) : null;
        if (table && table.tableId) {
          tableRegistry.set(table.tableId, table);
          subject.next({
            type: 'tableRegistration',
            table,
            blockNumber: block.blockNumber
          });
        }
        continue;
      }
      const table = tableRegistry.get(log?.args?.tableId);
      if (!table) {
        subject.next({ type: 'unknownTable', log });
        continue;
      }
      const keyTuple = Array.isArray(log?.args?.keyTuple) ? log.args.keyTuple : [];
      if (log.eventName === 'Store_DeleteRecord') {
        removeMudRecord(table.tableId, keyTuple);
        subject.next({
          type: 'delete',
          table,
          keyTuple,
          blockNumber: block.blockNumber
        });
        continue;
      }
      if (typeof logToRecord === 'function') {
        try {
          const record = logToRecord({ table, log });
          writeMudRecord({
            tableId: table.tableId,
            tableName: `${table.namespace || ''}/${table.name || ''}`,
            keyTuple,
            record
          });
          subject.next({
            type: 'record',
            table,
            keyTuple,
            record,
            blockNumber: block.blockNumber
          });
        } catch (err) {
          subject.next({ type: 'decodeError', error: err, log, table });
        }
      }
    }
  };

  const syncClient = await createStoreSync({
    address: worldAddress,
    publicClient,
    storageAdapter,
    startBlock: 0n
  });

  const subscription = syncClient.storedBlockLogs$.subscribe(() => {});

  const onSync = (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }
    const sub = subject.subscribe(callback);
    return () => sub.unsubscribe();
  };

  return {
    components: null,
    onSync,
    stop: () => {
      subscription.unsubscribe();
    },
    connectWallet: async (opts = {}) => {
      if (opts.privateKey) {
        walletAccount = privateKeyToAccount(opts.privateKey);
        walletClient = createWalletClient({
          account: walletAccount,
          chain,
          transport
        });
        return walletAccount;
      }
      if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error('No injected wallet available');
      }
      const injectedTransport = wrapInjectedTransport(window.ethereum);
      const injectedClient = createWalletClient({
        chain,
        transport: injectedTransport
      });
      const addresses = await injectedClient.requestAddresses();
      if (!Array.isArray(addresses) || addresses.length === 0) {
        throw new Error('No accounts returned');
      }
      walletAccount = addresses[0];
      walletClient = injectedClient;
      return walletAccount;
    },
    writeSystem: walletClient && walletAccount
      ? (functionName, args) =>
          walletClient.writeContract({
            address: worldAddress,
            abi: worldAbi,
            functionName,
            args,
            account: walletAccount
          })
      : null
  };
}
