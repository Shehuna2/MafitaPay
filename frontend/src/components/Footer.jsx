export default function Footer() {
  return (
    <footer className="border-t border-gray-700 bg-gray-800 py-4 text-center text-sm text-gray-400 fixed bottom-0 left-0 w-full z-30">
      <p>© {new Date().getFullYear()} Zunhub. All rights reserved.</p>
    </footer>
  );
}