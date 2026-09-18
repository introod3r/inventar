import { Loader2 } from "lucide-react";

export function PageLoader({ message = "Učitavanje stranice..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] w-full p-8 space-y-4 animate-in fade-in duration-300">
      <div className="relative flex items-center justify-center">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 animate-pulse">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
        </div>
        <div className="absolute inset-0 rounded-2xl bg-emerald-500/5 blur-xl -z-10" />
      </div>
      <p className="text-sm font-medium text-slate-400 tracking-wide">{message}</p>
    </div>
  );
}
