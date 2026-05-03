import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Nav from "@/components/Nav";
import Home from "@/pages/Home";
import Agents from "@/pages/Agents";
import Calls from "@/pages/Calls";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, staleTime: 5_000 },
  },
});

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#050505] text-white relative overflow-hidden selection:bg-purple-500/30">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10vh] left-[20vw] w-[50vh] h-[50vh] bg-blue-600/20 rounded-full blur-[128px] animate-pulse" />
        <div className="absolute bottom-[-10vh] right-[20vw] w-[60vh] h-[60vh] bg-purple-600/15 rounded-full blur-[128px] animate-pulse delay-1000" />
      </div>
      <Nav />
      {children}
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
