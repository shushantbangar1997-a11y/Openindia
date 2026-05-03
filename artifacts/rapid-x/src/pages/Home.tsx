import CallDispatcher from "@/components/CallDispatcher";
import BulkDialer from "@/components/BulkDialer";

export default function Home() {
  return (
    <main className="z-10 px-4 py-10 flex flex-col items-center">
      <header className="text-center space-y-3 animate-in fade-in slide-in-from-top-4 duration-500 mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-purple-300">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          System Online
        </div>
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight">
          Dispatch a call
        </h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto font-light">
          Pick an agent, drop in a phone number, and watch it talk.
        </p>
      </header>

      <div className="flex flex-col md:flex-row gap-8 w-full justify-center items-start max-w-5xl">
        <CallDispatcher />
        <BulkDialer />
      </div>
    </main>
  );
}
