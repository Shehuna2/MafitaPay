



function VerifyEmailPage() {
  const location = useLocation();
  const email = location.state?.email;

  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState("");

  const resendVerification = async () => {
    setResending(true);
    try {
      await api.post("/auth/resend-verification/", { email });
      setMessage("Verification email resent!");
    } catch {
      setMessage("Failed to resend. Try again later.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-xl font-semibold">Verify your email</h1>
      <p className="mt-2 text-gray-600">
        A verification link has been sent to <strong>{email}</strong>.
      </p>
      <p className="mt-4">Didn’t receive it?</p>
      <button
        onClick={resendVerification}
        disabled={resending}
        className="px-4 py-2 mt-2 text-white bg-blue-600 rounded hover:bg-blue-700"
      >
        {resending ? "Resending..." : "Resend verification email"}
      </button>
      {message && <p className="mt-3 text-sm text-green-600">{message}</p>}
    </div>
  );
}
