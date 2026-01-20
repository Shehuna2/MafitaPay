import { Link } from "react-router-dom";

const policySections = [
  {
    title: "Information we collect",
    details: [
      "Account data such as your name, email address, phone number, and verification details.",
      "Transaction data including wallet activity, bill payments, crypto orders, and rewards history.",
      "Device and usage data like IP address, browser type, and in-app interactions to keep the service secure.",
    ],
  },
  {
    title: "How we use your information",
    details: [
      "Provide and improve MafitaPay services, including compliance checks and fraud prevention.",
      "Process payments, crypto transactions, and customer support requests.",
      "Send essential notifications such as security alerts, verification emails, and service updates.",
    ],
  },
  {
    title: "How we share information",
    details: [
      "With payment processors, verification partners, and infrastructure providers that help run the app.",
      "When required by law, regulation, or to protect MafitaPay and our community.",
      "We never sell your personal data.",
    ],
  },
  {
    title: "Data retention",
    details: [
      "We keep personal data only as long as needed for legal, regulatory, or operational purposes.",
      "You can request deletion of eligible data by contacting support.",
    ],
  },
  {
    title: "Your choices and rights",
    details: [
      "Access and update your account information in-app.",
      "Request a copy or deletion of your personal data by contacting support.",
      "Opt out of non-essential communications at any time.",
    ],
  },
  {
    title: "Security",
    details: [
      "We use encryption, access controls, and monitoring to protect your information.",
      "No method of transmission is 100% secure, but we continually improve safeguards.",
    ],
  },
  {
    title: "Children's privacy",
    details: [
      "MafitaPay is not directed to children under 18, and we do not knowingly collect their data.",
    ],
  },
  {
    title: "Changes to this policy",
    details: [
      "We may update this policy and will post the latest version here with a new effective date.",
    ],
  },
];

export default function PrivacyPolicy() {
  return (
    <div className="max-w-5xl mx-auto py-12 text-gray-200">
      <div className="mb-10">
        <p className="text-sm uppercase tracking-[0.3em] text-indigo-300">Privacy</p>
        <h1 className="text-4xl md:text-5xl font-semibold text-white mt-3">MafitaPay Privacy Policy</h1>
        <p className="text-gray-400 mt-4 max-w-3xl">
          This Privacy Policy explains how MafitaPay collects, uses, and protects your information when you
          use our website, mobile app, and related services. By using MafitaPay, you agree to the practices
          described here.
        </p>
        <p className="text-xs text-gray-500 mt-3">Effective date: March 1, 2025</p>
      </div>

      <div className="grid gap-8">
        {policySections.map((section) => (
          <section key={section.title} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6">
            <h2 className="text-2xl font-semibold text-white mb-3">{section.title}</h2>
            <ul className="space-y-2 text-gray-300 list-disc pl-5">
              {section.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="mt-10 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-6">
        <h2 className="text-2xl font-semibold text-white">Contact us</h2>
        <p className="text-gray-300 mt-2">
          Questions about privacy? Reach us at{' '}
          <a className="text-indigo-300 hover:text-indigo-200" href="mailto:privacy@mafitapay.com">
            privacy@mafitapay.com
          </a>.
        </p>
        <p className="text-gray-400 mt-4 text-sm">
          You can also review our <Link className="text-indigo-300 hover:text-indigo-200" to="/about">About</Link>{' '}
          page for more details about MafitaPay.
        </p>
      </section>
    </div>
  );
}
