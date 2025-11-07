import { XCircle, Copy, Download, Share2, CheckCircle, Clock, Zap, Smartphone, ExternalLink } from "lucide-react";
import { jsPDF } from "jspdf";
import { useState } from "react";

export default function Receipt({ type, data, onClose }) {
  const [copied, setCopied] = useState(null);

  if (!data) return null;

  const {
    status,
    amount,
    phone,
    network,
    reference,
    wallet_address,
    crypto,
    tx_hash,
    created_at,
  } = data;

  const date = created_at ? new Date(created_at).toLocaleString() : new Date().toLocaleString();

  const statusConfig = {
    success: { color: "text-green-400", bg: "bg-green-500/20", icon: <CheckCircle className="w-12 h-12" /> },
    failed: { color: "text-red-400", bg: "bg-red-500/20", icon: <XCircle className="w-12 h-12" /> },
    pending: { color: "text-yellow-400", bg: "bg-yellow-500/20", icon: <Clock className="w-12 h-12" /> },
  };

  const config = statusConfig[status] || statusConfig.pending;

  const getTitle = () => {
    if (type === "airtime") return "Airtime Purchase";
    if (type === "data") return "Data Bundle";
    if (type === "crypto") return `${crypto || "Crypto"} Purchase`;
    return "Transaction Receipt";
  };

  const shortenHash = (hash) => {
    if (!hash) return "N/A";
    return hash.length > 12 ? `${hash.slice(0, 6)}...${hash.slice(-6)}` : hash;
  };

  const receiptText = `
${getTitle()}
Status: ${status.toUpperCase()}
Reference: ${reference || "N/A"}
${type === "crypto" ? `Wallet: ${wallet_address}\nCrypto: ${crypto}\nTx Hash: ${tx_hash || "N/A"}` : `Phone: ${phone}\nNetwork: ${network}`}
Amount: ₦${parseFloat(amount).toLocaleString()}
Date: ${date}
`.trim();

  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDownload = () => {
    const doc = new jsPDF();
    const lineHeight = 10;
    let y = 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(getTitle(), 20, y);
    y += lineHeight;

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Status: ${status.toUpperCase()}`, 20, y);
    y += lineHeight;
    doc.text(`Reference: ${reference || "N/A"}`, 20, y);
    y += lineHeight;

    if (type === "crypto") {
      doc.text(`Wallet: ${wallet_address}`, 20, y);
      y += lineHeight;
      doc.text(`Crypto: ${crypto}`, 20, y);
      y += lineHeight;
      doc.text(`Tx Hash: ${tx_hash || "N/A"}`, 20, y);
      y += lineHeight;
    } else {
      doc.text(`Phone: ${phone}`, 20, y);
      y += lineHeight;
      doc.text(`Network: ${network}`, 20, y);
      y += lineHeight;
    }

    doc.text(`Amount: ₦${parseFloat(amount).toLocaleString()}`, 20, y);
    y += lineHeight;
    doc.text(`Date: ${date}`, 20, y);

    doc.save(`${type}-receipt-${reference || Date.now()}.pdf`);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: getTitle(), text: receiptText }).catch(() => {});
    } else {
      const url = `https://wa.me/?text=${encodeURIComponent(receiptText)}`;
      window.open(url, "_blank");
    }
  };

  const getExplorerUrl = () => {
    if (!tx_hash || type !== "crypto") return null;
    const explorers = {
      BNB: "https://bscscan.com/tx/",
      ETH: "https://etherscan.io/tx/",
      "BASE-ETH": "https://basescan.org/tx/",
      SOL: "https://solscan.io/tx/",
      TON: "https://tonscan.org/tx/",
      NEAR: "https://explorer.near.org/transactions/",
      BTC: "https://mempool.space/tx/",
    };
    const networkKey = network?.toUpperCase();
    const baseUrl = explorers[networkKey];
    return baseUrl ? `${baseUrl}${tx_hash}` : null;
  };

  const explorerUrl = getExplorerUrl();

  return (
    <>
      <style jsx>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up { animation: fade-in-up 0.4s ease-out; }
        @keyframes pulse-check {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
        .pulse-check { animation: pulse-check 0.6s ease-out; }
      `}</style>

      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-700/50 w-full max-w-md p-6 relative animate-fade-in-up">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition"
          >
            <XCircle className="w-6 h-6" />
          </button>

          {/* Status Icon */}
          <div className="flex justify-center mb-5">
            <div className={`${config.color} animate-bounce`}>
              {config.icon}
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-center mb-2 text-indigo-300">{getTitle()}</h2>
          <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full ${config.bg} ${config.color} text-sm font-semibold mx-auto block w-fit mb-5`}>
            <div className="w-2 h-2 rounded-full bg-current animate-pulse"></div>
            {status.toUpperCase()}
          </div>

          {/* 👇 Added crypto logo display (only for crypto receipts) */}
          {type === "crypto" && crypto && (
            <div className="flex justify-center mb-4">
              <img
                src={`/images/${crypto.toLowerCase()}.png`}
                alt={crypto}
                onError={(e) => (e.target.src = "/images/default.png")}
                className="w-16 h-16 object-contain rounded-full border border-indigo-500/40 bg-gray-900 p-2"
              />
            </div>
          )}

          {/* Details Grid */}
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Reference</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-indigo-300">{reference || "N/A"}</span>
                {reference && (
                  <button
                    onClick={() => handleCopy(reference, "ref")}
                    className="text-gray-500 hover:text-indigo-400 transition"
                  >
                    {copied === "ref" ? <CheckCircle className="w-4 h-4 text-green-400 pulse-check" /> : <Copy className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>

            {type === "crypto" ? (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Wallet</span>
                  <span className="font-mono text-indigo-300 truncate max-w-[60%]">{wallet_address}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Crypto</span>
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <span className="font-medium">{crypto}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Tx Hash</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-indigo-300">{shortenHash(tx_hash)}</span>
                    {tx_hash && (
                      <>
                        <button
                          onClick={() => handleCopy(tx_hash, "hash")}
                          className="text-gray-500 hover:text-indigo-400 transition"
                        >
                          {copied === "hash" ? <CheckCircle className="w-4 h-4 text-green-400 pulse-check" /> : <Copy className="w-4 h-4" />}
                        </button>
                        {explorerUrl && (
                          <a
                            href={explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-400 hover:text-indigo-300"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Phone</span>
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-indigo-400" />
                    <span>{phone}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Network</span>
                  <span className="capitalize font-medium">{network}</span>
                </div>
              </>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-gray-700">
              <span className="text-gray-400">Amount</span>
              <span className="text-xl font-bold text-green-400">₦{parseFloat(amount).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Date</span>
              <span className="text-sm text-gray-300">{date}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => handleCopy(receiptText, "full")}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm font-medium transition"
            >
              {copied === "full" ? <CheckCircle className="w-4 h-4 text-green-400 pulse-check" /> : <Copy className="w-4 h-4" />}
              Copy All
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-medium transition"
            >
              <Download className="w-4 h-4" />
              PDF
            </button>
            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 rounded-xl text-sm font-medium transition"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-xl text-sm font-medium transition"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
