import { Link, useLocation } from "wouter";
import { Bot, Phone, History, Sparkles } from "lucide-react";

const tabs = [
  { to: "/", label: "Dispatch", icon: Phone },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/calls", label: "Calls", icon: History },
];

export default function Nav() {
  const [path] = useLocation();
  return (
    <nav className="z-20 w-full px-6 py-4 flex items-center justify-between border-b border-white/5 bg-black/40 backdrop-blur-xl">
      <Link href="/" className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-purple-400" />
        <span className="text-lg font-bold tracking-tight">
          <span className="text-white">Rapid X</span>
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500">
            {" "}AI
          </span>
        </span>
      </Link>
      <div className="flex items-center gap-1">
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = path === to || (to !== "/" && path.startsWith(to));
          return (
            <Link
              key={to}
              href={to}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                active
                  ? "bg-white/10 text-white"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
