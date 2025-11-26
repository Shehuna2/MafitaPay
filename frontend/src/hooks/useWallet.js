import { useState, useEffect, useRef, useCallback } from "react";
import client from "../api/client";

export default function useWallet(provider) {
  const cacheRef = useRef({});
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  const fetchWallet = useCallback(async (force = false) => {
    if (!provider) return;
    if (cacheRef.current[provider] && !force) {
      setWallet(cacheRef.current[provider]);
      return;
    }

    setLoading(true);
    try {
      const res = await client.get(`/wallet/?provider=${provider}`);
      const payload = {
        van_account_number: res?.data?.van_account_number || null,
        van_bank_name: res?.data?.van_bank_name || null,
        van_account_name: res?.data?.van_account_name || null,
        van_provider: res?.data?.van_provider || provider,
        type: res?.data?.type || null,
      };
      cacheRef.current[provider] = payload;
      setWallet(payload);
    } catch (err) {
      setWallet(null);
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    if (!provider) return;

    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchWallet();
    }
  }, [provider]);

  return {
    wallet,
    loading,
    refresh: () => fetchWallet(true),
  };
}
