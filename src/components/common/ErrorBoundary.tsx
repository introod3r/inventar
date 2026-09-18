import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full glass-card p-6 md:p-8 rounded-2xl border border-rose-500/30 shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-400">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-bold text-slate-100">Došlo je do neočekivane greške</h1>
              <p className="text-xs text-slate-400">
                Aplikacija je naišla na problem pri prikazu ovog dela interfejsa.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl text-left font-mono text-[11px] text-rose-300 max-h-32 overflow-y-auto break-all">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Button
                variant="outline"
                className="border-slate-800 hover:bg-slate-800 text-slate-300 gap-2"
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                <RefreshCw className="w-4 h-4" /> Pokušaj ponovo
              </Button>
              <Button
                className="bg-rose-600 hover:bg-rose-500 text-white gap-2"
                onClick={this.handleReset}
              >
                <Home className="w-4 h-4" /> Idi na Početnu
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
