import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { ethers } from "ethers";

const FUJI_CHAIN_ID = "0xa869";

export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: any;
}

interface WalletState {
  account: string | null;
  chainId: string | null;
  isConnected: boolean;
  isCorrectNetwork: boolean;
  provider: ethers.BrowserProvider | null;
  connectWallet: () => Promise<void>;
  connectWithProvider: (detail: EIP6963ProviderDetail) => Promise<void>;
  switchToFuji: () => Promise<void>;
  disconnect: () => void;
  availableWallets: EIP6963ProviderDetail[];
  showPicker: boolean;
  setShowPicker: (v: boolean) => void;
}

const WalletContext = createContext<WalletState>({
  account: null,
  chainId: null,
  isConnected: false,
  isCorrectNetwork: false,
  provider: null,
  connectWallet: async () => {},
  connectWithProvider: async () => {},
  switchToFuji: async () => {},
  disconnect: () => {},
  availableWallets: [],
  showPicker: false,
  setShowPicker: () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [rawProvider, setRawProvider] = useState<any>(null);
  const [availableWallets, setAvailableWallets] = useState<EIP6963ProviderDetail[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  // ref so connectWallet closure always sees latest list
  const walletsRef = useRef<EIP6963ProviderDetail[]>([]);

  const isConnected = !!account;
  const isCorrectNetwork = chainId === FUJI_CHAIN_ID;

  // EIP-6963: each wallet extension announces itself via custom event
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<EIP6963ProviderDetail>).detail;
      if (!walletsRef.current.find(w => w.info.uuid === detail.info.uuid)) {
        walletsRef.current = [...walletsRef.current, detail];
        setAvailableWallets([...walletsRef.current]);
      }
    };
    window.addEventListener("eip6963:announceProvider", handler);
    // Ask all installed wallets to announce themselves now
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", handler);
  }, []);

  // Auto-reconnect if user previously authorized this site
  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth) return;
    eth.request({ method: "eth_accounts" })
      .then((accs: string[]) => {
        if (!accs[0]) return;
        return eth.request({ method: "eth_chainId" }).then((chain: string) => {
          setAccount(accs[0]);
          setChainId(chain);
          setRawProvider(eth);
          setProvider(new ethers.BrowserProvider(eth));
        });
      })
      .catch(() => {});

    const onAccounts = (accs: string[]) => {
      setAccount(accs[0] ?? null);
      if (!accs[0]) { setProvider(null); setChainId(null); setRawProvider(null); }
    };
    const onChain = (chain: string) => setChainId(chain);
    eth.on("accountsChanged", onAccounts);
    eth.on("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const connectWithProvider = useCallback(async (detail: EIP6963ProviderDetail) => {
    const eip1193 = detail.provider;
    const accs: string[] = await eip1193.request({ method: "eth_requestAccounts" });
    const chain: string = await eip1193.request({ method: "eth_chainId" });
    setAccount(accs[0] ?? null);
    setChainId(chain);
    setRawProvider(eip1193);
    setProvider(new ethers.BrowserProvider(eip1193));
    setShowPicker(false);

    eip1193.on?.("accountsChanged", (newAccs: string[]) => {
      setAccount(newAccs[0] ?? null);
      if (!newAccs[0]) { setProvider(null); setChainId(null); setRawProvider(null); }
    });
    eip1193.on?.("chainChanged", (c: string) => setChainId(c));
  }, []);

  const connectWallet = useCallback(async () => {
    const wallets = walletsRef.current;

    if (wallets.length === 1) {
      await connectWithProvider(wallets[0]);
      return;
    }
    if (wallets.length > 1) {
      setShowPicker(true);
      return;
    }

    // No EIP-6963 wallets found — fall back to legacy window.ethereum
    const eth = (window as any).ethereum;
    if (!eth) {
      alert("No wallet detected. Install MetaMask or Avalanche Core to continue.");
      return;
    }
    try {
      const accs: string[] = await eth.request({ method: "eth_requestAccounts" });
      const chain: string = await eth.request({ method: "eth_chainId" });
      setAccount(accs[0] ?? null);
      setChainId(chain);
      setRawProvider(eth);
      setProvider(new ethers.BrowserProvider(eth));
    } catch (e: any) {
      if (e.code === 4001) return; // user rejected — silent
      console.error("Wallet connect error:", e);
    }
  }, [connectWithProvider]);

  const switchToFuji = useCallback(async () => {
    const eth = rawProvider ?? (window as any).ethereum;
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
  }, [rawProvider]);

  const disconnect = () => {
    setAccount(null);
    setChainId(null);
    setProvider(null);
    setRawProvider(null);
  };

  return (
    <WalletContext.Provider value={{
      account, chainId, isConnected, isCorrectNetwork, provider,
      connectWallet, connectWithProvider, switchToFuji, disconnect,
      availableWallets, showPicker, setShowPicker,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
