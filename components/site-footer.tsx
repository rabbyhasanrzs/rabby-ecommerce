import CopyrightYear from "@/components/copyright-year";
import Link from "next/link";

const SHOP_LINKS = [
  { href: "/sunglasses", label: "Sunglasses" },
  { href: "/sunglasses?view=new-arrivals", label: "New Arrivals" },
  { href: "/sunglasses?view=best-sellers", label: "Best Sellers" },
  { href: "/orders", label: "Track Order" },
] as const;

const HELP_LINKS = [
  { href: "/help", label: "Help & FAQ" },
  { href: "/returns", label: "Returns & Exchange" },
  { href: "/guide/face-shape", label: "Face-Shape Guide" },
  { href: "/contact", label: "Contact" },
] as const;

const ABOUT_LINKS = [
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms & Conditions" },
] as const;

/**
 * Site footer — Final Approved Design Blueprint, Sections 6.2 and 7.1.
 * Groups: Shop / Help / About / Contact. Payment line is text only
 * (no gateway chosen yet). Contact details and social links are demo
 * placeholders until the owner provides verified details (S-5).
 */
export default function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-8 px-4 py-12 md:grid-cols-4 md:px-8">
        <nav aria-label="Shop">
          <h2 className="mb-4 text-base font-semibold text-text">Shop</h2>
          <ul className="space-y-2.5">
            {SHOP_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-base text-text-secondary hover:text-action"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Help">
          <h2 className="mb-4 text-base font-semibold text-text">Help</h2>
          <ul className="space-y-2.5">
            {HELP_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-base text-text-secondary hover:text-action"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="About">
          <h2 className="mb-4 text-base font-semibold text-text">About</h2>
          <ul className="space-y-2.5">
            {ABOUT_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-base text-text-secondary hover:text-action"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="mb-4 text-base font-semibold text-text">Contact</h2>
          <p className="text-base leading-relaxed text-text-secondary">
            Contact details — demo placeholder. WhatsApp, Messenger, phone,
            and email links coming in S-5.
          </p>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-text-secondary md:px-8">
          <p>
            Payment methods: Cash on Delivery · bKash · Nagad · Rocket ·
            Debit/Credit Card · Online Payment Gateway (demo configuration)
          </p>
          <p>Follow us: Facebook · Instagram · X (links coming soon)</p>
          <p>
            © <CopyrightYear /> Rabby
          </p>
        </div>
      </div>
    </footer>
  );
}
