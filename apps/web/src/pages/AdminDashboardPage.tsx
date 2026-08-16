import { useEffect, useState } from "react";
import { getAdminDashboard, type AdminDashboard, type SignupGranularity } from "../lib/adminApi";
import AdminStatsGrid from "../components/AdminStatsGrid";
import SignupsChart from "../components/SignupsChart";

export default function AdminDashboardPage() {
  const [granularity, setGranularity] = useState<SignupGranularity>("week");
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    getAdminDashboard(granularity).then((result) => {
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error);
      }
    });
  }, [granularity]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-400">Users, subscriptions, and shares at a glance</p>
      </div>

      {error && (
        <div className="mt-6 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {data === null && !error && <div className="mt-6 text-sm text-neutral-500">Loading…</div>}

      {data && (
        <>
          <div className="mt-6">
            <AdminStatsGrid stats={data.stats} />
          </div>

          <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                Signups
              </p>
              <div className="flex overflow-hidden rounded border border-neutral-700 text-xs">
                <button
                  type="button"
                  onClick={() => setGranularity("week")}
                  className={`px-2.5 py-1 ${
                    granularity === "week"
                      ? "bg-emerald-500 text-neutral-950"
                      : "text-neutral-400 hover:bg-neutral-800"
                  }`}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  onClick={() => setGranularity("month")}
                  className={`px-2.5 py-1 ${
                    granularity === "month"
                      ? "bg-emerald-500 text-neutral-950"
                      : "text-neutral-400 hover:bg-neutral-800"
                  }`}
                >
                  Monthly
                </button>
              </div>
            </div>
            <div className="mt-3">
              <SignupsChart buckets={data.signups} granularity={granularity} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
