import { AlertTriangle, Eye, X, RefreshCw } from "lucide-react";
import PropTypes from "prop-types";

/**
 * DuplicateOrderAlert component
 * Displays an inline alert when user tries to create a duplicate order
 * @param {Object} props
 * @param {string} props.orderId - The existing order ID
 * @param {number} props.amount - The duplicate order amount
 * @param {string} props.orderType - Type of order ('deposit' or 'withdraw')
 * @param {function} props.onViewOrder - Callback to view the existing order
 * @param {function} props.onCancelOrder - Callback to cancel the existing order
 * @param {function} props.onTryDifferentAmount - Callback to reset form
 * @param {function} props.onClose - Callback to close the alert
 */
export default function DuplicateOrderAlert({
  orderId,
  amount,
  orderType = "deposit",
  onViewOrder,
  onCancelOrder,
  onTryDifferentAmount,
  onClose,
}) {
  return (
    <div className="mb-4 p-4 bg-yellow-900/40 border-2 border-yellow-600 rounded-lg shadow-lg">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
          <h4 className="text-yellow-100 font-semibold text-sm">
            Active Order Exists
          </h4>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-yellow-400 hover:text-yellow-200 transition"
            aria-label="Close alert"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Message */}
      <p className="text-yellow-100 text-sm mb-3 leading-relaxed">
        You already have an active {orderType} order with amount{" "}
        <span className="font-semibold">₦{amount.toLocaleString()}</span>.
        Please complete or cancel your existing order{" "}
        <span className="font-semibold">(Order #{String(orderId)})</span> before
        placing a new one with the same amount.
      </p>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {onViewOrder && (
          <button
            onClick={onViewOrder}
            className="flex items-center gap-1.5 bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-medium px-3 py-1.5 rounded-md transition"
          >
            <Eye className="w-3.5 h-3.5" />
            View Order
          </button>
        )}

        {onCancelOrder && (
          <button
            onClick={onCancelOrder}
            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1.5 rounded-md transition"
          >
            <X className="w-3.5 h-3.5" />
            Cancel Order
          </button>
        )}

        {onTryDifferentAmount && (
          <button
            onClick={onTryDifferentAmount}
            className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium px-3 py-1.5 rounded-md transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try Different Amount
          </button>
        )}
      </div>
    </div>
  );
}

DuplicateOrderAlert.propTypes = {
  orderId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  amount: PropTypes.number.isRequired,
  orderType: PropTypes.oneOf(["deposit", "withdraw"]),
  onViewOrder: PropTypes.func,
  onCancelOrder: PropTypes.func,
  onTryDifferentAmount: PropTypes.func,
  onClose: PropTypes.func,
};
