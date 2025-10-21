// src/components/Receipt.jsx
import { XCircle, Copy, Download, Share2, CheckCircle } from "lucide-react";
import { jsPDF } from "jspdf";

export default function Receipt({ type, data, onClose }) {
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
  } = data;
  const date = new Date().toLocaleString();

  const statusColors = {
    success: "bg-green-500/20 text-green-400",
    failed: "bg-red-500/20 text-red-400",
    pending: "bg-yellow-500/20 text-yellow-400",
  };

  // ✅ Title
  const getTitle = () => {
    if (type === "airtime") return "Airtime Receipt";
    if (type === "data") return "Data Receipt";
    if (type === "crypto") return `${crypto || "Crypto"} Receipt`;
    return "Transaction Receipt";
  };

  // ✅ Shorten hash for UI
  const shortenHash = (hash) => {
    if (!hash) return "N/A";
    return hash.length > 12
      ? `${hash.slice(0, 6)}...${hash.slice(-6)}`
      : hash;
  };

  // ✅ Text for sharing
  const receiptText = `
${getTitle()}
Status: ${status}
Reference: ${reference || "N/A"}
${
  type === "crypto"
    ? `Wallet: ${wallet_address}\nCrypto: ${crypto}\nTx Hash: ${
        tx_hash || "N/A"
      }`
    : `Phone: ${phone}\nNetwork: ${network}`
}
Amount: ₦${amount}
Date: ${date}
  `.trim();

  // ✅ Copy receipt or hash
  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    alert("📋 Copied to clipboard");
  };

  // ✅ PDF export
  const handleDownload = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(getTitle(), 20, 20);
    doc.setFontSize(12);
    doc.text(`Status: ${status}`, 20, 40);
    doc.text(`Reference: ${reference || "N/A"}`, 20, 50);

    if (type === "crypto") {
      doc.text(`Wallet: ${wallet_address}`, 20, 60);
      doc.text(`Crypto: ${crypto}`, 20, 70);
      doc.text(`Tx Hash: ${tx_hash || "N/A"}`, 20, 80);
      doc.text(`Amount: ₦${amount}`, 20, 90);
      doc.text(`Date: ${date}`, 20, 100);
    } else {
      doc.text(`Phone: ${phone}`, 20, 60);
      doc.text(`Network: ${network}`, 20, 70);
      doc.text(`Amount: ₦${amount}`, 20, 80);
      doc.text(`Date: ${date}`, 20, 90);
    }

    doc.save(`${type}-receipt-${reference || Date.now()}.pdf`);
  };

  // WhatsApp share
  const handleShareWhatsApp = () => {
    if (navigator.share) {
      navigator.share({
        title: getTitle(),
        text: receiptText,
      })
        .then(() => alert("📋 Receipt shared successfully"))
        .catch(() => alert("❌ Failed to share receipt"));
    } else {
      const url = `https://wa.me/?text=${encodeURIComponent(receiptText)}`;
      window.open(url, "_blank");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 text-white w-full max-w-md rounded-xl shadow-lg p-6 relative animate-fade-in">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
        >
          <XCircle className="w-6 h-6" />
        </button>

        {/* Status icon */}
        <div className="flex justify-center mb-4">
          {status === "success" ? (
            <CheckCircle className="w-16 h-16 text-green-500 animate-bounce" />
          ) : status === "failed" ? (
            <XCircle className="w-16 h-16 text-red-500 animate-pulse" />
          ) : (
            <Share2 className="w-16 h-16 text-yellow-500 animate-pulse" />
          )}
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold mb-2 text-center">{getTitle()}</h2>
        <p
          className={`text-center text-sm font-semibold mb-4 inline-block px-3 py-1 rounded-full ${
            statusColors[status] || "bg-gray-500/20 text-gray-400"
          }`}
        >
          {status}
        </p>

        {/* Details */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Reference</span>
            <span className="font-mono">{reference || "N/A"}</span>
          </div>

          {type === "crypto" ? (
            <>
              <div className="flex justify-between">
                <span className="text-gray-400">Wallet</span>
                <span className="font-mono truncate max-w-[60%]">
                  {wallet_address}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Crypto</span>
                <span>{crypto}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Tx Hash</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono">{shortenHash(tx_hash)}</span>
                  {tx_hash && (
                    <Copy
                      className="w-4 h-4 cursor-pointer text-gray-400 hover:text-white"
                      onClick={() => handleCopy(tx_hash)}
                    />
                  )}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between">
                <span className="text-gray-400">Phone</span>
                <span>{phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Network</span>
                <span className="capitalize">{network}</span>
              </div>
            </>
          )}

          <div className="flex justify-between">
            <span className="text-gray-400">Amount</span>
            <span className="font-semibold">₦{amount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Date</span>
            <span>{date}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-between items-center flex-wrap gap-2">
          <button
            onClick={() => handleCopy(receiptText)}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm"
          >
            <Copy className="w-4 h-4" /> Copy
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm"
          >
            <Download className="w-4 h-4" /> PDF
          </button>
          <button
            onClick={handleShareWhatsApp}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm"
          >
            <Share2 className="w-4 h-4" /> WhatsApp
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
