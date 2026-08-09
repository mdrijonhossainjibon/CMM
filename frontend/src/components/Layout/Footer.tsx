export default function Footer() {
  return (
    <footer className="border-t border-dark-border px-3 sm:px-4 lg:px-6 py-3 lg:py-4 text-center">
      <p className="text-[10px] sm:text-xs text-dark-text">
        CaptchaMaster AI Trainer v2.0 &copy; {new Date().getFullYear()}
      </p>
    </footer>
  );
}
