import CallDispatcher from "@/components/CallDispatcher";
import BulkDialer from "@/components/BulkDialer";
import { Phone, BarChart2, Clock, CheckCircle, Zap } from "lucide-react";
import { useCallStats } from "@/lib/agents";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#F4F5F7]">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center shadow-sm shadow-violet-200">
            <Phone className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold text-gray-900">Dispatch</h1>
            <p className="text-xs text-gray-400">Launch outbound calls from your AI assistants</p>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <StatsBar />

      {/* Content */}
      <div className="px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
          <CallDispatcher />
          <BulkDialer />
        </div>
      </div>
    </div>
  );
}

function StatsBar() {
  const { data: stats } = useCallStats(10_000);

  const answeredPct =
    stats && stats.total > 0
      ? Math.round((stats.answered / stats.total) * 100)
      : null;

  const avgDur = stats ? formatMs(stats.avg_duration_ms) : null;

  return (
    <div className="px-8 pt-6 pb-2">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl">
        <StatCard
          icon={<BarChart2 className="w-4 h-4 text-violet-500" />}
          iconBg="bg-violet-50"
          label="Total Calls"
          value={stats ? String(stats.total) : "—"}
        />
        <StatCard
          icon={<CheckCircle className="w-4 h-4 text-emerald-500" />}
          iconBg="bg-emerald-50"
          label="Answer Rate"
          value={answeredPct !== null ? `${answeredPct}%` : "—"}
        />
        <StatCard
          icon={<Clock className="w-4 h-4 text-blue-500" />}
          iconBg="bg-blue-50"
          label="Avg Duration"
          value={avgDur ?? "—"}
        />
        <StatCard
          icon={<Zap className="w-4 h-4 text-amber-500" />}
          iconBg="bg-amber-50"
          label="Active Now"
          value={stats ? String(stats.active_now) : "—"}
          highlight={Boolean(stats && stats.active_now > 0)}
        />
      </div>
    </div>
  );
}

function StatCard({
  icon,
  iconBg,
  label,
  value,
  highlight = false,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`bg-white rounded-2xl border px-5 py-4 flex items-center gap-4 shadow-sm ${
      highlight ? "border-amber-200" : "border-gray-100"
    }`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">{label}</p>
        <p className={`text-xl font-bold leading-tight mt-0.5 ${
          highlight ? "text-amber-600" : "text-gray-900"
        }`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function formatMs(ms: number): string {
  if (ms < 1000) return "0s";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}s`;
  return `${m}m ${r}s`;
}
