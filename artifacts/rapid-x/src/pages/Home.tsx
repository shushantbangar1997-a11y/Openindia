import CallDispatcher from "@/components/CallDispatcher";
import BulkDialer from "@/components/BulkDialer";
import { Phone, Users, Zap } from "lucide-react";

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
