// File: src/hooks/useDvaFlow.js
// purpose: manage the step-machine and API actions for DVA creation + requery
import { useState, useCallback } from "react";
import client from "../api/client";

const PROVIDER_CONFIG = {
  paystack: { preferredBank: "titan-paystack", requerySlug: "titan-paystack" },
  flutterwave: { preferredBank: "wema-bank", requerySlug: "9psb" },
  "9psb": { preferredBank: "9psb", requerySlug: "9psb" },
};

export default function useDvaFlow(initialProvider = "paystack") {
  const [provider, setProvider] = useState(initialProvider);
  const [preferredBank, setPreferredBank] = useState(PROVIDER_CONFIG[initialProvider]?.preferredBank || "wema-bank");
  const [bvnOrNin, setBvnOrNin] = useState("");
  const [step, setStep] = useState("choose"); // choose | bank | bvn | confirm | done
  const [loading, setLoading] = useState(false);
  const [requeryLoading, setRequeryLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastResponse, setLastResponse] = useState(null);

  const toStep = (s) => { setError(null); setStep(s); };

  const changeProvider = (p) => {
    setProvider(p);
    setPreferredBank(PROVIDER_CONFIG[p]?.preferredBank || "wema-bank");
    setBvnOrNin("");
    toStep("choose");
  };

  const validateBvn = (val) => {
    const onlyDigits = String(val || "").replace(/\D/g, "");
    return onlyDigits.length === 11;
  };

  const generateDva = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const payload = {
        provider,
        preferred_bank: provider === "paystack" ? PROVIDER_CONFIG.paystack.preferredBank : preferredBank,
      };
      if (provider === "flutterwave" && bvnOrNin) payload.bvn_or_nin = bvnOrNin;
      const res = await client.post("/wallet/dva/generate/", payload);
      if (res?.data?.success) {
        setLastResponse({
          account_number: res.data.account_number,
          bank_name: res.data.bank_name,
          account_name: res.data.account_name,
          type: res.data.type || "dynamic",
        });
        toStep("done");
        return { success: true, data: res.data };
      }
      setError(res?.data?.message || "Failed to generate account");
      return { success: false };
    } catch (err) {
      setError(err?.response?.data?.message || "Network error");
      return { success: false };
    } finally {
      setLoading(false);
    }
  }, [provider, preferredBank, bvnOrNin]);

  const requery = useCallback(async ({ account_number, date }) => {
    setError(null);
    setRequeryLoading(true);
    try {
      await client.post("/wallet/dva/requery/", {
        account_number,
        provider_slug: provider === "paystack" ? PROVIDER_CONFIG.paystack.requerySlug : PROVIDER_CONFIG[provider]?.requerySlug || provider,
        date,
      });
      return { success: true };
    } catch (err) {
      setError("Requery failed");
      return { success: false };
    } finally {
      setRequeryLoading(false);
    }
  }, [provider, preferredBank]);

  return {
    // state
    provider,
    preferredBank,
    bvnOrNin,
    step,
    loading,
    requeryLoading,
    error,
    lastResponse,
    // actions
    setProvider: changeProvider,
    setPreferredBank,
    setBvnOrNin,
    toStep,
    validateBvn,
    generateDva,
    requery,
  };
}
