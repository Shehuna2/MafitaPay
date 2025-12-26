import React from "react";
import { CreditCard, CheckCircle, Clock, XCircle, AlertCircle } from "lucide-react";

export default function CardDepositCard({ deposit }) {
  const getStatusBadge = (status) => {
    const statusConfig = {
      successful: {
        bg: "bg-green-500/20",
        text: "text-green-400",
        icon: CheckCircle,
        label: "Successful"
      },
      processing: {
        bg: "bg-yellow-500/20",
        text: "text-yellow-400",
        icon: Clock,
        label: "Processing"
      },
      pending: {
        bg: "bg-blue-500/20",
        text: "text-blue-400",
        icon: AlertCircle,
        label: "Pending"
      },
      failed: {
        bg: "bg-red-500/20",
        text: "text-red-400",
        icon: XCircle,
        label: "Failed"
      }
    };

    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <span className={`${config.bg} ${config.text} px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5`}>
        <Icon className="w-3.5 h-3.5" />
        {config.label}
      </span>
    );
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 hover:border-indigo-500/30 transition-all duration-200">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-600/20 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <div className="text-sm text-gray-300 font-medium">
              {deposit.card_brand || "Card"} •••• {deposit.card_last4 || "****"}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {formatDate(deposit.created_at)}
            </div>
          </div>
        </div>
        {getStatusBadge(deposit.status)}
      </div>

      <div className="space-y-2 border-t border-gray-700/50 pt-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Amount Charged:</span>
          <span className="text-white font-medium">
            {deposit.amount} {deposit.currency}
          </span>
        </div>
        
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Exchange Rate:</span>
          <span className="text-gray-300">
            ₦{parseFloat(deposit.exchange_rate || 0).toFixed(2)}
          </span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Fees Deducted:</span>
          <span className="text-red-400">
            -₦{(parseFloat(deposit.flutterwave_fee || 0) + parseFloat(deposit.platform_margin || 0)).toFixed(2)}
          </span>
        </div>

        <div className="flex justify-between text-sm pt-2 border-t border-gray-700/50">
          <span className="text-gray-400 font-medium">You Received:</span>
          <span className="text-green-400 font-bold text-base">
            ₦{parseFloat(deposit.ngn_amount || 0).toFixed(2)}
          </span>
        </div>

        {deposit.flutterwave_tx_ref && (
          <div className="text-xs text-gray-500 pt-2">
            Ref: {deposit.flutterwave_tx_ref}
          </div>
        )}
      </div>
    </div>
  );
}
