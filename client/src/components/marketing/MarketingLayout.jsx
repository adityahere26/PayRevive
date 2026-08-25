import { Outlet } from "react-router-dom";
import { MarketingHeader } from "./MarketingHeader.jsx";
import { MarketingFooter } from "./MarketingFooter.jsx";
import { PageTransition } from "../motion/PageTransition.jsx";

// The public site's shell — a completely different header/footer from the authenticated
// app's Layout.jsx (marketing nav vs. product nav), but the same design tokens (index.css),
// so moving from marketing -> signup -> product never feels like switching applications.
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
