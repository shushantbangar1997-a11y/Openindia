import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Bot,
  Phone,
  History,
  Settings,
  ChevronRight,
  Zap,
  LayoutDashboard,
} from "lucide-react";
import Home from "@/pages/Home";
import Agents from "@/pages/Agents";
import Calls from "@/pages/Calls";
import SettingsPage from "@/pages/Settings";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, staleTime: 5_000 },
  },
});

const navItems = [
  { to: "/agents", label: "Assistants", icon: Bot },
  { to: "/", label: "Dispatch", icon: Phone },
  { to: "/calls", label: "Call History", icon: History },
];

function Sidebar() {
  const [path] = useLocation();
  return (
    <aside className="w-[220px] min-h-screen bg-[#0D0D1F] flex flex-col shrink-0 border-r border-white/[0.06]">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-900/40">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-white font-bold text-sm leading-none">Rapid X</div>
            <div className="text-[10px] text-purple-400/80 mt-0.5 font-medium">Voice AI</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-4 space-y-0.5">
        <div className="px-3 py-1.5 mb-2">
          <span className="text-[10px] uppercase tracking-widest text-white/25 font-semibold">Platform</span>
        </div>
        {navItems.map(({ to, label, icon: Icon }) => {
          const active = path === to || (to !== "/" && path.startsWith(to));
          return (
            <Link key={to} href={to}>
              <div
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all group ${
                  active
                    ? "bg-violet-600/20 text-white border border-violet-500/20"
                    : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${active ? "text-violet-400" : "text-white/30 group-hover:text-white/60"}`}
                />
                {label}
                {active && (
                  <ChevronRight className="w-3 h-3 ml-auto text-violet-400/60" />
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-2.5 py-4 border-t border-white/[0.06]">
        <Link href="/settings">
          <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-all ${
            path === "/settings"
              ? "bg-violet-600/20 text-white border border-violet-500/20"
              : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
          }`}>
            <Settings className={`w-4 h-4 ${path === "/settings" ? "text-violet-400" : ""}`} />
            Settings
          </div>
        </Link>
        <div className="mt-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white text-xs font-bold">
              R
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white/80 truncate">My Workspace</div>
              <div className="text-[10px] text-white/30">Free Plan</div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-[#F4F5F7] font-sans">
      <Sidebar />
      <div className="flex-1 min-h-screen overflow-auto">
        {children}
      </div>
    </div>
  );
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/agents" component={Agents} />
        <Route path="/calls" component={Calls} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
