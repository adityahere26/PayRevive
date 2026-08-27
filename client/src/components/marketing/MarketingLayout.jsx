import { Outlet } from "react-router-dom";
import { MarketingHeader } from "./MarketingHeader.jsx";
import { MarketingFooter } from "./MarketingFooter.jsx";
import { PageTransition } from "../motion/PageTransition.jsx";

// The public site's shell — a completely different header/footer from the product's
// Layout.jsx (marketing nav vs. product nav), but the same design tokens (index.css), so
// moving from the marketing site -> "Enter Demo" -> product never feels like switching apps.
export default function MarketingLayout() {
  return (
    <div className="flex min-h-screen flex-col text-brand-900">
      <MarketingHeader />
      <main className="flex-1">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
      <MarketingFooter />
    </div>
  );
}
