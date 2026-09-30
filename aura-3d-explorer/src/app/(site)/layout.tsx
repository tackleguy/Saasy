/**
 * Site chrome — header and footer around every public page.
 * (The /render route lives outside this group so it can draw the bare scene.)
 */
import SiteHeader from "@/components/site/SiteHeader";
import SiteFooter from "@/components/site/SiteFooter";
import { AssistantBridgeProvider } from "@/components/assistant/AssistantBridge";
import AssistantPanel from "@/components/assistant/AssistantPanel";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <AssistantBridgeProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter />
      <AssistantPanel />
    </AssistantBridgeProvider>
  );
}
