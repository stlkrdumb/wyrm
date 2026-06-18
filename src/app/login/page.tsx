"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Authentication failed");
      }

      router.push("/config");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-obsidian-dark p-4 font-mono">
      <Card className="w-full max-w-sm border border-obsidian-border bg-obsidian-lighter/50 shadow-2xl">
        <CardHeader>
          <CardTitle className="text-center w-full">Wyrm Core Access</CardTitle>
        </CardHeader>
        <CardContent className="mt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider text-zinc-500">
                ADMIN PASSCODE
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded border border-obsidian-border bg-obsidian-dark px-3 py-2 text-center text-sm text-white focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                autoFocus
                disabled={loading}
              />
            </div>

            {error && (
              <div className="rounded border border-rose-500/20 bg-rose-500/10 p-2 text-center text-[11px] text-rose-400">
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full justify-center"
              disabled={loading}
            >
              {loading ? "AUTHENTICATING..." : "AUTHORIZE ACCESS"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
