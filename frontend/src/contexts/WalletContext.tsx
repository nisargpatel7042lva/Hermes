import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { ethers } from "ethers";

const FUJI_CHAIN_ID = "0xa869";

interface WalletState {
  account: string | null;
  chainId: string | null;
  isConnected: boolean;
  isCorrectNetwork: boolean;
  provider: ethers.BrowserProvider | null;
  connectWallet: () => Promise<void>;
  switchToFuji: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  account: null,
  chainId: null,
  isConnected: false,
  isCorrectNetwork: false,
  provider: null,
  connectWallet: async () => {},
  switchToFuji: async () => {},
  disconnect: () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);

  const isConnected = !!account;
  const isCorrectNetwork = chainId === FUJI_CHAIN_ID;

  const init = (accounts: string[], chain: string) => {
    setAccount(accounts[0] ?? null);
    setChainId(chain);
    if (accounts[0] && (window as any).ethereum) {
      setProvider(new ethers.BrowserProvider((window as any).ethereum));
    }
  };

  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth) return;

    eth.request({ method: "eth_accounts" }).then((accs: string[]) => {
      if (accs.length > 0) {
        eth.request({ method: "eth_chainId" }).then((chain: string) => init(accs, chain));
      }
    });

    const onAccounts = (accs: string[]) => {
      setAccount(accs[0] ?? null);
      if (!accs[0]) { setProvider(null); setChainId(null); }
    };
    const onChain = (chain: string) => setChainId(chain);

    eth.on("accountsChanged", onAccounts);
    eth.on("chainChanged", onChain);
    return () => {
      eth.removeListener("accountsChanged", onAccounts);
      eth.removeListener("chainChanged", onChain);
    };
  }, []);

  const connectWallet = async () => {
    const eth = (window as any).ethereum;
    if (!eth) { alert("MetaMask not detected. Please install it."); return; }
    const accs = await eth.request({ method: "eth_requestAccounts" });
    const chain = await eth.request({ method: "eth_chainId" });
    init(accs, chain);
  };

  const switchToFuji = async () => {
    const eth = (window as any).ethereum;
    if (!eth) return;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: FUJI_CHAIN_ID }] });
    } catch (e: any) {
      if (e.code === 4902) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: FUJI_CHAIN_ID,
            chainName: "Avalanche Fuji Testnet",
            nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 },
            rpcUrls: ["https://api.avax-test.network/ext/bc/C/rpc"],
            blockExplorerUrls: ["https://testnet.snowtrace.io"],
          }],
        });
      }
    }
  };

  const disconnect = () => {
    setAccount(null);
    setChainId(null);
    setProvider(null);
  };

  return (
    <WalletContext.Provider value={{ account, chainId, isConnected, isCorrectNetwork, provider, connectWallet, switchToFuji, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
